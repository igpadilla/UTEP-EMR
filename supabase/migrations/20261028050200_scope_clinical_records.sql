-- Students work only on their own case copies; live patients are staff-only.
-- Fixes: any user could read/cancel any referral, write audit entries such as
-- CASE_SIGNED_OFF, read every live patient, and add visits as someone else.


-- --------------------------------------------------
-- Live patients, visits, appointments: admins and instructors only
-- --------------------------------------------------

drop policy "Authenticated users can read patients" on public.patients;

-- Fill in the author automatically, so callers that forget created_by still pass the check below.
alter table public.visits alter column created_by set default auth.uid();
alter table public.appointments alter column created_by set default auth.uid();

drop policy "Authenticated users can read visits" on public.visits;
drop policy "Authenticated users can insert visits" on public.visits;

create policy "Staff read visits"
on public.visits for select to authenticated
using (private.is_staff());

create policy "Staff add visits as themselves"
on public.visits for insert to authenticated
with check (private.is_staff() and created_by = auth.uid());

drop policy "Authenticated users can read appointments" on public.appointments;
drop policy "Authenticated users can insert appointments" on public.appointments;
drop policy "Authenticated users can update appointments" on public.appointments;

create policy "Staff read appointments"
on public.appointments for select to authenticated
using (private.is_staff());

create policy "Staff add appointments as themselves"
on public.appointments for insert to authenticated
with check (private.is_staff() and created_by = auth.uid());

create policy "Staff update appointments"
on public.appointments for update to authenticated
using (private.is_staff())
with check (private.is_staff());


-- --------------------------------------------------
-- Referrals: the case's student and instructor; live-patient referrals for staff
-- --------------------------------------------------

drop policy "Authenticated users can read referrals" on public.referrals;
drop policy "Authenticated users can create referrals" on public.referrals;
drop policy "Authenticated users can update referrals" on public.referrals;

create policy "Read referrals on own or managed records"
on public.referrals for select to authenticated
using (
    (case_id is not null and (private.is_case_student(case_id) or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
);

create policy "Create referrals on own or managed records"
on public.referrals for insert to authenticated
with check (
    referring_user_id = auth.uid()
    and (
        (case_id is not null and (
            (private.is_case_student(case_id) and private.is_case_editable(case_id))
            or private.can_manage_case(case_id)))
        or (case_id is null and private.is_staff())
    )
);

create policy "Update referrals on own or managed records"
on public.referrals for update to authenticated
using (
    (case_id is not null and (
        (private.is_case_student(case_id) and private.is_case_editable(case_id))
        or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
)
with check (
    (case_id is not null and (private.is_case_student(case_id) or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
);


-- --------------------------------------------------
-- Audit logs: students may only log their own actions on their own case
-- --------------------------------------------------

drop policy "Authenticated users insert own audit logs" on public.audit_logs;
drop policy "Instructors view audit logs for their cases" on public.audit_logs;

create policy "Insert own audit logs on own or managed cases"
on public.audit_logs for insert to authenticated
with check (
    actor_id = auth.uid()
    and (
        private.can_manage_case(case_id)
        or (
            private.is_case_student(case_id)
            and action_type in (
                'NOTES_SAVED', 'CASE_SUBMITTED', 'STATUS_CHANGED',
                'REFERRAL_REQUESTED', 'REFERRAL_ACCEPTED', 'REFERRAL_COMPLETED', 'REFERRAL_CANCELLED'
            )
        )
    )
);

create policy "Instructors view audit logs for managed cases"
on public.audit_logs for select to authenticated
using (private.can_manage_case(case_id));


-- --------------------------------------------------
-- Vitals: students record only on their own open case, by course discipline
-- --------------------------------------------------

drop policy "Record vitals" on public.vital_sign_sets;
drop policy "Read vitals on live patients" on public.vital_sign_sets;
drop policy "Read vitals on own cases" on public.vital_sign_sets;

-- Live-patient vitals are recorded by staff ("Instructors record vitals on live patients").
create policy "Record vitals on own case"
on public.vital_sign_sets for insert to authenticated
with check (
    recorded_by = auth.uid()
    and source = 'recorded'
    and status = 'active'
    and assigned_case_id is not null
    and public.can_record_case_vitals(assigned_case_id)
);

create policy "Staff read vitals on live patients"
on public.vital_sign_sets for select to authenticated
using (patient_id is not null and private.is_staff());

create policy "Read vitals on own or managed cases"
on public.vital_sign_sets for select to authenticated
using (
    assigned_case_id is not null
    and (private.is_case_student(assigned_case_id) or private.can_manage_case(assigned_case_id))
);
