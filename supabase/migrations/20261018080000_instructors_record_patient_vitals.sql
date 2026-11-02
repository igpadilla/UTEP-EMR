-- Instructors and admins set up the vitals of their own (live) patients,
-- which templates and cases will copy later. They have no clinical role,
-- so the "Record vitals" policy (vitals.write) does not cover them.
-- They still cannot record on a student's case: that copy is the student's work.
create policy "Instructors record vitals on live patients"
on public.vital_sign_sets for insert to authenticated
with check (
    patient_id is not null
    and recorded_by = auth.uid()
    and source = 'recorded'
    and status = 'active'
    and exists (
        select 1 from public.profiles
        where user_id = auth.uid()
          and account_type in ('admin', 'instructor')
    )
);
