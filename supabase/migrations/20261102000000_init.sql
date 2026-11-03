-- =====================================================================
-- Mukesh Sales Corporation — B2B ordering platform, initial schema.
--
-- Security model: the browser talks to Postgres directly through the
-- Supabase Data API, so every rule lives here.
--   * RLS on every table; helpers below decide who is an active user/admin.
--   * Prices, totals, order status and identity are never trusted from the
--     client: orders are created and moved only through SECURITY DEFINER
--     functions (create_order, set_order_status).
--   * Nothing is seeded. Everything the app shows was created by a person.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

create type public.user_role as enum ('retailer', 'admin');
create type public.account_status as enum ('pending', 'active', 'blocked');
create type public.order_status as enum ('placed', 'completed', 'cancelled');

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profiles: one row per auth user. Created by a trigger on sign-up and
-- only becomes usable once the phone code is verified (verified_at).
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'retailer',
  status      public.account_status not null default 'pending',
  is_owner    boolean not null default false,
  full_name   text not null check (char_length(full_name) between 2 and 80),
  phone       text,
  shop_name   text check (shop_name is null or char_length(shop_name) <= 120),
  gst_number  text check (gst_number is null or gst_number ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  area        text check (area is null or char_length(area) <= 120),
  city        text check (city is null or char_length(city) <= 80),
  state       text check (state is null or char_length(state) <= 80),
  verified_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_single_owner on public.profiles ((true)) where is_owner;
create index profiles_role_status on public.profiles (role, status);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Helpers used by RLS. SECURITY DEFINER so they can read profiles without
-- recursing into profiles' own policies.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.verified_at is not null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
      and p.status = 'active' and p.verified_at is not null
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_owner and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- Notifications (declared early: the sign-up triggers write to it).
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  order_id   uuid,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_recent on public.notifications (user_id, created_at desc);

create or replace function public.notify_admins(p_kind text, p_title text, p_body text, p_order_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, order_id)
  select p.id, p_kind, p_title, p_body, p_order_id
  from public.profiles p
  where p.role = 'admin' and p.status = 'active' and p.verified_at is not null;
$$;

-- ---------------------------------------------------------------------
-- Sign-up lifecycle.
--   insert into auth.users  -> profile row (status pending, unverified)
--   phone/email confirmed   -> activate_profile():
--       retailer           -> active
--       first admin ever   -> active + owner (nobody exists to approve it)
--       any later admin    -> pending until the owner approves
-- ---------------------------------------------------------------------
create or replace function public.activate_profile(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  has_owner boolean;
begin
  -- Serialise activations so two simultaneous "first admins" can't both win.
  perform pg_advisory_xact_lock(hashtext('msc.activate_profile'));

  select * into v from public.profiles where id = p_id for update;
  if not found or v.verified_at is not null then
    return;
  end if;

  if v.role = 'retailer' then
    update public.profiles set verified_at = now(), status = 'active' where id = p_id;
    perform public.notify_admins('retailer_joined', 'New retailer',
      coalesce(v.shop_name, v.full_name) || coalesce(', ' || v.city, '') || ' just registered.');
    return;
  end if;

  select exists (select 1 from public.profiles where is_owner) into has_owner;
  if not has_owner then
    update public.profiles
      set verified_at = now(), status = 'active', is_owner = true
      where id = p_id;
  else
    update public.profiles set verified_at = now(), status = 'pending' where id = p_id;
    insert into public.notifications (user_id, kind, title, body)
    select p.id, 'admin_request', 'Admin access requested',
           v.full_name || ' is waiting for your approval.'
    from public.profiles p where p.is_owner;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, full_name, phone, shop_name, gst_number, area, city, state)
  values (
    new.id,
    case when meta ->> 'requested_role' = 'admin' then 'admin'::public.user_role
         else 'retailer'::public.user_role end,
    coalesce(nullif(btrim(meta ->> 'full_name'), ''), 'Unnamed'),
    new.phone,
    nullif(btrim(meta ->> 'shop_name'), ''),
    upper(nullif(btrim(meta ->> 'gst_number'), '')),
    nullif(btrim(meta ->> 'area'), ''),
    nullif(btrim(meta ->> 'city'), ''),
    nullif(btrim(meta ->> 'state'), '')
  );

  -- Projects with confirmations switched off create users already confirmed.
  if new.phone_confirmed_at is not null or new.email_confirmed_at is not null then
    perform public.activate_profile(new.id);
  end if;
  return new;
end $$;

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.activate_profile(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_confirmed
  after update of phone_confirmed_at, email_confirmed_at on auth.users
  for each row
  when ((old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
     or (old.email_confirmed_at is null and new.email_confirmed_at is not null))
  execute function public.handle_user_confirmed();

-- Guard rails for direct profile updates from the browser. Internal
-- SECURITY DEFINER functions run as the table owner and skip this. This
-- function must stay SECURITY INVOKER, or current_user would always be
-- the owner and the check below would never run.
create or replace function public.protect_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id <> old.id or new.role <> old.role or new.is_owner <> old.is_owner
     or new.phone is distinct from old.phone
     or new.verified_at is distinct from old.verified_at
     or new.created_at <> old.created_at
     or new.approved_by is distinct from old.approved_by then
    raise exception 'These account fields cannot be changed' using errcode = '42501';
  end if;

  if new.status <> old.status then
    if old.id = auth.uid() then
      raise exception 'You cannot change your own account status' using errcode = '42501';
    elsif not public.is_admin() then
      raise exception 'Only admins can change account status' using errcode = '42501';
    elsif old.is_owner then
      raise exception 'The owner account cannot be blocked' using errcode = '42501';
    elsif old.role = 'admin' and not public.is_owner() then
      raise exception 'Only the owner can approve or block admins' using errcode = '42501';
    elsif old.verified_at is null then
      raise exception 'This account has not finished signing up' using errcode = '42501';
    end if;
    if old.status = 'pending' and new.status = 'active' then
      new.approved_by := auth.uid();
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.trades (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.sizes (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique check (char_length(label) between 1 and 12),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete restrict,
  trade_id        uuid not null references public.trades (id) on delete restrict,
  name            text not null check (char_length(name) between 1 and 120),
  sku             text unique check (sku is null or char_length(sku) <= 40),
  description     text check (description is null or char_length(description) <= 2000),
  price_per_piece numeric(12, 2) not null check (price_per_piece > 0),
  mrp             numeric(12, 2) check (mrp is null or mrp > 0),
  image_paths     text[] not null default '{}',
  sizes           text[] not null default '{}',   -- maintained from active packs
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_company on public.products (company_id);
create index products_trade on public.products (trade_id);
create index products_active_recent on public.products (is_active, created_at desc);
create index products_sizes on public.products using gin (sizes);
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- A pack is how the product is sold: e.g. "Full set" = S×1, M×2, L×2, XL×1.
create table public.product_packs (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  composition jsonb not null,
  pieces      integer not null default 0 check (pieces > 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index product_packs_product on public.product_packs (product_id, sort_order);

create or replace function public.validate_pack()
returns trigger language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(new.composition) <> 'array' or jsonb_array_length(new.composition) = 0 then
    raise exception 'A pack needs at least one size' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.composition) c
    where coalesce(btrim(c ->> 'size'), '') = ''
       or coalesce(c ->> 'qty', '') !~ '^[0-9]{1,3}$'
       or (c ->> 'qty')::int < 1
  ) then
    raise exception 'Every size in a pack needs a quantity between 1 and 999' using errcode = '22023';
  end if;
  select sum((c ->> 'qty')::int) into new.pieces from jsonb_array_elements(new.composition) c;
  return new;
end $$;

create trigger product_packs_validate before insert or update on public.product_packs
  for each row execute function public.validate_pack();

create or replace function public.sync_product_sizes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
begin
  update public.products p set sizes = coalesce((
    select array_agg(distinct c ->> 'size')
    from public.product_packs pk, jsonb_array_elements(pk.composition) c
    where pk.product_id = p.id and pk.is_active
  ), '{}')
  where p.id = pid;
  return null;
end $$;

create trigger product_packs_sync_sizes after insert or update or delete on public.product_packs
  for each row execute function public.sync_product_sizes();

-- ---------------------------------------------------------------------
-- Orders. Line items are snapshots: renaming or repricing a product never
-- changes an order that was already placed.
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    bigint not null unique default nextval('public.order_number_seq'),
  retailer_id     uuid references public.profiles (id) on delete set null,
  idempotency_key uuid not null,
  status          public.order_status not null default 'placed',
  note            text,
  retailer_name   text not null,
  shop_name       text,
  retailer_phone  text,
  city            text,
  total_pieces    integer not null default 0,
  total_amount    numeric(14, 2) not null default 0,
  cancel_reason   text,
  actioned_by     uuid references public.profiles (id) on delete set null,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (retailer_id, idempotency_key)
);
create index orders_retailer_recent on public.orders (retailer_id, created_at desc);
create index orders_status_recent on public.orders (status, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid references public.products (id) on delete set null,
  pack_id         uuid references public.product_packs (id) on delete set null,
  product_name    text not null,
  company_name    text not null,
  sku             text,
  image_path      text,
  pack_label      text not null,
  composition     jsonb not null,
  pieces_per_pack integer not null,
  price_per_piece numeric(12, 2) not null,
  packs           integer not null check (packs > 0),
  line_pieces     integer not null,
  line_total      numeric(14, 2) not null
);
create index order_items_order on public.order_items (order_id);

alter table public.notifications
  add constraint notifications_order_fk foreign key (order_id) references public.orders (id) on delete cascade;

-- Place an order. Idempotent per (retailer, key): retrying a request that
-- timed out returns the same order instead of creating a second one.
create or replace function public.create_order(p_items jsonb, p_idempotency_key uuid, p_note text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  o public.orders;
  wanted int;
  inserted int;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or me.status <> 'active' or me.verified_at is null then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  if me.role <> 'retailer' then
    raise exception 'Only retailers can place orders' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing idempotency key' using errcode = '22023';
  end if;

  select * into o from public.orders where retailer_id = me.id and idempotency_key = p_idempotency_key;
  if found then
    return o;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Too many lines in one order (max 200)' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce(i ->> 'pack_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(i ->> 'packs', '') !~ '^[0-9]{1,4}$'
       or (i ->> 'packs')::int < 1
  ) then
    raise exception 'Your cart has an invalid line' using errcode = '22023';
  end if;

  insert into public.orders (retailer_id, idempotency_key, note, retailer_name, shop_name, retailer_phone, city)
  values (me.id, p_idempotency_key, nullif(btrim(left(p_note, 500)), ''),
          me.full_name, me.shop_name, me.phone, me.city)
  on conflict (retailer_id, idempotency_key) do nothing
  returning * into o;

  if o.id is null then  -- a concurrent retry won the race
    select * into o from public.orders where retailer_id = me.id and idempotency_key = p_idempotency_key;
    return o;
  end if;

  select count(distinct (i ->> 'pack_id')::uuid) into wanted from jsonb_array_elements(p_items) i;

  insert into public.order_items (order_id, product_id, pack_id, product_name, company_name, sku, image_path,
                                  pack_label, composition, pieces_per_pack, price_per_piece, packs,
                                  line_pieces, line_total)
  select o.id, p.id, pk.id, p.name, c.name, p.sku, p.image_paths[1],
         pk.label, pk.composition, pk.pieces, p.price_per_piece, req.packs,
         pk.pieces * req.packs, round(pk.pieces * req.packs * p.price_per_piece, 2)
  from (
    select (i ->> 'pack_id')::uuid as pack_id, sum((i ->> 'packs')::int)::int as packs
    from jsonb_array_elements(p_items) i group by 1
  ) req
  join public.product_packs pk on pk.id = req.pack_id and pk.is_active
  join public.products p on p.id = pk.product_id and p.is_active
  join public.companies c on c.id = p.company_id;
  get diagnostics inserted = row_count;

  if inserted <> wanted then
    raise exception 'Some items in your cart are no longer available. Please review your cart.'
      using errcode = 'P0001';
  end if;

  update public.orders set
    total_pieces = (select sum(line_pieces) from public.order_items where order_id = o.id),
    total_amount = (select sum(line_total) from public.order_items where order_id = o.id)
  where id = o.id
  returning * into o;

  insert into public.notifications (user_id, kind, title, body, order_id)
  values (me.id, 'order_placed', 'Order #' || o.order_number || ' placed',
          'We have received your order of ' || o.total_pieces || ' pieces.', o.id);
  perform public.notify_admins('order_placed', 'New order #' || o.order_number,
    coalesce(me.shop_name, me.full_name) || ' ordered ' || o.total_pieces || ' pieces.', o.id);

  return o;
end $$;

-- The order state machine: placed -> completed | cancelled. Nothing leaves
-- a final state. Retailers may only cancel their own open orders.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_reason text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  o public.orders;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or me.status <> 'active' or me.verified_at is null then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found or (me.role <> 'admin' and o.retailer_id is distinct from me.id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status <> 'placed' then
    raise exception 'This order is already %', o.status using errcode = 'P0001';
  end if;
  if p_status = 'placed' then
    raise exception 'An order cannot move back to placed' using errcode = '22023';
  end if;
  if p_status = 'completed' and me.role <> 'admin' then
    raise exception 'Only admins can complete orders' using errcode = '42501';
  end if;

  update public.orders set
    status = p_status,
    actioned_by = me.id,
    completed_at = case when p_status = 'completed' then now() end,
    cancelled_at = case when p_status = 'cancelled' then now() end,
    cancel_reason = case when p_status = 'cancelled' then nullif(btrim(left(p_reason, 300)), '') end
  where id = o.id
  returning * into o;

  if o.retailer_id is not null and o.retailer_id <> me.id then
    insert into public.notifications (user_id, kind, title, body, order_id)
    values (o.retailer_id, 'order_' || p_status::text,
            'Order #' || o.order_number || ' ' || p_status::text,
            case when p_status = 'completed' then 'Your order has been completed and is on its way.'
                 else 'Your order was cancelled' || coalesce(': ' || o.cancel_reason, '.') end,
            o.id);
  end if;
  if me.role = 'retailer' then
    perform public.notify_admins('order_cancelled', 'Order #' || o.order_number || ' cancelled',
      coalesce(me.shop_name, me.full_name) || ' cancelled their order.', o.id);
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- Dashboard + user directory
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day_start timestamptz := (today::timestamp) at time zone 'Asia/Kolkata';
  month_start timestamptz := (date_trunc('month', today)::timestamp) at time zone 'Asia/Kolkata';
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at >= day_start),
    'open_orders', (select count(*) from public.orders where status = 'placed'),
    'month_value', (select coalesce(sum(total_amount), 0) from public.orders
                    where status <> 'cancelled' and created_at >= month_start),
    'month_pieces', (select coalesce(sum(total_pieces), 0) from public.orders
                     where status <> 'cancelled' and created_at >= month_start),
    'retailers', (select count(*) from public.profiles
                  where role = 'retailer' and status = 'active' and verified_at is not null),
    'pending_admins', (select count(*) from public.profiles
                       where role = 'admin' and status = 'pending' and verified_at is not null),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'orders', coalesce(x.cnt, 0), 'value', coalesce(x.val, 0))
                       order by d.day)
      from (select (today - g)::date as day from generate_series(0, 13) g) d
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as cnt, sum(total_amount) as val
        from public.orders
        where status <> 'cancelled' and created_at >= day_start - interval '14 days'
        group by 1
      ) x on x.day = d.day
    ),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.product_name, oi.company_name, sum(oi.line_pieces) as pieces, sum(oi.line_total) as value
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.status <> 'cancelled' and o.created_at >= now() - interval '30 days'
        group by 1, 2 order by pieces desc limit 5
      ) t
    ), '[]'::jsonb)
  );
end $$;

create view public.user_directory with (security_invoker = true) as
select p.*,
       (select count(*) from public.orders o where o.retailer_id = p.id) as order_count,
       (select max(o.created_at) from public.orders o where o.retailer_id = p.id) as last_order_at,
       (select coalesce(sum(o.total_amount), 0) from public.orders o
         where o.retailer_id = p.id and o.status <> 'cancelled') as lifetime_value
from public.profiles p
where p.verified_at is not null;

-- In-app account deletion (required by app stores, good practice on web).
-- Orders keep their snapshot of the shop name for the business's records.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_owner) then
    raise exception 'The owner account cannot be deleted from the app' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Audit log, written by triggers so no code path can forget it.
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity on public.audit_logs (entity, entity_id, created_at desc);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit_profiles after update or delete on public.profiles for each row execute function public.audit_row();
create trigger audit_companies after insert or update or delete on public.companies for each row execute function public.audit_row();
create trigger audit_trades after insert or update or delete on public.trades for each row execute function public.audit_row();
create trigger audit_sizes after insert or update or delete on public.sizes for each row execute function public.audit_row();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row();
create trigger audit_product_packs after insert or update or delete on public.product_packs for each row execute function public.audit_row();
create trigger audit_orders after insert or update on public.orders for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.notifications enable row level security;
alter table public.companies     enable row level security;
alter table public.trades        enable row level security;
alter table public.sizes         enable row level security;
alter table public.products      enable row level security;
alter table public.product_packs enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.audit_logs    enable row level security;

create policy "read own profile or admin reads all" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "edit own profile or admin edits" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "active users read companies" on public.companies for select to authenticated using (public.is_active_user());
create policy "admins write companies" on public.companies for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "active users read trades" on public.trades for select to authenticated using (public.is_active_user());
create policy "admins write trades" on public.trades for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "active users read sizes" on public.sizes for select to authenticated using (public.is_active_user());
create policy "admins write sizes" on public.sizes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "retailers read live products, admins read all" on public.products
  for select to authenticated using (public.is_admin() or (is_active and public.is_active_user()));
create policy "admins write products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "retailers read live packs, admins read all" on public.product_packs
  for select to authenticated using (public.is_admin() or (is_active and public.is_active_user()));
create policy "admins write packs" on public.product_packs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own orders or admin reads all" on public.orders
  for select to authenticated using (public.is_admin() or (retailer_id = auth.uid() and public.is_active_user()));
create policy "read items of visible orders" on public.order_items
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

create policy "admins read audit log" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Grants. RLS decides rows; grants decide which verbs exist at all.
-- Orders, items and notifications have no browser write path except the
-- functions above (and marking a notification read).
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, update (full_name, shop_name, gst_number, area, city, state, status) on public.profiles to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.companies, public.trades, public.sizes,
  public.products, public.product_packs to authenticated;
grant select on public.orders, public.order_items, public.audit_logs, public.user_directory to authenticated;

grant execute on function public.is_active_user(), public.is_admin(), public.is_owner(),
  public.create_order(jsonb, uuid, text), public.set_order_status(uuid, public.order_status, text),
  public.dashboard_stats(), public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: live order boards and notification badges.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications, public.orders;

-- ---------------------------------------------------------------------
-- Storage: product photos. Public read (they're catalogue images), admin
-- write, 5 MB cap, images only. The web app re-encodes to WebP before
-- upload, which also strips EXIF/location data.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admins upload product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "admins update product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "admins delete product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());
