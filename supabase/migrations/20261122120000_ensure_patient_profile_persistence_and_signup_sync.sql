-- Migration: Ensure patient row creation on signup and atomic profile sync
-- Med-ID Emergency Health Platform

-- 1. Ensure handle_new_user trigger populates public.patients atomically upon patient signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare 
  r text := coalesce(new.raw_user_meta_data->>'role','patient');
  v_med_id text := 'MED-' || upper(replace(new.id::text, '-', ''));
  v_blood text := coalesce(nullif(new.raw_user_meta_data->>'blood_type', ''), coalesce(nullif(new.raw_user_meta_data->>'bloodType', ''), 'Unknown'));
begin
  if r not in ('patient','doctor') then r := 'patient'; end if;

  insert into profiles(id, email, full_name, role, status, license_no, hospital)
  values(
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    r,
    case when r = 'doctor' then 'pending' else 'active' end,
    new.raw_user_meta_data->>'license_no',
    new.raw_user_meta_data->>'hospital'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name);

  if r = 'patient' then
    insert into public.patients(
      id,
      med_id_number,
      full_name,
      dob,
      sex,
      blood_type,
      blood_group,
      genotype,
      nationality,
      home_address,
      allergies,
      conditions,
      medications,
      surgeries,
      medical_history,
      emerg_name,
      emerg_phone,
      emerg_email,
      emerg_whatsapp_opt_in,
      updated_at
    )
    values (
      new.id,
      v_med_id,
      new.raw_user_meta_data->>'full_name',
      nullif(new.raw_user_meta_data->>'dob', '')::date,
      coalesce(new.raw_user_meta_data->>'sex', ''),
      v_blood,
      v_blood,
      coalesce(new.raw_user_meta_data->>'genotype', ''),
      coalesce(new.raw_user_meta_data->>'nationality', ''),
      coalesce(new.raw_user_meta_data->>'home_address', coalesce(new.raw_user_meta_data->>'homeAddress', '')),
      coalesce(new.raw_user_meta_data->>'allergies', ''),
      coalesce(new.raw_user_meta_data->>'conditions', ''),
      coalesce(new.raw_user_meta_data->>'medications', ''),
      coalesce(new.raw_user_meta_data->>'surgeries', ''),
      coalesce(new.raw_user_meta_data->>'medical_history', coalesce(new.raw_user_meta_data->>'medicalHistory', '')),
      coalesce(new.raw_user_meta_data->>'emerg_name', coalesce(new.raw_user_meta_data->>'emergName', '')),
      coalesce(new.raw_user_meta_data->>'emerg_phone', coalesce(new.raw_user_meta_data->>'emergPhone', '')),
      coalesce(new.raw_user_meta_data->>'emerg_email', coalesce(new.raw_user_meta_data->>'emergEmail', '')),
      coalesce((new.raw_user_meta_data->>'emerg_whatsapp_opt_in')::boolean, coalesce((new.raw_user_meta_data->>'whatsappOptIn')::boolean, false)),
      now()
    )
    on conflict (id) do update set
      full_name = coalesce(excluded.full_name, patients.full_name),
      dob = coalesce(excluded.dob, patients.dob),
      sex = case when excluded.sex <> '' then excluded.sex else patients.sex end,
      blood_type = case when excluded.blood_type <> 'Unknown' then excluded.blood_type else patients.blood_type end,
      blood_group = case when excluded.blood_group <> 'Unknown' then excluded.blood_group else patients.blood_group end,
      genotype = case when excluded.genotype <> '' then excluded.genotype else patients.genotype end,
      nationality = case when excluded.nationality <> '' then excluded.nationality else patients.nationality end,
      home_address = case when excluded.home_address <> '' then excluded.home_address else patients.home_address end,
      allergies = case when excluded.allergies <> '' then excluded.allergies else patients.allergies end,
      conditions = case when excluded.conditions <> '' then excluded.conditions else patients.conditions end,
      medications = case when excluded.medications <> '' then excluded.medications else patients.medications end,
      surgeries = case when excluded.surgeries <> '' then excluded.surgeries else patients.surgeries end,
      medical_history = case when excluded.medical_history <> '' then excluded.medical_history else patients.medical_history end,
      emerg_name = case when excluded.emerg_name <> '' then excluded.emerg_name else patients.emerg_name end,
      emerg_phone = case when excluded.emerg_phone <> '' then excluded.emerg_phone else patients.emerg_phone end,
      emerg_email = case when excluded.emerg_email <> '' then excluded.emerg_email else patients.emerg_email end,
      emerg_whatsapp_opt_in = excluded.emerg_whatsapp_opt_in,
      updated_at = now();
  end if;

  return new;
end;
$function$;

-- 2. Ensure medid_get_own_patient_data guarantees a row exists and returns complete info
CREATE OR REPLACE FUNCTION public.medid_get_own_patient_data(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare 
  result jsonb;
  v_med_id text;
begin
  if auth.uid() is null or auth.uid() <> p_patient_id or not public.medid_has_role('patient') then
    raise exception 'Patients may only access their own profile';
  end if;

  -- Self-heal: Ensure a patient record exists in public.patients if missing
  insert into public.patients (id, med_id_number, full_name, blood_type, blood_group)
  select 
    auth.uid(),
    'MED-' || upper(replace(auth.uid()::text, '-', '')),
    pr.full_name,
    'Unknown',
    'Unknown'
  from public.profiles pr
  where pr.id = auth.uid()
  on conflict (id) do nothing;

  select to_jsonb(pa) || jsonb_build_object('full_name', pr.full_name, 'email', pr.email)
    into result 
  from public.profiles pr 
  left join public.patients pa on pa.id = pr.id 
  where pr.id = p_patient_id;

  return result;
end;
$function$;

-- 3. Enhance medid_update_own_patient_profile to handle both blood_type and blood_group
CREATE OR REPLACE FUNCTION public.medid_update_own_patient_profile(p_patient_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_blood text;
begin
  if auth.uid() is null or auth.uid() <> p_patient_id or not public.medid_has_role('patient') then
    raise exception 'Patients may only update their own basic profile';
  end if;
  if jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Invalid patient profile payload';
  end if;

  -- Update full name in profiles table if provided
  if p_profile ? 'full_name' and nullif(trim(p_profile->>'full_name'), '') is not null then
    update public.profiles 
    set full_name = trim(p_profile->>'full_name'), 
        updated_at = now() 
    where id = auth.uid();
  end if;

  -- Extract blood type/group
  if p_profile ? 'blood_type' then
    v_blood := nullif(trim(p_profile->>'blood_type'), '');
  elsif p_profile ? 'blood_group' then
    v_blood := nullif(trim(p_profile->>'blood_group'), '');
  end if;

  -- Update ALL fields in patients table
  update public.patients set
    dob = case when p_profile ? 'dob' then nullif(p_profile->>'dob', '')::date else dob end,
    sex = case when p_profile ? 'sex' then coalesce(p_profile->>'sex', '') else sex end,
    blood_type = case when v_blood is not null then v_blood else blood_type end,
    blood_group = case when v_blood is not null then v_blood else blood_group end,
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
      full_name,
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
      coalesce(trim(p_profile->>'full_name'), ''),
      nullif(p_profile->>'dob', '')::date,
      coalesce(p_profile->>'sex', ''),
      coalesce(v_blood, 'Unknown'),
      coalesce(v_blood, 'Unknown'),
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
$function$;
