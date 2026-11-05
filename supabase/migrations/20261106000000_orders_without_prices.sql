-- =====================================================================
-- The app takes orders; prices live in the billing software.
--
--   * products no longer need a rate, and no browser can read the rates
--     that older products still have (column privileges).
--   * create_order() stores no prices: line totals and order totals stay
--     empty / zero. Past orders keep the figures they were placed with.
--   * save_product() loses its rate argument; MRP stays.
--   * the dashboard and the people directory count packs and pieces.
-- Nothing is deleted: old rates and old order amounts stay in the tables.
-- =====================================================================

alter table public.products alter column price_per_piece drop not null;
alter table public.order_items alter column price_per_piece drop not null;
alter table public.order_items alter column line_total drop not null;

-- Rates are hidden from every signed-in user, admins included: nothing in
-- the app uses them any more. SECURITY DEFINER functions still can.
revoke select on public.products from authenticated;
grant select (id, company_id, trade_id, name, sku, description, mrp, image_paths, sizes, colours, pack_of,
              is_active, created_at, updated_at)
  on public.products to authenticated;

-- ---------------------------------------------------------------------
-- Ordering without prices.
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
         pk.label, pk.composition, pk.pieces, null, req.packs,
         pk.pieces * req.packs, null
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
    total_pieces = (select sum(line_pieces) from public.order_items where order_id = o.id)
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
-- save_product() without a rate. Same rules otherwise.
-- ---------------------------------------------------------------------
drop function public.save_product(uuid, uuid, uuid, text, text, numeric, numeric, text[], text[], text[], integer, boolean);

create or replace function public.save_product(
  p_id uuid, p_company_id uuid, p_trade_id uuid, p_trade_name text, p_name text,
  p_mrp numeric, p_colours text[], p_sizes text[], p_image_paths text[],
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
  if p_mrp is null or p_mrp <= 0 then
    raise exception 'Enter the MRP' using errcode = '22023';
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

  -- An older product's rate is left as it was (hidden), never overwritten.
  if p_id is null then
    insert into public.products (company_id, trade_id, name, mrp, colours, sizes, image_paths, pack_of, is_active)
    values (p_company_id, v_trade, v_name, p_mrp, v_colours, v_sizes, v_images, p_pack_of, coalesce(p_is_active, true))
    returning * into v;
  else
    update public.products set
      company_id = p_company_id, trade_id = v_trade, name = v_name, mrp = p_mrp,
      colours = v_colours, sizes = v_sizes, image_paths = v_images, pack_of = p_pack_of,
      is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

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

  v.price_per_piece := null;  -- never hand a rate back to the browser
  return v;
end $$;

revoke execute on function public.save_product(uuid, uuid, uuid, text, text, numeric, text[], text[], text[], integer, boolean) from public, anon;
grant execute on function public.save_product(uuid, uuid, uuid, text, text, numeric, text[], text[], text[], integer, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard: orders, packs and pieces instead of rupees.
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
    'month_orders', (select count(*) from public.orders where status <> 'cancelled' and created_at >= month_start),
    'month_pieces', (select coalesce(sum(total_pieces), 0) from public.orders
                     where status <> 'cancelled' and created_at >= month_start),
    'month_packs', (select coalesce(sum(oi.packs), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
                    where o.status <> 'cancelled' and o.created_at >= month_start),
    'retailers', (select count(*) from public.profiles
                  where role = 'retailer' and status = 'active' and verified_at is not null),
    'pending_admins', (select count(*) from public.profiles
                       where role = 'admin' and status = 'pending' and verified_at is not null),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'orders', coalesce(x.cnt, 0), 'pieces', coalesce(x.pcs, 0))
                       order by d.day)
      from (select (today - g)::date as day from generate_series(0, 13) g) d
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as cnt, sum(total_pieces) as pcs
        from public.orders
        where status <> 'cancelled' and created_at >= day_start - interval '14 days'
        group by 1
      ) x on x.day = d.day
    ),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.product_name, oi.company_name, sum(oi.line_pieces) as pieces, sum(oi.packs) as packs
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.status <> 'cancelled' and o.created_at >= now() - interval '30 days'
        group by 1, 2 order by pieces desc limit 5
      ) t
    ), '[]'::jsonb)
  );
end $$;

-- People directory: packs and pieces ordered instead of rupees.
drop view public.user_directory;
create view public.user_directory with (security_invoker = true) as
select p.*,
       (select count(*) from public.orders o where o.retailer_id = p.id) as order_count,
       (select max(o.created_at) from public.orders o where o.retailer_id = p.id) as last_order_at,
       (select coalesce(sum(o.total_pieces), 0) from public.orders o
         where o.retailer_id = p.id and o.status <> 'cancelled') as pieces_ordered,
       (select coalesce(sum(oi.packs), 0) from public.order_items oi join public.orders o on o.id = oi.order_id
         where o.retailer_id = p.id and o.status <> 'cancelled') as packs_ordered
from public.profiles p
where p.verified_at is not null;

revoke all on public.user_directory from anon, authenticated;
grant select on public.user_directory to authenticated;
