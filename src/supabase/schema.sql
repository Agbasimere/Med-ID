-- MED-ID schema for the current React application.
-- Run in the Supabase SQL editor. Admins must be provisioned manually (see README).
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null check (role in ('patient','doctor','admin')),
  status text not null default 'active' check (status in ('active','pending','suspended')),
  license_no text not null default '',
  hospital text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key references public.profiles(id) on delete cascade,
  dob date,
  blood_type text not null default 'O+',
  allergies text not null default '',
  conditions text not null default '',
  medications text not null default '',
  emerg_name text not null default '',
  emerg_phone text not null default '',
  emerg_email text not null default '',
  descriptor jsonb,
  updated_at timestamptz not null default now()
);
-- Add the application fields when upgrading from the older demo schema.
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists license_no text not null default '';
alter table public.profiles add column if not exists hospital text not null default '';
alter table public.patients add column if not exists dob date;
alter table public.patients add column if not exists blood_type text not null default 'O+';
alter table public.patients add column if not exists allergies text not null default '';
alter table public.patients add column if not exists conditions text not null default '';
alter table public.patients add column if not exists medications text not null default '';
alter table public.patients add column if not exists emerg_name text not null default '';
alter table public.patients add column if not exists emerg_phone text not null default '';
alter table public.patients add column if not exists emerg_email text not null default '';
alter table public.patients add column if not exists descriptor jsonb;
alter table public.patients add column if not exists updated_at timestamptz not null default now();
alter table public.patients add column if not exists med_id_number text;
alter table public.patients add column if not exists full_name text;
alter table public.patients add column if not exists blood_group text;
alter table public.patients alter column med_id_number drop not null;
alter table public.patients alter column full_name drop not null;
alter table public.patients alter column blood_group drop not null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_id uuid,
  details text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Append-only clinical history. Each entry is shared through the patient's account.
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

create table if not exists public.webauthn_credentials (
  credential_id text primary key,
  patient_id uuid not null references public.patients(id) on delete cascade,
  public_key text not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null default 'singleDevice',
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('registration','authentication')),
  created_at timestamptz not null default now()
);

create index if not exists idx_patients_biometric on public.patients using gin (descriptor);
create index if not exists idx_webauthn_credentials_patient on public.webauthn_credentials(patient_id);
create index if not exists idx_webauthn_challenges_expiry on public.webauthn_challenges(created_at);
create unique index if not exists idx_webauthn_challenges_user_purpose on public.webauthn_challenges(user_id,purpose);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);
create index if not exists idx_notifications_patient on public.notifications(patient_id, created_at desc);
create index if not exists idx_medical_history_patient on public.patient_medical_history(patient_id, occurred_at desc, created_at desc);

create or replace function public.medid_has_role(required_role text, required_status text default 'active')
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.role = required_role and p.status = required_status
) $$;

create or replace function public.medid_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'active') $$;

create or replace function public.medid_save_biometrics(
  p_patient_id uuid, p_face jsonb default null, p_fingerprint jsonb default null
) returns public.patients language plpgsql security definer set search_path = public
as $$
declare saved public.patients;
begin
  if p_patient_id <> auth.uid() or not public.medid_has_role('patient') then
    raise exception 'Only the signed-in patient may enroll biometrics';
  end if;
  if p_face is null or p_fingerprint is not null then
    raise exception 'Only face data can be enrolled through this endpoint';
  end if;
  if jsonb_typeof(p_face->'vector') is distinct from 'array' then
    raise exception 'Face descriptor must contain 128 numeric values';
  end if;
  if jsonb_array_length(p_face->'vector') <> 128 then raise exception 'Face descriptor must contain 128 numeric values'; end if;
  if exists (select 1 from jsonb_array_elements(p_face->'vector') as v(value) where jsonb_typeof(v.value) <> 'number') then
    raise exception 'Face descriptor must contain 128 numeric values';
  end if;
  update public.patients
  set descriptor = case
    when p_face is not null then coalesce(descriptor, '{}'::jsonb) || p_face
    else coalesce(descriptor, '{}'::jsonb) || jsonb_build_object('fingerprint', p_fingerprint)
  end,
  updated_at = now()
  where id = p_patient_id
  returning * into saved;
  if not found then raise exception 'Patient record not found'; end if;
  return saved;
end;
$$;

create or replace function public.medid_create_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
declare requested_role text;
begin
  requested_role := case when new.raw_user_meta_data->>'role' = 'doctor' then 'doctor' else 'patient' end;
  insert into public.profiles(id,email,full_name,role,status,license_no,hospital)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''), requested_role,
    case when requested_role = 'doctor' then 'pending' else 'active' end,
    coalesce(new.raw_user_meta_data->>'license_no',''), coalesce(new.raw_user_meta_data->>'hospital',''))
  on conflict (id) do nothing;
  if requested_role = 'patient' then
    insert into public.patients(id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Replace the common starter-project trigger to avoid duplicate profile inserts.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists medid_auth_user_created on auth.users;
create trigger medid_auth_user_created after insert on auth.users
for each row execute procedure public.medid_create_profile();

-- Backfill accounts created before the profile trigger existed.
insert into public.profiles(id,email,full_name,role,status,license_no,hospital)
select u.id, coalesce(u.email,''), coalesce(u.raw_user_meta_data->>'full_name',''),
  case when u.raw_user_meta_data->>'role' = 'doctor' then 'doctor' else 'patient' end,
  case when u.raw_user_meta_data->>'role' = 'doctor' then 'pending' else 'active' end,
  coalesce(u.raw_user_meta_data->>'license_no',''), coalesce(u.raw_user_meta_data->>'hospital','')
from auth.users u on conflict (id) do nothing;
insert into public.patients(id)
select p.id from public.profiles p where p.role = 'patient' on conflict (id) do nothing;
-- Carry forward medical fields and facial templates from the original demo schema.
update public.patients p set
  blood_type = coalesce(nullif(p.blood_type,'O+'), nullif(to_jsonb(p)->>'blood_group',''), 'O+'),
  allergies = coalesce(nullif(p.allergies,''), coalesce(to_jsonb(p)->'severe_allergies','[]'::jsonb)::text, ''),
  conditions = coalesce(nullif(p.conditions,''), coalesce(to_jsonb(p)->'chronic_conditions','[]'::jsonb)::text, ''),
  medications = coalesce(nullif(p.medications,''), coalesce(to_jsonb(p)->'current_medications','[]'::jsonb)::text, ''),
  descriptor = coalesce(p.descriptor, case when to_jsonb(p)->'face_descriptor' is not null
    then jsonb_build_object('vector',to_jsonb(p)->'face_descriptor','photo',to_jsonb(p)->'face_photo_url') else null end);

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.patient_medical_history enable row level security;
alter table public.patient_medical_history add column if not exists doctor_license_no text not null default '';
alter table public.patient_medical_history add column if not exists doctor_hospital text not null default '';
alter table public.webauthn_credentials enable row level security;
alter table public.webauthn_challenges enable row level security;

-- Remove permissive policies from the previous demo schema before installing scoped policies.
drop policy if exists "Public & Auth read profiles" on public.profiles;
drop policy if exists "Public & Auth insert profiles" on public.profiles;
drop policy if exists "Public & Auth update profiles" on public.profiles;
drop policy if exists "Public & Auth read patients" on public.patients;
drop policy if exists "Public & Auth insert patients" on public.patients;
drop policy if exists "Public & Auth update patients" on public.patients;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.medid_is_admin() or
  (role = 'patient' and public.medid_has_role('doctor'))
);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id = auth.uid() and role = 'patient') with check (id = auth.uid() and role = 'patient');
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.medid_is_admin()) with check (public.medid_is_admin());

drop policy if exists patients_read on public.patients;
create policy patients_read on public.patients for select to authenticated using (
  id = auth.uid() or public.medid_is_admin() or public.medid_has_role('doctor')
);
drop policy if exists patients_self_insert on public.patients;
create policy patients_self_insert on public.patients for insert to authenticated
with check (id = auth.uid() and public.medid_has_role('patient'));
drop policy if exists patients_self_update on public.patients;
create policy patients_self_update on public.patients for update to authenticated
using (id = auth.uid() and public.medid_has_role('patient'))
with check (id = auth.uid() and public.medid_has_role('patient'));

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
using (public.medid_is_admin() or actor_id = auth.uid());
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
with check (actor_id = auth.uid() or (actor_id is null and public.medid_is_admin()));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
using (patient_id = auth.uid() or doctor_id = auth.uid() or public.medid_is_admin());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
with check (public.medid_has_role('doctor') and doctor_id = auth.uid());

drop policy if exists medical_history_read on public.patient_medical_history;
create policy medical_history_read on public.patient_medical_history for select to authenticated
using (patient_id = auth.uid() or public.medid_is_admin() or public.medid_has_role('doctor'));
drop policy if exists medical_history_insert on public.patient_medical_history;
create policy medical_history_insert on public.patient_medical_history for insert to authenticated
with check (
  created_by = auth.uid() and (
    public.medid_is_admin() or public.medid_has_role('doctor')
  )
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

grant usage on schema public to authenticated;
revoke all on public.profiles, public.patients, public.audit_logs, public.notifications, public.patient_medical_history from anon, authenticated;
grant select, update on public.profiles to authenticated;
revoke insert (descriptor), update (descriptor) on public.patients from authenticated;
grant select on public.patients to authenticated;
grant insert (id,dob,blood_type,allergies,conditions,medications,emerg_name,emerg_phone,emerg_email,updated_at) on public.patients to authenticated;
revoke insert (blood_type,allergies,conditions,medications) on public.patients from authenticated;
grant update (dob,emerg_name,emerg_phone,emerg_email,updated_at) on public.patients to authenticated;
revoke update (blood_type,allergies,conditions,medications) on public.patients from authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert on public.notifications to authenticated;
grant select on public.patient_medical_history to authenticated;
grant insert (patient_id,created_by,occurred_at,category,title,details,medication,dosage,provider,facility,status) on public.patient_medical_history to authenticated;
revoke all on public.webauthn_credentials, public.webauthn_challenges from anon, authenticated;
grant all on public.webauthn_credentials, public.webauthn_challenges to service_role;
grant select on public.profiles to service_role;
grant select, update on public.patients to service_role;
revoke all on function public.medid_save_biometrics(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.medid_save_biometrics(uuid,jsonb,jsonb) to authenticated;
