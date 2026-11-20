-- =========================================================================
-- MED-ID Fix: Patient Profile Updates, Intake, and RLS Permissions
-- =========================================================================

-- 1. Update medid_update_own_patient_profile to include ALL fields
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

  -- Update full name in profiles table if provided
  if p_profile ? 'full_name' and nullif(trim(p_profile->>'full_name'), '') is not null then
    update public.profiles set full_name = trim(p_profile->>'full_name'), updated_at = now() where id = auth.uid();
  end if;

  -- Update ALL fields in patients table
  update public.patients set
    dob = case when p_profile ? 'dob' then nullif(p_profile->>'dob', '')::date else dob end,
    sex = case when p_profile ? 'sex' then coalesce(p_profile->>'sex', '') else sex end,
    blood_type = case when p_profile ? 'blood_type' then coalesce(nullif(p_profile->>'blood_type', ''), 'Unknown') else blood_type end,
    blood_group = case when p_profile ? 'blood_type' then coalesce(nullif(p_profile->>'blood_type', ''), 'Unknown') else blood_group end,
    genotype = case when p_profile ? 'genotype' then coalesce(p_profile->>'genotype', '') else genotype end,
    nationality = case when p_profile ? 'nationality' then coalesce(p_profile->>'nationality', '') else nationality end,
    home_address = case when p_profile ? 'home_address' then coalesce(p_profile->>'home_address', '') else home_address end,
    conditions = case when p_profile ? 'conditions' then coalesce(p_profile->>'conditions', '') else conditions end,
    allergies = case when p_profile ? 'allergies' then coalesce(p_profile->>'allergies', '') else allergies end,
    medications = case when p_profile ? 'medications' then coalesce(p_profile->>'medications', '') else medications end,
    surgeries = case when p_profile ? 'surgeries' then coalesce(p_profile->>'surgeries', '') else surgeries end,
    medical_history = case when p_profile ? 'medical_history' then coalesce(p_profile->>'medical_history', '') else medical_history end,
    emerg_name = case when p_profile ? 'emerg_name' then coalesce(p_profile->>'emerg_name', '') else emerg_name end,
    emerg_phone = case when p_profile ? 'emerg_phone' then coalesce(p_profile->>'emerg_phone', '') else emerg_phone end,
    emerg_email = case when p_profile ? 'emerg_email' then coalesce(p_profile->>'emerg_email', '') else emerg_email end,
    emerg_whatsapp_opt_in = case when p_profile ? 'emerg_whatsapp_opt_in' then coalesce((p_profile->>'emerg_whatsapp_opt_in')::boolean, emerg_whatsapp_opt_in) else emerg_whatsapp_opt_in end,
    descriptor = case when p_profile ? 'descriptor' then (p_profile->'descriptor') else descriptor end,
    intake_completed_at = coalesce(intake_completed_at, now()),
    updated_at = now()
  where id = auth.uid();

  if not found then
    insert into public.patients(
      id,
      med_id_number,
      dob,
      sex,
      blood_type,
      blood_group,
      genotype,
      nationality,
      home_address,
      conditions,
      allergies,
      medications,
      surgeries,
      medical_history,
      emerg_name,
      emerg_phone,
      emerg_email,
      emerg_whatsapp_opt_in,
      descriptor,
      intake_completed_at,
      updated_at
    )
    values (
      auth.uid(),
      'MED-' || upper(replace(auth.uid()::text, '-', '')),
      nullif(p_profile->>'dob', '')::date,
      coalesce(p_profile->>'sex', ''),
      coalesce(nullif(p_profile->>'blood_type', ''), 'Unknown'),
      coalesce(nullif(p_profile->>'blood_type', ''), 'Unknown'),
      coalesce(p_profile->>'genotype', ''),
      coalesce(p_profile->>'nationality', ''),
      coalesce(p_profile->>'home_address', ''),
      coalesce(p_profile->>'conditions', ''),
      coalesce(p_profile->>'allergies', ''),
      coalesce(p_profile->>'medications', ''),
      coalesce(p_profile->>'surgeries', ''),
      coalesce(p_profile->>'medical_history', ''),
      coalesce(p_profile->>'emerg_name', ''),
      coalesce(p_profile->>'emerg_phone', ''),
      coalesce(p_profile->>'emerg_email', ''),
      coalesce((p_profile->>'emerg_whatsapp_opt_in')::boolean, false),
      (p_profile->'descriptor'),
      now(),
      now()
    );
  end if;

  return true;
end;
$$;

grant execute on function public.medid_update_own_patient_profile(uuid,jsonb) to authenticated;

-- 2. Update medid_submit_patient_intake: Remove restriction that blocked re-saving
create or replace function public.medid_submit_patient_intake(p_intake jsonb)
returns public.patients language plpgsql security definer set search_path = public
as $$
declare saved public.patients;
begin
  if auth.uid() is null or not public.medid_has_role('patient') then
    raise exception 'Only the signed-in patient may submit their initial intake';
  end if;

  select * into saved from public.patients where id = auth.uid() for update;
  if not found then
    insert into public.patients(id, med_id_number)
    values (auth.uid(), 'MED-' || upper(replace(auth.uid()::text, '-', '')))
    returning * into saved;
  end if;

  update public.patients set
    dob = nullif(p_intake->>'dob','')::date,
    sex = coalesce(p_intake->>'sex',''),
    blood_type = coalesce(nullif(p_intake->>'blood_type',''), coalesce(nullif(p_intake->>'bloodType',''), 'Unknown')),
    blood_group = coalesce(nullif(p_intake->>'blood_type',''), coalesce(nullif(p_intake->>'bloodType',''), 'Unknown')),
    genotype = coalesce(p_intake->>'genotype',''),
    nationality = coalesce(p_intake->>'nationality',''),
    home_address = coalesce(p_intake->>'home_address',''),
    allergies = coalesce(p_intake->>'allergies',''),
    conditions = coalesce(p_intake->>'conditions',''),
    medications = coalesce(p_intake->>'medications',''),
    surgeries = coalesce(p_intake->>'surgeries',''),
    medical_history = coalesce(p_intake->>'medical_history',''),
    emerg_name = coalesce(p_intake->>'emerg_name',''),
    emerg_phone = coalesce(p_intake->>'emerg_phone',''),
    emerg_email = coalesce(p_intake->>'emerg_email',''),
    intake_completed_at = now(),
    updated_at = now()
  where id = auth.uid() returning * into saved;

  return saved;
end;
$$;

grant execute on function public.medid_submit_patient_intake(jsonb) to authenticated;

-- 3. Grant direct permissions on public.patients with RLS policies so direct client updates succeed
grant select, update on public.patients to authenticated;

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own on public.patients
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists patients_select_own on public.patients;
create policy patients_select_own on public.patients
  for select to authenticated
  using (id = auth.uid() or public.medid_has_role('doctor') or public.medid_is_admin());
