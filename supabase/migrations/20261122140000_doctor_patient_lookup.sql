-- Migration: Doctor Patient Lookup by Name, Email, or UID / MED-ID
-- Med-ID Emergency Health Platform

-- 1. Allow 'lookup' and 'manual' as valid modalities in biometric_scan_audits
ALTER TABLE public.biometric_scan_audits 
  DROP CONSTRAINT IF EXISTS biometric_scan_audits_modality_check;

ALTER TABLE public.biometric_scan_audits 
  ADD CONSTRAINT biometric_scan_audits_modality_check
  CHECK (modality IN ('face', 'fingerprint', 'lookup', 'manual'));

-- 2. Grant execute and table select permissions to authenticated users
GRANT SELECT ON public.patients TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- 3. Create RPC function medid_search_patients
CREATE OR REPLACE FUNCTION public.medid_search_patients(p_query text)
RETURNS table(
  id uuid,
  full_name text,
  email text,
  dob date,
  sex text,
  blood_type text,
  blood_group text,
  genotype text,
  nationality text,
  home_address text,
  allergies text,
  conditions text,
  medications text,
  surgeries text,
  medical_history text,
  emerg_name text,
  emerg_phone text,
  emerg_email text,
  med_id_number text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_clean_query text := trim(coalesce(p_query, ''));
  v_lower_query text := lower(v_clean_query);
  v_like_pattern text := '%' || v_lower_query || '%';
  v_med_id_core text := upper(replace(replace(v_clean_query, 'MED-', ''), 'med-', ''));
  v_clean_uid text := replace(v_lower_query, '-', '');
begin
  -- 1. Authorization: Allow service_role/postgres directly, or require authenticated doctor/admin
  if current_user not in ('postgres', 'service_role') then
    if auth.uid() is null then
      raise exception 'Authentication required for patient lookup';
    end if;

    if not (public.medid_has_role('doctor') or public.medid_is_admin()) then
      raise exception 'Active doctor or administrator account required for patient lookup';
    end if;
  end if;

  if v_clean_query = '' then
    return;
  end if;

  -- 2. Query matching patients by Name, Email, or UID / MED-ID
  return query
  select 
    pa.id,
    coalesce(nullif(pa.full_name, ''), nullif(pr.full_name, ''), 'Patient')::text as full_name,
    coalesce(pr.email, pa.emerg_email, '')::text as email,
    pa.dob,
    coalesce(pa.sex, '')::text as sex,
    coalesce(nullif(pa.blood_type, ''), nullif(pa.blood_group, ''), 'Unknown')::text as blood_type,
    coalesce(nullif(pa.blood_group, ''), nullif(pa.blood_type, ''), 'Unknown')::text as blood_group,
    coalesce(pa.genotype, '')::text as genotype,
    coalesce(pa.nationality, '')::text as nationality,
    coalesce(pa.home_address, '')::text as home_address,
    coalesce(pa.allergies, '')::text as allergies,
    coalesce(pa.conditions, '')::text as conditions,
    coalesce(pa.medications, '')::text as medications,
    coalesce(pa.surgeries, '')::text as surgeries,
    coalesce(pa.medical_history, '')::text as medical_history,
    coalesce(pa.emerg_name, '')::text as emerg_name,
    coalesce(pa.emerg_phone, '')::text as emerg_phone,
    coalesce(pa.emerg_email, '')::text as emerg_email,
    coalesce(pa.med_id_number, 'MED-' || upper(replace(pa.id::text, '-', '')))::text as med_id_number,
    pr.created_at,
    pa.updated_at
  from public.patients pa
  left join public.profiles pr on pr.id = pa.id
  where (pr.role is null or pr.role = 'patient')
    and (
      -- Match by Name
      lower(coalesce(pa.full_name, '')) like v_like_pattern
      or lower(coalesce(pr.full_name, '')) like v_like_pattern
      
      -- Match by Email
      or lower(coalesce(pr.email, '')) like v_like_pattern
      or lower(coalesce(pa.emerg_email, '')) like v_like_pattern

      -- Match by UID (UUID with or without dashes)
      or pa.id::text ilike v_like_pattern
      or replace(pa.id::text, '-', '') ilike ('%' || v_clean_uid || '%')

      -- Match by MED-ID
      or lower(coalesce(pa.med_id_number, '')) like v_like_pattern
      or upper(replace(coalesce(pa.med_id_number, ''), 'MED-', '')) like ('%' || v_med_id_core || '%')
    )
  order by 
    case 
      when lower(coalesce(pa.full_name, '')) = v_lower_query or lower(coalesce(pr.email, '')) = v_lower_query then 1
      when pa.id::text ilike v_clean_query or coalesce(pa.med_id_number, '') ilike v_clean_query then 2
      else 3
    end,
    pa.updated_at desc nulls last
  limit 25;
end;
$$;

GRANT EXECUTE ON FUNCTION public.medid_search_patients(text) TO authenticated;
