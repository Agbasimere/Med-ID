-- =========================================================================
-- MED-ID Automated Cross-Hospital History & Patient Profile Migration
-- =========================================================================

-- 1. Ensure biometric_scan_audits table exists and has RLS policies for active doctors
create table if not exists public.biometric_scan_audits (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  modality text not null check (modality in ('face', 'fingerprint', 'lookup', 'biometric')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.biometric_scan_audits enable row level security;

drop policy if exists "Doctors can insert their own biometric scan audits" on public.biometric_scan_audits;
create policy "Doctors can insert their own biometric scan audits"
  on public.biometric_scan_audits for insert
  to authenticated
  with check (auth.uid() = doctor_id);

drop policy if exists "Doctors can select their own scan audits" on public.biometric_scan_audits;
create policy "Doctors can select their own scan audits"
  on public.biometric_scan_audits for select
  to authenticated
  using (auth.uid() = doctor_id or auth.uid() = patient_id or public.medid_is_admin());

-- 2. Medical report requests: Support automatic emergency grants without manual admin intervention
alter table public.medical_report_requests
  drop constraint if exists medical_report_requests_status_check;

alter table public.medical_report_requests
  add constraint medical_report_requests_status_check
  check (status in ('pending', 'granted', 'denied', 'revoked'));

drop policy if exists "Doctors can insert and manage report requests for their scanned patients" on public.medical_report_requests;
create policy "Doctors can insert and manage report requests for their scanned patients"
  on public.medical_report_requests for all
  to authenticated
  using (auth.uid() = doctor_id or public.medid_is_admin())
  with check (auth.uid() = doctor_id or public.medid_is_admin());

-- 3. Automatic Cross-Hospital Emergency Report Retrieval Function
-- Attending doctors can pull records directly under emergency protocol without manual admin approval
create or replace function public.medid_auto_grant_cross_hospital_report(p_patient_id uuid)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare
  result public.medical_report_requests;
  v_doctor_profile record;
  v_patient_name text;
begin
  if not public.medid_has_role('doctor') then
    raise exception 'Active doctor account required';
  end if;

  select * into v_doctor_profile from public.profiles where id = auth.uid();
  select full_name into v_patient_name from public.profiles where id = p_patient_id;

  -- Upsert an automatically granted 24-hour emergency access pass
  insert into public.medical_report_requests(
    doctor_id,
    patient_id,
    status,
    requested_at,
    reviewed_by,
    reviewed_at,
    granted_at,
    expires_at
  )
  values (
    auth.uid(),
    p_patient_id,
    'granted',
    now(),
    auth.uid(),
    now(),
    now(),
    now() + interval '24 hours'
  )
  on conflict (doctor_id, patient_id)
  do update set
    status = 'granted',
    requested_at = now(),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    granted_at = now(),
    expires_at = now() + interval '24 hours'
  returning * into result;

  -- Log the emergency cross-hospital record retrieval
  insert into public.audit_logs(actor_id, actor_email, action, target_id, details)
  values (
    auth.uid(),
    v_doctor_profile.email,
    'INTERHOSPITAL_HISTORY_PULL',
    p_patient_id,
    format('Dr. %s (%s) automatically pulled clinical history for %s under Emergency Protocol',
      coalesce(v_doctor_profile.full_name, 'Physician'),
      coalesce(v_doctor_profile.hospital, 'Hospital'),
      coalesce(v_patient_name, 'Patient'))
  );

  return result;
end;
$$;

revoke all on function public.medid_auto_grant_cross_hospital_report(uuid) from public, anon;
grant execute on function public.medid_auto_grant_cross_hospital_report(uuid) to authenticated;
