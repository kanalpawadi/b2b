-- =====================================================================
-- Super admin (the owner) can add admins directly.
--
--   * invite_admin(email): if that email already has a fresh account it
--     becomes an admin at once; otherwise the email is remembered and the
--     person becomes an admin the moment they sign up and confirm, however
--     they sign up (normal register page or the staff link).
--   * only the owner can invite, list or cancel invites.
--   * a retailer account that already has a shop or orders can't be turned
--     into an admin (same rule as request_admin_access).
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.admin_invites (
  email      text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_invites enable row level security;

drop policy if exists "owner reads invites" on public.admin_invites;
create policy "owner reads invites" on public.admin_invites
  for select to authenticated using (public.is_owner());
drop policy if exists "owner cancels invites" on public.admin_invites;
create policy "owner cancels invites" on public.admin_invites
  for delete to authenticated using (public.is_owner());

revoke all on public.admin_invites from anon, authenticated;
grant select, delete on public.admin_invites to authenticated;

-- ---------------------------------------------------------------------
-- Turn an invited email into an admin. Internal; called by the functions
-- below. Returns true when it did something.
-- ---------------------------------------------------------------------
create or replace function public.apply_admin_invite(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me  public.profiles;
  inv public.admin_invites;
begin
  select * into me from public.profiles where id = p_id for update;
  if not found or me.email is null or me.role = 'admin' then
    return false;
  end if;
  select * into inv from public.admin_invites where email = lower(me.email);
  if not found then
    return false;
  end if;
  if me.shop_name is not null or exists (select 1 from public.orders where retailer_id = me.id) then
    return false;  -- a trading retailer account stays a retailer
  end if;

  update public.profiles set
    role = 'admin', status = 'active', approved_by = inv.invited_by,
    verified_at = coalesce(verified_at, now())
  where id = me.id;
  delete from public.admin_invites where email = inv.email;
  perform public.notify_admins('admin_joined', 'New admin', me.full_name || coalesce(' (' || me.email || ')', '') || ' joined as an admin.');
  return true;
end $$;

create or replace function public.invite_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  target  public.profiles;
  known   boolean;
begin
  if not public.is_owner() then
    raise exception 'Only the super admin can add admins' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select * into target from public.profiles where lower(email) = v_email;
  known := found;
  if known then
    if target.role = 'admin' and target.status = 'active' then
      raise exception '% is already an admin', v_email using errcode = 'P0001';
    elsif target.role = 'admin' and target.status = 'pending' then
      update public.profiles set status = 'active', approved_by = auth.uid() where id = target.id;
      return 'approved';
    elsif target.role = 'admin' then
      raise exception 'That admin is paused. Restore them from their page instead.' using errcode = 'P0001';
    elsif target.shop_name is not null or exists (select 1 from public.orders where retailer_id = target.id) then
      raise exception '% is a retailer account with a shop. Ask them to use a different email for admin work.', v_email using errcode = 'P0001';
    end if;
  end if;

  insert into public.admin_invites (email, invited_by) values (v_email, auth.uid())
  on conflict (email) do update set invited_by = excluded.invited_by, created_at = now();

  -- Already signed up and confirmed (but not yet a shop): promote right away.
  if known and target.verified_at is not null and public.apply_admin_invite(target.id) then
    return 'promoted';
  end if;
  return 'invited';
end $$;

-- ---------------------------------------------------------------------
-- Sign-up paths honour invites.
-- ---------------------------------------------------------------------
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
    perform public.apply_admin_invite(p_id);
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
    raise exception 'This account is already a retailer account. Use a different email for staff access.'
      using errcode = 'P0001';
  end if;

  if public.apply_admin_invite(me.id) then
    return 'active';
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

revoke execute on function public.apply_admin_invite(uuid), public.invite_admin(text) from public, anon;
grant execute on function public.invite_admin(text) to authenticated;
