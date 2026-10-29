-- Referrals are part of the patient's chart. A case built from a patient gets a
-- copy of the chart's referrals when it is assigned, so the instructor manages
-- them on the chart (Referrals tab) instead of in the template builder.
-- Each student works on their own copy; later chart changes do not reach it.

create or replace function private.copy_patient_referrals_to_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    source_patient uuid := private.case_source_patient(new.id);
begin
    if source_patient is null then
        return new;
    end if;

    insert into public.referrals (
        case_id, referring_user_id, target_discipline, priority, status,
        reason, notes, response_notes, created_at
    )
    select
        new.id, coalesce(new.assigned_by, r.referring_user_id), r.target_discipline, r.priority, r.status,
        r.reason, r.notes, r.response_notes, r.created_at
    from public.referrals r
    where r.patient_id = source_patient;

    return new;
end;
$$;

create trigger copy_patient_referrals_to_case
after insert on public.assigned_cases
for each row execute function private.copy_patient_referrals_to_case();
