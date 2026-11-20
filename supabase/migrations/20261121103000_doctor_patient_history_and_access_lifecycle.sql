-- A doctor can revisit basic details only for patients they previously verified.
-- Clinical reports remain protected by the existing time-limited access grant.
alter table public.medical_report_requests
  drop constraint if exists medical_report_requests_status_check;
alter table public.medical_report_requests
  add constraint medical_report_requests_status_check
  check (status in ('pending','granted','denied','revoked'));
alter table public.medical_report_requests
  drop constraint if exists medical_report_requests_doctor_id_patient_id_key;
alter table public.medical_report_requests
  add column if not exists granted_at timestamptz;

-- Keep a separate row for every doctor request so grants and revocations remain reviewable.
create or replace function public.medid_request_medical_report(p_patient_id uuid)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare result public.medical_report_requests;
begin
  if not public.medid_has_role('doctor') then raise exception 'Active doctor account required'; end if;
  if not exists (
    select 1 from public.biometric_scan_audits s
    where s.doctor_id=auth.uid() and s.patient_id=p_patient_id
      and s.verified_at > now()-interval '30 minutes'
  ) then raise exception 'Complete a biometric scan before requesting this report'; end if;
  insert into public.medical_report_requests(doctor_id,patient_id,status,requested_at,reviewed_by,reviewed_at,expires_at,granted_at)
    values(auth.uid(),p_patient_id,'pending',now(),null,null,null,null)
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
  select to_jsonb(r) into result from public.medical_report_requests r
    where r.doctor_id=auth.uid() and r.patient_id=p_patient_id
    order by r.requested_at desc limit 1;
  return result;
end;
$$;

create or replace function public.medid_get_doctor_patient_history()
returns table(
  patient_id uuid,
  patient_name text,
  patient_email text,
  dob date,
  sex text,
  blood_type text,
  nationality text,
  home_address text,
  emerg_name text,
  emerg_phone text,
  emerg_email text,
  med_id_number text,
  last_scanned_at timestamptz,
  scan_count bigint,
  last_modality text,
  request_id uuid,
  report_status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  granted_at timestamptz,
  expires_at timestamptz,
  reviewer_name text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.medid_has_role('doctor') or not exists (
    select 1 from public.profiles d where d.id=auth.uid() and d.role='doctor' and d.status='active'
  ) then
    raise exception 'Active doctor account required';
  end if;

  return query
  with scans as (
    select s.patient_id,
      max(s.verified_at) as last_scanned_at,
      count(*)::bigint as scan_count,
      (array_agg(s.modality order by s.verified_at desc))[1] as last_modality
    from public.biometric_scan_audits s
    where s.doctor_id=auth.uid()
    group by s.patient_id
  )
  select p.id, pr.full_name, pr.email, p.dob, p.sex, p.blood_type,
    p.nationality, p.home_address, p.emerg_name, p.emerg_phone, p.emerg_email,
    p.med_id_number, s.last_scanned_at, s.scan_count, s.last_modality,
    r.id, r.status, r.requested_at, r.reviewed_at, r.granted_at, r.expires_at, reviewer.full_name
  from scans s
  join public.patients p on p.id=s.patient_id
  join public.profiles pr on pr.id=p.id
  left join lateral (
    select access.* from public.medical_report_requests access
    where access.patient_id=p.id and access.doctor_id=auth.uid()
    order by access.requested_at desc limit 1
  ) r on true
  left join public.profiles reviewer on reviewer.id=r.reviewed_by
  order by s.last_scanned_at desc;
end;
$$;

create or replace function public.medid_admin_medical_report_requests()
returns table(
  id uuid,
  doctor_id uuid,
  doctor_name text,
  doctor_hospital text,
  doctor_license text,
  patient_id uuid,
  patient_name text,
  status text,
  requested_at timestamptz,
  reviewed_by uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  granted_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select r.id,r.doctor_id,d.full_name,d.hospital,d.license_no,r.patient_id,p.full_name,
    r.status,r.requested_at,r.reviewed_by,reviewer.full_name,r.reviewed_at,r.granted_at,r.expires_at
  from public.medical_report_requests r
  join public.profiles d on d.id=r.doctor_id
  join public.profiles p on p.id=r.patient_id
  left join public.profiles reviewer on reviewer.id=r.reviewed_by
  where public.medid_is_admin()
  order by case when r.status='pending' then 0 else 1 end, r.requested_at desc;
$$;

create or replace function public.medid_review_medical_report_request(p_request_id uuid,p_decision text)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare result public.medical_report_requests;
begin
  if not public.medid_is_admin() then raise exception 'Super-admin access required'; end if;
  if p_decision not in ('granted','denied') then raise exception 'Decision must be granted or denied'; end if;
  update public.medical_report_requests set status=p_decision, reviewed_by=auth.uid(), reviewed_at=now(),
    granted_at=case when p_decision='granted' then now() else granted_at end,
    expires_at=case when p_decision='granted' then now()+interval '24 hours' else null end
    where id=p_request_id and status='pending' returning * into result;
  if found then return result; end if;
  if p_decision='granted' then
    insert into public.medical_report_requests(doctor_id,patient_id,status,requested_at,reviewed_by,reviewed_at,granted_at,expires_at)
      select old_request.doctor_id,old_request.patient_id,'granted',now(),auth.uid(),now(),now(),now()+interval '24 hours'
      from public.medical_report_requests old_request
      where old_request.id=p_request_id and old_request.status='granted' and old_request.expires_at<=now()
      returning * into result;
    if found then return result; end if;
  end if;
  if not found then raise exception 'Pending request or expired grant not found'; end if;
  return result;
end;
$$;

create or replace function public.medid_revoke_medical_report_access(p_request_id uuid)
returns public.medical_report_requests language plpgsql security definer set search_path = public
as $$
declare result public.medical_report_requests;
begin
  if not public.medid_is_admin() then raise exception 'Super-admin access required'; end if;
  update public.medical_report_requests
    set status='revoked', reviewed_by=auth.uid(), reviewed_at=now(), expires_at=now()
    where id=p_request_id and status='granted' and expires_at>now()
    returning * into result;
  if not found then raise exception 'Active medical report grant not found'; end if;
  return result;
end;
$$;

revoke all on function public.medid_get_doctor_patient_history(), public.medid_admin_medical_report_requests(), public.medid_revoke_medical_report_access(uuid) from public, anon;
grant execute on function public.medid_get_doctor_patient_history() to authenticated;
grant execute on function public.medid_admin_medical_report_requests(), public.medid_revoke_medical_report_access(uuid) to authenticated;
grant execute on function public.medid_review_medical_report_request(uuid,text) to authenticated;
