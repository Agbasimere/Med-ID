-- Extend patient records for initial self-reported intake. Medical values are
-- submitted once through an authenticated RPC, never stored in Auth metadata.
alter table public.patients add column if not exists sex text not null default '';
alter table public.patients add column if not exists genotype text not null default '';
alter table public.patients add column if not exists nationality text not null default '';
alter table public.patients add column if not exists home_address text not null default '';
alter table public.patients add column if not exists surgeries text not null default '';
alter table public.patients add column if not exists medical_history text not null default '';
alter table public.patients add column if not exists med_id_number text;
alter table public.patients add column if not exists intake_completed_at timestamptz;

update public.patients
set med_id_number = 'MED-' || upper(replace(id::text, '-', ''))
where med_id_number is null;
create unique index if not exists idx_patients_med_id_number
  on public.patients(med_id_number) where med_id_number is not null;

-- Existing accounts keep their current profile setup. New patients are created
-- with a null intake_completed_at and complete the one-time intake after login.
update public.patients
set intake_completed_at = coalesce(updated_at, now())
where intake_completed_at is null;

grant insert (id,dob,sex,blood_type,genotype,nationality,home_address,allergies,conditions,medications,surgeries,medical_history,emerg_name,emerg_phone,emerg_email,updated_at)
  on public.patients to authenticated;
grant update (dob,sex,genotype,nationality,home_address,emerg_name,emerg_phone,emerg_email,updated_at)
  on public.patients to authenticated;
revoke insert (blood_type,allergies,conditions,medications,surgeries,medical_history)
  on public.patients from authenticated;
revoke update (blood_type,allergies,conditions,medications,surgeries,medical_history)
  on public.patients from authenticated;

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
    insert into public.patients(id, med_id_number)
    values (new.id, 'MED-' || upper(replace(new.id::text, '-', '')))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists medid_auth_user_created on auth.users;
create trigger medid_auth_user_created after insert on auth.users
for each row execute procedure public.medid_create_profile();

create or replace function public.medid_submit_patient_intake(p_intake jsonb)
returns public.patients language plpgsql security definer set search_path = public
as $$
declare saved public.patients;
begin
  if auth.uid() is null or not public.medid_has_role('patient') then
    raise exception 'Only the signed-in patient may submit their initial intake';
  end if;
  select * into saved from public.patients where id = auth.uid() for update;
  if not found then raise exception 'Patient record not found'; end if;
  if saved.intake_completed_at is not null then
    raise exception 'Initial patient intake has already been submitted';
  end if;
  update public.patients set
    dob = nullif(p_intake->>'dob','')::date,
    sex = coalesce(p_intake->>'sex',''),
    blood_type = coalesce(nullif(p_intake->>'blood_type',''),'Unknown'),
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
    intake_completed_at = now(), updated_at = now()
  where id = auth.uid() returning * into saved;
  return saved;
end;
$$;

revoke all on function public.medid_submit_patient_intake(jsonb) from public, anon;
grant execute on function public.medid_submit_patient_intake(jsonb) to authenticated;
