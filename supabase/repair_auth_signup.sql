-- Repair MED-ID's auth.users trigger if a prior starter-project trigger was left installed.
-- This replaces the common `on_auth_user_created` trigger with the one current app uses.

create or replace function public.medid_create_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
declare requested_role text;
begin
  requested_role := case when new.raw_user_meta_data->>'role' = 'doctor' then 'doctor' else 'patient' end;
  insert into public.profiles(id,email,full_name,role,status,license_no,hospital)
  values (
    new.id,
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    requested_role,
    case when requested_role = 'doctor' then 'pending' else 'active' end,
    coalesce(new.raw_user_meta_data->>'license_no',''),
    coalesce(new.raw_user_meta_data->>'hospital','')
  )
  on conflict (id) do nothing;

  if requested_role = 'patient' then
    insert into public.patients(id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists medid_auth_user_created on auth.users;
create trigger medid_auth_user_created after insert on auth.users
for each row execute function public.medid_create_profile();

-- After running this repair, one MED-ID trigger should be present on auth.users.
select trigger_row.tgname as trigger_name,
       function_row.proname as function_name,
       pg_get_triggerdef(trigger_row.oid) as trigger_definition
from pg_trigger trigger_row
join pg_proc function_row on function_row.oid = trigger_row.tgfoid
where trigger_row.tgrelid = 'auth.users'::regclass
  and not trigger_row.tgisinternal
order by trigger_row.tgname;
