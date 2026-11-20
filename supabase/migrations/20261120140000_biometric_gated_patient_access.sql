-- Require an active, recent biometric scan before showing a clinician's basic patient profile or requesting a report.
create table if not exists public.biometric_scan_audits (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  modality text not null check (modality in ('face','fingerprint')),
  verified_at timestamptz not null default now()
);
create index if not exists biometric_scan_doctor_patient_time on public.biometric_scan_audits(doctor_id,patient_id,verified_at desc);
create table if not exists public.medical_report_requests (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','granted','denied')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  unique (doctor_id, patient_id)
);
alter table public.biometric_scan_audits enable row level security;
alter table public.medical_report_requests enable row level security;
revoke all on public.biometric_scan_audits, public.medical_report_requests from anon, authenticated;
grant all on public.biometric_scan_audits, public.medical_report_requests to service_role;

create or replace function public.medid_get_own_patient_data(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_patient_id or not public.medid_has_role('patient') then
    raise exception 'Patients may only access their own profile';
  end if;
  select to_jsonb(pa) || jsonb_build_object('full_name',pr.full_name,'email',pr.email)
    into result from public.patients pa join public.profiles pr on pr.id=pa.id where pa.id=p_patient_id;
  return result;
end;
$$;

create or replace function public.medid_request_medical_report(p_patient_id uuid)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare result public.medical_report_requests;
begin
  if not public.medid_has_role('doctor') then raise exception 'Active doctor account required'; end if;
  if not exists (select 1 from public.biometric_scan_audits s where s.doctor_id=auth.uid() and s.patient_id=p_patient_id and s.verified_at > now()-interval '30 minutes') then
    raise exception 'Complete a biometric scan before requesting this report';
  end if;
  insert into public.medical_report_requests(doctor_id,patient_id,status,requested_at,reviewed_by,reviewed_at,expires_at)
  values(auth.uid(),p_patient_id,'pending',now(),null,null,null)
  on conflict (doctor_id,patient_id) do update set status='pending',requested_at=now(),reviewed_by=null,reviewed_at=null,expires_at=null
  returning * into result;
  return result;
end;
$$;

create or replace function public.medid_get_medical_report_request(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.medid_has_role('doctor') then raise exception 'Active doctor account required'; end if;
  select to_jsonb(r) into result from public.medical_report_requests r where r.doctor_id=auth.uid() and r.patient_id=p_patient_id;
  return result;
end;
$$;

create or replace function public.medid_admin_pending_medical_report_requests()
returns table(id uuid, doctor_id uuid, doctor_name text, doctor_hospital text, doctor_license text, patient_id uuid, patient_name text, requested_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.id,r.doctor_id,d.full_name,d.hospital,d.license_no,r.patient_id,p.full_name,r.requested_at
  from public.medical_report_requests r
  join public.profiles d on d.id=r.doctor_id
  join public.profiles p on p.id=r.patient_id
  where public.medid_is_admin() and r.status='pending'
  order by r.requested_at asc;
$$;

create or replace function public.medid_review_medical_report_request(p_request_id uuid,p_decision text)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare result public.medical_report_requests;
begin
  if not public.medid_is_admin() then raise exception 'Super-admin access required'; end if;
  if p_decision not in ('granted','denied') then raise exception 'Decision must be granted or denied'; end if;
  update public.medical_report_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),expires_at=case when p_decision='granted' then now()+interval '24 hours' else null end
  where id=p_request_id and status='pending' returning * into result;
  if not found then raise exception 'Pending report request not found'; end if;
  return result;
end;
$$;

create or replace function public.medid_get_medical_report(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if not (auth.uid()=p_patient_id and public.medid_has_role('patient')) and not (
    public.medid_has_role('doctor') and exists(select 1 from public.medical_report_requests r where r.doctor_id=auth.uid() and r.patient_id=p_patient_id and r.status='granted' and r.expires_at>now())
  ) then raise exception 'A current super-admin grant is required to view this medical report'; end if;
  select jsonb_build_object(
    'legacy',jsonb_build_object('blood_type',p.blood_type,'allergies',p.allergies,'conditions',p.conditions,'medications',p.medications,'surgeries',p.surgeries,'medical_history',p.medical_history,'updated_at',p.updated_at),
    'entries',coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at desc,h.created_at desc) from public.patient_medical_history h where h.patient_id=p_patient_id),'[]'::jsonb)
  ) into result from public.patients p where p.id=p_patient_id;
  return result;
end;
$$;

-- Patients obtain their full own row only through the own-profile RPC. Client table reads
-- are revoked so doctor/admin browser code cannot enumerate medical or biometric columns.
drop policy if exists patients_read on public.patients;
create policy patients_read on public.patients for select to authenticated using (id=auth.uid() and public.medid_has_role('patient'));
drop policy if exists medical_history_read on public.patient_medical_history;
create policy medical_history_read on public.patient_medical_history for select to authenticated using (
  (patient_id=auth.uid() and public.medid_has_role('patient')) or
  (public.medid_has_role('doctor') and exists(select 1 from public.medical_report_requests r where r.doctor_id=auth.uid() and r.patient_id=patient_medical_history.patient_id and r.status='granted' and r.expires_at>now()))
);
revoke select on public.patients from authenticated;
revoke select on public.patient_medical_history from authenticated;
grant select on public.patient_medical_history to authenticated;
revoke all on function public.medid_get_own_patient_data(uuid), public.medid_request_medical_report(uuid), public.medid_get_medical_report_request(uuid), public.medid_admin_pending_medical_report_requests(), public.medid_review_medical_report_request(uuid,text), public.medid_get_medical_report(uuid) from public, anon;
grant execute on function public.medid_get_own_patient_data(uuid), public.medid_request_medical_report(uuid), public.medid_get_medical_report_request(uuid), public.medid_get_medical_report(uuid) to authenticated;
grant execute on function public.medid_admin_pending_medical_report_requests(), public.medid_review_medical_report_request(uuid,text) to authenticated;

alter table public.patients add column if not exists emerg_whatsapp_opt_in boolean not null default false;
create or replace function public.medid_set_whatsapp_opt_in(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.medid_has_role('patient') then raise exception 'Patient account required'; end if;
  update public.patients set emerg_whatsapp_opt_in=coalesce(p_enabled,false),updated_at=now() where id=auth.uid();
  return coalesce(p_enabled,false);
end;
$$;
revoke all on function public.medid_set_whatsapp_opt_in(boolean) from public, anon;
grant execute on function public.medid_set_whatsapp_opt_in(boolean) to authenticated;

-- Clinical changes require a current super-admin grant as well as a recent biometric scan.
drop policy if exists medical_history_insert on public.patient_medical_history;
create policy medical_history_insert on public.patient_medical_history for insert to authenticated
with check (
  created_by=auth.uid() and public.medid_has_role('doctor') and exists (
    select 1 from public.medical_report_requests r
    where r.doctor_id=auth.uid() and r.patient_id=patient_medical_history.patient_id
      and r.status='granted' and r.expires_at>now()
  )
);

-- Remove unscreened patient-name enumeration and keep clinical text out of the admin audit view.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.medid_is_admin());
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using (
  actor_id=auth.uid() or (public.medid_is_admin() and action <> 'PATIENT_MEDICAL_HISTORY_ADDED')
);
