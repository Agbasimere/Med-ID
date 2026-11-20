-- Patient basic profile edits run through a self-only security-definer function.
create or replace function public.medid_update_own_patient_profile(p_patient_id uuid, p_profile jsonb)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_patient_id or not public.medid_has_role('patient') then
    raise exception 'Patients may only update their own basic profile';
  end if;
  if jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Invalid patient profile payload';
  end if;
  if p_profile ? 'full_name' and nullif(trim(p_profile->>'full_name'), '') is null then
    raise exception 'Full name is required';
  end if;

  if p_profile ? 'full_name' then
    update public.profiles set full_name=trim(p_profile->>'full_name'),updated_at=now() where id=auth.uid();
  end if;

  update public.patients set
    dob=case when p_profile ? 'dob' then nullif(p_profile->>'dob','')::date else dob end,
    sex=case when p_profile ? 'sex' then coalesce(p_profile->>'sex','') else sex end,
    genotype=case when p_profile ? 'genotype' then coalesce(p_profile->>'genotype','') else genotype end,
    nationality=case when p_profile ? 'nationality' then coalesce(p_profile->>'nationality','') else nationality end,
    home_address=case when p_profile ? 'home_address' then coalesce(p_profile->>'home_address','') else home_address end,
    emerg_name=case when p_profile ? 'emerg_name' then coalesce(p_profile->>'emerg_name','') else emerg_name end,
    emerg_phone=case when p_profile ? 'emerg_phone' then coalesce(p_profile->>'emerg_phone','') else emerg_phone end,
    emerg_email=case when p_profile ? 'emerg_email' then coalesce(p_profile->>'emerg_email','') else emerg_email end,
    updated_at=now()
  where id=auth.uid();
  if not found then raise exception 'Patient record not found'; end if;
  return true;
end;
$$;
revoke all on function public.medid_update_own_patient_profile(uuid,jsonb) from public, anon;
grant execute on function public.medid_update_own_patient_profile(uuid,jsonb) to authenticated;
revoke update on public.patients from authenticated;
