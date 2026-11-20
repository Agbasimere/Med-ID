-- Apply once to add the shared, append-only medical history table to an existing MED-ID project.
create table if not exists public.patient_medical_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  occurred_at date not null default current_date,
  category text not null,
  title text not null,
  details text not null default '',
  medication text not null default '',
  dosage text not null default '',
  provider text not null default '',
  facility text not null default '',
  doctor_license_no text not null default '',
  doctor_hospital text not null default '',
  status text not null default 'Recorded',
  created_at timestamptz not null default now()
);
alter table public.patient_medical_history add column if not exists doctor_license_no text not null default '';
alter table public.patient_medical_history add column if not exists doctor_hospital text not null default '';

create index if not exists idx_medical_history_patient
  on public.patient_medical_history(patient_id, occurred_at desc, created_at desc);

alter table public.patient_medical_history enable row level security;
revoke all on public.patient_medical_history from anon, authenticated;
grant select on public.patient_medical_history to authenticated;
grant insert (patient_id,created_by,occurred_at,category,title,details,medication,dosage,provider,facility,status) on public.patient_medical_history to authenticated;

drop policy if exists medical_history_read on public.patient_medical_history;
create policy medical_history_read on public.patient_medical_history for select to authenticated
using (patient_id = auth.uid() or public.medid_is_admin() or public.medid_has_role('doctor'));

drop policy if exists medical_history_insert on public.patient_medical_history;
create policy medical_history_insert on public.patient_medical_history for insert to authenticated
with check (
  created_by = auth.uid() and (public.medid_is_admin() or public.medid_has_role('doctor'))
);

create or replace function public.medid_stamp_medical_history_doctor()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare clinician public.profiles;
begin
  if public.medid_has_role('doctor') then
    select * into clinician from public.profiles where id = auth.uid();
    if nullif(trim(clinician.license_no), '') is null or nullif(trim(clinician.hospital), '') is null then
      raise exception 'Doctor license number and hospital name are required before adding clinical history';
    end if;
    new.doctor_license_no := coalesce(clinician.license_no, '');
    new.doctor_hospital := coalesce(clinician.hospital, '');
  elsif not public.medid_is_admin() then
    raise exception 'Only an active doctor or administrator may add medical history';
  end if;
  return new;
end;
$$;
drop trigger if exists medid_stamp_medical_history_doctor on public.patient_medical_history;
create trigger medid_stamp_medical_history_doctor before insert on public.patient_medical_history
for each row execute function public.medid_stamp_medical_history_doctor();

-- Patients retain access to basic identity and next-of-kin fields, but not to clinical data.
revoke insert (blood_type,allergies,conditions,medications) on public.patients from authenticated;
revoke update (blood_type,allergies,conditions,medications) on public.patients from authenticated;
grant insert (id,dob,emerg_name,emerg_phone,emerg_email,updated_at) on public.patients to authenticated;
grant update (dob,emerg_name,emerg_phone,emerg_email,updated_at) on public.patients to authenticated;
