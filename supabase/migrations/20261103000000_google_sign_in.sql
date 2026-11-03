-- =====================================================================
-- Switch sign-in from mobile + SMS code to Google accounts.
--
-- Google has already verified the email, so a profile is usable as soon as
-- the user first signs in. What Google doesn't give us is the shop, so:
--   * retailers finish sign-up with complete_onboarding() (shop details);
--     admins are told about the new retailer only at that point.
--   * staff call request_admin_access() right after their first Google
--     sign-in. The first one becomes the owner; later ones wait for approval.
--   * an order can't be placed until the shop details exist.
-- =====================================================================

alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

-- The mobile number is now a contact number typed during onboarding.
alter table public.profiles
  add constraint profiles_phone_format check (phone is null or phone ~ '^\+?91[6-9][0-9]{9}$');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := left(btrim(coalesce(
    nullif(btrim(meta ->> 'full_name'), ''),
    nullif(btrim(meta ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  )), 80);
begin
  if v_name is null or char_length(v_name) < 2 then
    v_name := 'Retailer';
  end if;

  -- Everyone starts as a retailer. Staff upgrade through request_admin_access().
  insert into public.profiles (id, role, full_name, email)
  values (new.id, 'retailer', v_name, new.email);

  if new.email_confirmed_at is not null or new.phone_confirmed_at is not null then
    perform public.activate_profile(new.id);
  end if;
  return new;
end $$;

-- Retailers are no longer announced on activation (they have no shop name
-- yet); complete_onboarding() announces them instead.
create or replace function public.activate_profile(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.profiles;
  has_owner boolean;
begin
  perform pg_advisory_xact_lock(hashtext('msc.activate_profile'));

  select * into v from public.profiles where id = p_id for update;
  if not found or v.verified_at is not null then
    return;
  end if;

  if v.role = 'retailer' then
    update public.profiles set verified_at = now(), status = 'active' where id = p_id;
    return;
  end if;

  select exists (select 1 from public.profiles where is_owner) into has_owner;
  if not has_owner then
    update public.profiles set verified_at = now(), status = 'active', is_owner = true where id = p_id;
  else
    update public.profiles set verified_at = now(), status = 'pending' where id = p_id;
    insert into public.notifications (user_id, kind, title, body)
    select p.id, 'admin_request', 'Admin access requested', v.full_name || ' is waiting for your approval.'
    from public.profiles p where p.is_owner;
  end if;
end $$;

-- Keep the stored email in step if the user changes it at Google.
create or replace function public.handle_user_email_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_changed();

-- ---------------------------------------------------------------------
-- Retailer onboarding: the shop details Google can't tell us.
-- ---------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_full_name text, p_shop_name text, p_phone text, p_gst_number text,
  p_area text, p_city text, p_state text
)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.status <> 'active' or me.verified_at is null then
    raise exception 'Your account is not active' using errcode = '42501';
  end if;
  if me.role <> 'retailer' then
    raise exception 'Only retailers have shop details' using errcode = '42501';
  end if;
  if me.shop_name is not null then
    raise exception 'Your shop is already set up. Edit it from your account page.' using errcode = 'P0001';
  end if;

  if char_length(v_phone) = 10 then
    v_phone := '91' || v_phone;
  end if;
  if v_phone !~ '^91[6-9][0-9]{9}$' then
    raise exception 'Enter a 10-digit Indian mobile number' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_shop_name, ''))) < 2 then
    raise exception 'Enter your shop name' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_city, ''))) < 2 or char_length(btrim(coalesce(p_state, ''))) < 2 then
    raise exception 'Enter your city and state' using errcode = '22023';
  end if;

  update public.profiles set
    full_name  = coalesce(nullif(left(btrim(p_full_name), 80), ''), full_name),
    shop_name  = left(btrim(p_shop_name), 120),
    phone      = v_phone,
    gst_number = upper(nullif(btrim(p_gst_number), '')),
    area       = nullif(left(btrim(p_area), 120), ''),
    city       = left(btrim(p_city), 80),
    state      = left(btrim(p_state), 80)
  where id = me.id
  returning * into me;

  perform public.notify_admins('retailer_joined', 'New retailer',
    me.shop_name || coalesce(', ' || me.city, '') || ' just registered.');
  return me;
end $$;

-- ---------------------------------------------------------------------
-- Staff access. Only a brand-new account (no shop, no orders) can ask, so a
-- retailer can't quietly turn their trading account into an admin one.
-- ---------------------------------------------------------------------
create or replace function public.request_admin_access()
returns public.account_status language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  has_owner boolean;
begin
  perform pg_advisory_xact_lock(hashtext('msc.activate_profile'));

  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.verified_at is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if me.role = 'admin' then
    return me.status;
  end if;
  if me.status = 'blocked' then
    raise exception 'This account is paused' using errcode = '42501';
  end if;
  if me.shop_name is not null or exists (select 1 from public.orders where retailer_id = me.id) then
    raise exception 'This Google account is already a retailer account. Use a different Google account for staff access.'
      using errcode = 'P0001';
  end if;

  select exists (select 1 from public.profiles where is_owner) into has_owner;
  if not has_owner then
    update public.profiles set role = 'admin', status = 'active', is_owner = true where id = me.id;
    return 'active';
  end if;

  update public.profiles set role = 'admin', status = 'pending' where id = me.id;
  insert into public.notifications (user_id, kind, title, body)
  select p.id, 'admin_request', 'Admin access requested',
         me.full_name || coalesce(' (' || me.email || ')', '') || ' is waiting for your approval.'
  from public.profiles p where p.is_owner;
  return 'pending';
end $$;

-- ---------------------------------------------------------------------
-- No shop details, no order.
-- ---------------------------------------------------------------------
create or replace function public.require_shop_on_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.shop_name is null then
    raise exception 'Add your shop details before placing an order' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger orders_require_shop before insert on public.orders
  for each row execute function public.require_shop_on_order();

-- Rebuild the directory view so it picks up the new email column.
drop view public.user_directory;
create view public.user_directory with (security_invoker = true) as
select p.*,
       (select count(*) from public.orders o where o.retailer_id = p.id) as order_count,
       (select max(o.created_at) from public.orders o where o.retailer_id = p.id) as last_order_at,
       (select coalesce(sum(o.total_amount), 0) from public.orders o
         where o.retailer_id = p.id and o.status <> 'cancelled') as lifetime_value
from public.profiles p
where p.verified_at is not null;

revoke all on public.user_directory from anon, authenticated;
grant select on public.user_directory to authenticated;

revoke execute on function public.complete_onboarding(text, text, text, text, text, text, text),
  public.request_admin_access(), public.handle_user_email_changed(), public.require_shop_on_order()
  from public, anon;
grant execute on function public.complete_onboarding(text, text, text, text, text, text, text),
  public.request_admin_access() to authenticated;
