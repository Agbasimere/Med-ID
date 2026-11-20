-- Migration: Fix medical report permissions, remove admin restriction for emergency doctors, and auto-grant
-- Med-ID Emergency Health Platform

-- 1. Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE ON public.medical_report_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_medical_history TO authenticated;
GRANT SELECT, INSERT ON public.notifications TO authenticated;

-- 2. Ensure RLS policies allow authenticated doctors to insert and select medical_report_requests
DROP POLICY IF EXISTS "Doctors can insert and manage report requests for their scanned" ON public.medical_report_requests;
CREATE POLICY "Doctors and admins can manage medical report requests"
  ON public.medical_report_requests
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = doctor_id OR 
    auth.uid() = patient_id OR 
    public.medid_has_role('doctor') OR 
    public.medid_is_admin()
  )
  WITH CHECK (
    auth.uid() = doctor_id OR 
    public.medid_has_role('doctor') OR 
    public.medid_is_admin()
  );

-- 3. Automatic 24-Hour Emergency Report Grant RPC
CREATE OR REPLACE FUNCTION public.medid_auto_grant_emergency_report(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_doctor_id uuid := auth.uid();
begin
  if v_doctor_id is null or not public.medid_has_role('doctor') then
    raise exception 'Active doctor credentials required for emergency record pull';
  end if;

  insert into public.medical_report_requests (
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
    v_doctor_id,
    p_patient_id,
    'granted',
    now(),
    v_doctor_id,
    now(),
    now(),
    now() + interval '24 hours'
  )
  on conflict (doctor_id, patient_id) do update set
    status = 'granted',
    granted_at = now(),
    expires_at = now() + interval '24 hours';

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.medid_auto_grant_emergency_report(uuid) TO authenticated;

-- 4. Update medid_get_medical_report to allow verified doctors and patients without manual admin gate
CREATE OR REPLACE FUNCTION public.medid_get_medical_report(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare 
  result jsonb;
begin
  if auth.uid() is null then 
    raise exception 'Sign in is required'; 
  end if;

  -- Allowed: The patient themselves, any active doctor attending the trauma bay, or admin
  if not (
    (auth.uid() = p_patient_id and public.medid_has_role('patient')) or
    public.medid_has_role('doctor') or
    public.medid_is_admin()
  ) then 
    raise exception 'Unauthorized to access medical records'; 
  end if;

  select jsonb_build_object(
    'legacy', jsonb_build_object(
      'blood_type', p.blood_type,
      'blood_group', coalesce(p.blood_group, p.blood_type),
      'genotype', p.genotype,
      'allergies', p.allergies,
      'conditions', p.conditions,
      'medications', p.medications,
      'surgeries', p.surgeries,
      'medical_history', p.medical_history,
      'updated_at', p.updated_at
    ),
    'entries', coalesce(
      (
        select jsonb_agg(to_jsonb(h) order by h.occurred_at desc, h.created_at desc) 
        from public.patient_medical_history h 
        where h.patient_id = p_patient_id
      ), 
      '[]'::jsonb
    )
  ) into result 
  from public.patients p 
  where p.id = p_patient_id;

  return result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.medid_get_medical_report(uuid) TO authenticated;
