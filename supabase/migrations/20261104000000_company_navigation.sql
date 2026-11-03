-- =====================================================================
-- Company-first catalogue.
--
--   * Companies get a logo (Storage bucket company-logos) and an active
--     flag. Retailers only ever see active companies and their products.
--   * Products get colours and a "pack of" count. Sizes are typed by the
--     admin (no master list) and each size is sold as its own pack of
--     `pack_of` pieces, so create_order and order history are unchanged.
--   * save_product() writes a product and its packs in one transaction.
--   * Announcements: a broadcast feed for retailers' home page. Adding a
--     company or a product posts one automatically (and alerts admins);
--     admins can also post their own updates.
--   * The app never tracked stock, so there is no stock schema to remove.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Companies: logo + active flag, names compared without case/spacing.
-- ---------------------------------------------------------------------
alter table public.companies
  add column logo_path  text check (logo_path is null or logo_path ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*\.(webp|png|jpe?g)$'),
  add column is_active  boolean not null default true,
  add column updated_at timestamptz not null default now();

create or replace function public.validate_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g');
  if new.name = '' then
    raise exception 'Enter the company name' using errcode = '22023';
  end if;
  -- Companies made before logos existed keep working; new ones need one,
  -- and nobody can take a logo away once it's set.
  if new.logo_path is null and (tg_op = 'INSERT' or old.logo_path is not null) then
    raise exception 'Upload the company logo' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger companies_validate before insert or update on public.companies
  for each row execute function public.validate_company();

-- Case-insensitive uniqueness. Guarded so an existing near-duplicate can't
-- make the migration fail; the app also checks before saving.
do $$
begin
  if not exists (select 1 from public.companies group by lower(btrim(name)) having count(*) > 1) then
    create unique index companies_name_ci on public.companies (lower(name));
  else
    raise notice 'companies_name_ci skipped: merge companies whose names differ only by case first';
  end if;
  if not exists (select 1 from public.trades group by lower(btrim(name)) having count(*) > 1) then
    create unique index trades_name_ci on public.trades (lower(name));
  else
    raise notice 'trades_name_ci skipped: merge trades whose names differ only by case first';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Products: colours, pack of N, admin-typed sizes.
-- ---------------------------------------------------------------------
alter table public.products
  add column colours text[] not null default '{}',
  add column pack_of integer check (pack_of is null or pack_of between 1 and 999);

-- Existing designs: "pack of" is the size of their first live pack.
update public.products p set pack_of = (
  select pk.pieces from public.product_packs pk
  where pk.product_id = p.id and pk.is_active and pk.pieces <= 999
  order by pk.sort_order, pk.created_at limit 1
);

-- products.sizes used to be derived from the packs; it is now what the
-- admin typed, so the sync trigger goes. Existing values are kept as-is.
drop trigger if exists product_packs_sync_sizes on public.product_packs;
drop function if exists public.sync_product_sizes();

do $$
begin
  if not exists (select 1 from public.products group by company_id, trade_id, lower(btrim(name)) having count(*) > 1) then
    create unique index products_name_per_trade on public.products (company_id, trade_id, lower(name));
  else
    raise notice 'products_name_per_trade skipped: rename duplicate designs first';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Retailers see only active companies and what belongs to them.
-- ---------------------------------------------------------------------
drop policy "active users read companies" on public.companies;
create policy "retailers read live companies, admins read all" on public.companies
  for select to authenticated using (public.is_admin() or (is_active and public.is_active_user()));

drop policy "retailers read live products, admins read all" on public.products;
create policy "retailers read live products, admins read all" on public.products
  for select to authenticated using (
    public.is_admin() or (
      is_active and public.is_active_user()
      and exists (select 1 from public.companies c where c.id = company_id and c.is_active)
    )
  );

drop policy "retailers read live packs, admins read all" on public.product_packs;
create policy "retailers read live packs, admins read all" on public.product_packs
  for select to authenticated using (
    public.is_admin() or (
      is_active and public.is_active_user()
      and exists (select 1 from public.products p where p.id = product_id)  -- RLS on products applies
    )
  );

-- Trades as retailers browse them: per company, with a cover photo and the
-- design names so a search can find a trade by what's inside it.
create view public.company_trades with (security_invoker = true) as
select p.company_id,
       t.id   as trade_id,
       t.name as trade_name,
       count(*)::int as product_count,
       (array_agg(p.image_paths[1] order by p.created_at desc)
          filter (where cardinality(p.image_paths) > 0))[1] as cover_image,
       string_agg(p.name || coalesce(' ' || p.sku, ''), ' ') as search_text,
       max(p.created_at) as latest_at
from public.products p
join public.trades t on t.id = p.trade_id
where p.is_active
group by p.company_id, t.id, t.name;

-- ---------------------------------------------------------------------
-- Ordering: same as before, plus a hidden company's packs can't be bought.
-- ---------------------------------------------------------------------
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
  join public.companies c on c.id = p.company_id and c.is_active;
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

-- ---------------------------------------------------------------------
-- Clean a multi-value field: trim, drop blanks, drop case-insensitive
-- repeats, keep the order the admin typed.
-- ---------------------------------------------------------------------
create or replace function public.clean_list(p_values text[])
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(v order by first_at), '{}')
  from (
    select (array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g') order by n))[1] as v, min(n) as first_at
    from unnest(coalesce(p_values, '{}')) with ordinality u(x, n)
    where btrim(x) <> ''
    group by upper(regexp_replace(btrim(x), '\s+', ' ', 'g'))
  ) q;
$$;

-- ---------------------------------------------------------------------
-- Add or edit a product (and its packs) in one transaction.
-- Each size becomes one pack of p_pack_of pieces. Packs for sizes that are
-- kept are updated in place, so carts holding them stay valid.
-- ---------------------------------------------------------------------
create or replace function public.save_product(
  p_id uuid, p_company_id uuid, p_trade_id uuid, p_trade_name text, p_name text,
  p_rate numeric, p_mrp numeric, p_colours text[], p_sizes text[], p_image_paths text[],
  p_pack_of integer, p_is_active boolean default true
)
returns public.products language plpgsql security definer set search_path = '' as $$
declare
  v_trade   uuid := p_trade_id;
  v_tname   text := regexp_replace(btrim(coalesce(p_trade_name, '')), '\s+', ' ', 'g');
  v_name    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_colours text[] := public.clean_list(p_colours);
  v_sizes   text[] := public.clean_list(p_sizes);
  v_images  text[] := public.clean_list(p_image_paths);
  v         public.products;
  i         int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage products' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;

  if v_trade is null then
    if v_tname = '' then
      raise exception 'Choose a trade or type a new one' using errcode = '22023';
    elsif char_length(v_tname) > 80 then
      raise exception 'Trade names can be up to 80 characters' using errcode = '22023';
    end if;
    select id into v_trade from public.trades where lower(name) = lower(v_tname);
    if v_trade is null then
      insert into public.trades (name) values (v_tname) returning id into v_trade;
    end if;
  elsif not exists (select 1 from public.trades where id = v_trade) then
    raise exception 'Trade not found' using errcode = 'P0002';
  end if;

  if char_length(v_name) not between 1 and 120 then
    raise exception 'Enter a product name (up to 120 characters)' using errcode = '22023';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Enter a rate above zero' using errcode = '22023';
  end if;
  if p_mrp is null or p_mrp <= 0 then
    raise exception 'Enter the MRP' using errcode = '22023';
  end if;
  if p_mrp < p_rate then
    raise exception 'MRP can''t be lower than the rate' using errcode = '22023';
  end if;
  if p_pack_of is null or p_pack_of not between 1 and 999 then
    raise exception 'Pack of must be a whole number from 1 to 999' using errcode = '22023';
  end if;
  if cardinality(v_sizes) = 0 then
    raise exception 'Enter at least one size' using errcode = '22023';
  end if;
  if cardinality(v_sizes) > 30 or exists (select 1 from unnest(v_sizes) s where char_length(s) > 20) then
    raise exception 'Up to 30 sizes, each up to 20 characters' using errcode = '22023';
  end if;
  if cardinality(v_colours) > 30 or exists (select 1 from unnest(v_colours) c where char_length(c) > 40) then
    raise exception 'Up to 30 colours, each up to 40 characters' using errcode = '22023';
  end if;
  if cardinality(v_images) > 8 then
    raise exception 'Up to 8 images per product' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_images) u
    where not (u ~ '^https?://[^\s<>"'']+$' and char_length(u) <= 1000)
      and u !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$'
  ) then
    raise exception 'Every image must be a web address starting with http:// or https://' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.products
    where company_id = p_company_id and trade_id = v_trade and lower(name) = lower(v_name)
      and id is distinct from p_id
  ) then
    raise exception '“%” already exists in this trade for this company', v_name using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.products (company_id, trade_id, name, price_per_piece, mrp, colours, sizes, image_paths, pack_of, is_active)
    values (p_company_id, v_trade, v_name, p_rate, p_mrp, v_colours, v_sizes, v_images, p_pack_of, coalesce(p_is_active, true))
    returning * into v;
  else
    update public.products set
      company_id = p_company_id, trade_id = v_trade, name = v_name, price_per_piece = p_rate, mrp = p_mrp,
      colours = v_colours, sizes = v_sizes, image_paths = v_images, pack_of = p_pack_of,
      is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Drop packs that aren't one of the sizes (including older mixed-size
  -- packs). Order lines keep their snapshot; pack_id just becomes null.
  delete from public.product_packs pk
  where pk.product_id = v.id
    and (jsonb_array_length(pk.composition) <> 1 or not ((pk.composition -> 0 ->> 'size') = any (v_sizes)));
  delete from public.product_packs pk
  using public.product_packs keep
  where pk.product_id = v.id and keep.product_id = v.id
    and (pk.composition -> 0 ->> 'size') = (keep.composition -> 0 ->> 'size')
    and (keep.created_at, keep.id) < (pk.created_at, pk.id);

  for i in 1 .. cardinality(v_sizes) loop
    update public.product_packs set
      label = v_sizes[i],
      composition = jsonb_build_array(jsonb_build_object('size', v_sizes[i], 'qty', p_pack_of)),
      is_active = true,
      sort_order = i
    where product_id = v.id and (composition -> 0 ->> 'size') = v_sizes[i];
    if not found then
      insert into public.product_packs (product_id, label, composition, sort_order)
      values (v.id, v_sizes[i], jsonb_build_array(jsonb_build_object('size', v_sizes[i], 'qty', p_pack_of)), i);
    end if;
  end loop;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- Announcements: one row per update, read by every active user, so
-- retailers who registered long ago see new ones without doing anything.
-- ---------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'announcement' check (kind in ('company_added', 'product_added', 'announcement')),
  title      text not null check (char_length(btrim(title)) between 1 and 140),
  body       text check (body is null or char_length(body) <= 1000),
  company_id uuid references public.companies (id) on delete cascade,
  trade_id   uuid references public.trades (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index announcements_recent on public.announcements (created_at desc);
-- One automatic post per company and per product, however it was saved.
create unique index announcements_one_per_company on public.announcements (company_id) where kind = 'company_added';
create unique index announcements_one_per_product on public.announcements (product_id) where kind = 'product_added';

alter table public.announcements enable row level security;

-- Retailers only see posts about things they can still open.
create policy "active users read announcements" on public.announcements
  for select to authenticated using (
    public.is_admin() or (
      public.is_active_user()
      and (company_id is null or exists (select 1 from public.companies c where c.id = company_id))
      and (product_id is null or exists (select 1 from public.products p where p.id = product_id))
    )
  );
create policy "admins post announcements" on public.announcements
  for insert to authenticated with check (public.is_admin() and kind = 'announcement' and created_by = auth.uid());
create policy "admins remove announcements" on public.announcements
  for delete to authenticated using (public.is_admin());

grant select, delete on public.announcements to authenticated;
grant insert (title, body) on public.announcements to authenticated;

-- Admin alerts can point at a company or product as well as an order.
alter table public.notifications
  add column company_id uuid references public.companies (id) on delete cascade,
  add column product_id uuid references public.products (id) on delete cascade;

-- Runs inside the same transaction as the insert, so a failed save never
-- announces anything. The admin who made the change gets the alert already read.
create or replace function public.announce_catalogue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor text := (select full_name from public.profiles where id = auth.uid());
  co    public.companies;
  trade text;
begin
  if tg_table_name = 'companies' then
    if new.is_active then
      insert into public.announcements (kind, title, body, company_id, created_by)
      values ('company_added', 'New company: ' || new.name,
              new.name || ' is now on Mukesh Sales. Open it to see their trades.', new.id, auth.uid())
      on conflict do nothing;
    end if;
    insert into public.notifications (user_id, kind, title, body, company_id, read_at)
    select p.id, 'company_added', 'Company added',
           new.name || ' was added' || coalesce(' by ' || actor, '') || '.', new.id,
           case when p.id = auth.uid() then now() end
    from public.profiles p
    where p.role = 'admin' and p.status = 'active' and p.verified_at is not null;
    return null;
  end if;

  select * into co from public.companies where id = new.company_id;
  select name into trade from public.trades where id = new.trade_id;
  if new.is_active and co.is_active then
    insert into public.announcements (kind, title, body, company_id, trade_id, product_id, created_by)
    values ('product_added', 'New from ' || co.name, new.name || ' in ' || trade || '.',
            new.company_id, new.trade_id, new.id, auth.uid())
    on conflict do nothing;
  end if;
  insert into public.notifications (user_id, kind, title, body, company_id, product_id, read_at)
  select p.id, 'product_added', 'Product added',
         new.name || ' (' || co.name || ' · ' || trade || ') was added' || coalesce(' by ' || actor, '') || '.',
         new.company_id, new.id, case when p.id = auth.uid() then now() end
  from public.profiles p
  where p.role = 'admin' and p.status = 'active' and p.verified_at is not null;
  return null;
end $$;

create trigger companies_announce after insert on public.companies
  for each row execute function public.announce_catalogue();
create trigger products_announce after insert on public.products
  for each row execute function public.announce_catalogue();

create trigger audit_announcements after insert or delete on public.announcements
  for each row execute function public.audit_row();

alter publication supabase_realtime add table public.announcements;

-- ---------------------------------------------------------------------
-- Storage: company logos. Same rules as product photos: public read,
-- admin write, images only. The browser re-encodes to WebP before upload.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admins upload company logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'company-logos' and public.is_admin());
create policy "admins update company logos" on storage.objects
  for update to authenticated using (bucket_id = 'company-logos' and public.is_admin());
create policy "admins delete company logos" on storage.objects
  for delete to authenticated using (bucket_id = 'company-logos' and public.is_admin());

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
revoke all on public.company_trades from anon, authenticated;
grant select on public.company_trades to authenticated;

revoke execute on function public.validate_company(), public.clean_list(text[]), public.announce_catalogue(),
  public.save_product(uuid, uuid, uuid, text, text, numeric, numeric, text[], text[], text[], integer, boolean)
  from public, anon;
grant execute on function
  public.save_product(uuid, uuid, uuid, text, text, numeric, numeric, text[], text[], text[], integer, boolean)
  to authenticated;
-- create_order was replaced above; keep its grant explicit.
revoke execute on function public.create_order(jsonb, uuid, text) from public, anon;
grant execute on function public.create_order(jsonb, uuid, text) to authenticated;
