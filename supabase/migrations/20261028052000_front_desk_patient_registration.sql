-- Front desk registers patients, and the app asks one question to decide which
-- live-patient buttons to show, so a biller is not offered actions they cannot take.


-- --------------------------------------------------
-- 1. Front desk registers patients (the role already holds patient.create)
-- --------------------------------------------------

create policy "Front desk register patients"
on public.patients for insert to authenticated
with check (private.has_nonclinical_permission('patient.create'));


-- --------------------------------------------------
-- 2. One call for what the signed-in user may do with live patients
-- --------------------------------------------------

-- Replaces can_use_live_patients(), which only answered the read question.
create or replace function public.my_live_patient_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'read',     private.is_staff() or private.has_nonclinical_permission('patient.read'),
        'register', private.is_staff() or private.has_nonclinical_permission('patient.create'),
        'schedule', private.is_staff() or private.has_nonclinical_permission('appointment.create'),
        'checkIn',  private.is_staff() or private.has_nonclinical_permission('appointment.update')
    );
$$;

revoke all on function public.my_live_patient_access() from public;
grant execute on function public.my_live_patient_access() to authenticated;

drop function public.can_use_live_patients();
