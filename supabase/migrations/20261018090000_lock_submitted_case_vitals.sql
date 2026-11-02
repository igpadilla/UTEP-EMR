-- Once a student submits a case (pending review / completed), its vitals are locked.
-- They unlock again if the instructor returns the case (revision_requested).
-- Same statuses the case screen treats as editable (EDITABLE_STATUSES in StudentCases.jsx).

drop policy "Record vitals" on public.vital_sign_sets;

create policy "Record vitals"
on public.vital_sign_sets for insert to authenticated
with check (
    recorded_by = auth.uid()
    and source = 'recorded'
    and status = 'active'
    and public.has_permission('vitals.write')
    and (
        patient_id is not null
        or exists (
            select 1 from public.assigned_cases ac
            where ac.id = assigned_case_id
              and ac.student_id = auth.uid()
              and ac.encounter_status in ('not started', 'in progress', 'revision_requested')
        )
    )
);

drop policy "Mark own vitals entered in error" on public.vital_sign_sets;

create policy "Mark own vitals entered in error"
on public.vital_sign_sets for update to authenticated
using (
    recorded_by = auth.uid()
    and status = 'active'
    and (
        assigned_case_id is null
        or exists (
            select 1 from public.assigned_cases ac
            where ac.id = assigned_case_id
              and ac.encounter_status in ('not started', 'in progress', 'revision_requested')
        )
    )
)
with check (status = 'entered_in_error');
