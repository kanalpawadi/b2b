-- =====================================================================
-- No prices of any kind in the app: MRP goes the same way as the rate.
--
--   * save_product() no longer takes an MRP.
--   * no browser can read products.mrp (column privileges), so it can't
--     show up anywhere, even through the API.
-- Existing MRP values stay in the table untouched.
-- Safe to run more than once. Needs 20261106000000_orders_without_prices.sql first.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_directory' and column_name = 'packs_ordered'
  ) then
    raise exception 'Run 20261106000000_orders_without_prices.sql first, then run this file again.';
  end if;
end $$;

revoke select on public.products from authenticated;
grant select (id, company_id, trade_id, name, sku, description, image_paths, sizes, colours, pack_of,
              is_active, created_at, updated_at)
  on public.products to authenticated;

drop function if exists public.save_product(uuid, uuid, uuid, text, text, numeric, text[], text[], text[], integer, boolean);

create or replace function public.save_product(
  p_id uuid, p_company_id uuid, p_trade_id uuid, p_trade_name text, p_name text,
  p_colours text[], p_sizes text[], p_image_paths text[],
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

  -- Older products keep their stored rate and MRP (hidden); nothing overwrites them.
  if p_id is null then
    insert into public.products (company_id, trade_id, name, colours, sizes, image_paths, pack_of, is_active)
    values (p_company_id, v_trade, v_name, v_colours, v_sizes, v_images, p_pack_of, coalesce(p_is_active, true))
    returning * into v;
  else
    update public.products set
      company_id = p_company_id, trade_id = v_trade, name = v_name,
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

  -- Never hand a price back to the browser.
  v.price_per_piece := null;
  v.mrp := null;
  return v;
end $$;

revoke execute on function public.save_product(uuid, uuid, uuid, text, text, text[], text[], text[], integer, boolean) from public, anon;
grant execute on function public.save_product(uuid, uuid, uuid, text, text, text[], text[], text[], integer, boolean) to authenticated;
