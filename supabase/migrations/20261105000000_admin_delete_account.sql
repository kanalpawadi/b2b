-- =====================================================================
-- Admins can permanently delete an account, but only once it is paused.
--
--   * pause first (status = 'blocked'), then delete: two deliberate steps.
--   * the owner can't be deleted; only the owner can delete another admin.
--   * orders stay: they keep their own copy of the shop name, phone and
--     city, and retailer_id simply becomes null (on delete set null).
--   * deleting the auth user cascades to the profile and its notifications.
-- =====================================================================

create or replace function public.admin_delete_account(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete accounts' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_id for update;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if target.id = auth.uid() then
    raise exception 'You can''t delete your own account here' using errcode = '42501';
  end if;
  if target.is_owner then
    raise exception 'The owner account can''t be deleted' using errcode = '42501';
  end if;
  if target.role = 'admin' and not public.is_owner() then
    raise exception 'Only the owner can delete an admin' using errcode = '42501';
  end if;
  if target.status <> 'blocked' then
    raise exception 'Pause the account before deleting it' using errcode = 'P0001';
  end if;

  delete from auth.users where id = p_id;
end $$;

revoke execute on function public.admin_delete_account(uuid) from public, anon;
grant execute on function public.admin_delete_account(uuid) to authenticated;
