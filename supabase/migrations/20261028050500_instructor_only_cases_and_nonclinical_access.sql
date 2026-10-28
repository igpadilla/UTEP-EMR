-- Two rules, added after the first five migrations:
--   1. Only instructors create and manage cases and templates. Admins manage accounts, not cases.
--   2. Non-clinical roles (front desk, biller) keep Patient Lookup; clinical students do not.


-- --------------------------------------------------
-- 1. Admins no longer create or manage cases or templates
-- --------------------------------------------------

drop policy "Admins manage all cases" on public.assigned_cases;
drop policy "Admins manage all templates" on public.patient_templates;

-- An admin can no longer assign a case to a student.
create or replace function private.can_assign_case(p_template_id uuid, p_student_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
            select 1 from public.course_enrollments ce
            join public.courses c on c.id = ce.course_id
            where ce.course_id = p_course_id
              and ce.student_id = p_student_id
              and c.instructor_id = auth.uid()
        )
        and not exists (
            select 1 from public.assigned_cases ac
            where ac.template_id = p_template_id
              and ac.student_id = p_student_id
              and ac.is_archived = false
        );
$$;

-- The instructor who assigned the case or who owns its course manages it. Nobody else does.
create or replace function private.can_manage_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_instructor() and exists (
        select 1 from public.assigned_cases ac
        left join public.courses c on c.id = ac.course_id
        where ac.id = p_case_id
          and (ac.assigned_by = auth.uid() or c.instructor_id = auth.uid())
    );
$$;

-- Grading reads the rubric criteria and traps from the template, so an instructor
-- who owns the course can read the template behind any case in it, whoever built it.
create or replace function private.teaches_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_instructor() and exists (
        select 1 from public.assigned_cases ac
        join public.courses c on c.id = ac.course_id
        where ac.template_id = p_template_id
          and c.instructor_id = auth.uid()
    );
$$;

revoke all on function private.teaches_template(uuid) from public;
grant execute on function private.teaches_template(uuid) to authenticated;

create policy "Course instructors read templates used in their courses"
on public.patient_templates for select to authenticated
using (private.teaches_template(id));


-- --------------------------------------------------
-- 2. Front desk and biller keep Patient Lookup
-- --------------------------------------------------

-- The role can come from the student's profile or from the discipline of a
-- course they are enrolled in. Clinical roles (nursing, PT...) never count.
create or replace function private.has_nonclinical_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.roles r
        join public.role_permissions rp on rp.role_id = r.role_id
        join public.permissions p on p.permission_id = rp.permission_id
        where r.is_clinical = false
          and p.permission_name = p_permission
          and (
              exists (
                  select 1 from public.profile_roles pr
                  where pr.user_id = auth.uid() and pr.role_id = r.role_id
              )
              or exists (
                  select 1
                  from public.course_enrollments ce
                  join public.courses c on c.id = ce.course_id
                  where ce.student_id = auth.uid() and c.discipline = r.role_name
              )
          )
    );
$$;

-- The app asks this to decide whether a student sees Patient Lookup.
create or replace function public.can_use_live_patients()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select private.is_staff() or private.has_nonclinical_permission('patient.read');
$$;

revoke all on function private.has_nonclinical_permission(text) from public;
revoke all on function public.can_use_live_patients() from public;
grant execute on function private.has_nonclinical_permission(text) to authenticated;
grant execute on function public.can_use_live_patients() to authenticated;

-- Admins and instructors already manage patients ("Admins and instructors can do all on patients").
create policy "Non-clinical roles read patients"
on public.patients for select to authenticated
using (private.has_nonclinical_permission('patient.read'));

drop policy "Staff read visits" on public.visits;
drop policy "Staff add visits as themselves" on public.visits;

create policy "Staff and non-clinical roles read visits"
on public.visits for select to authenticated
using (private.is_staff() or private.has_nonclinical_permission('patient.read'));

-- Completing an appointment writes a visit, so it follows appointment.update (front desk).
create policy "Staff and front desk add visits as themselves"
on public.visits for insert to authenticated
with check (
    created_by = auth.uid()
    and (private.is_staff() or private.has_nonclinical_permission('appointment.update'))
);

drop policy "Staff read appointments" on public.appointments;
drop policy "Staff add appointments as themselves" on public.appointments;
drop policy "Staff update appointments" on public.appointments;

create policy "Staff and front desk read appointments"
on public.appointments for select to authenticated
using (private.is_staff() or private.has_nonclinical_permission('appointment.read'));

create policy "Staff and front desk add appointments as themselves"
on public.appointments for insert to authenticated
with check (
    created_by = auth.uid()
    and (private.is_staff() or private.has_nonclinical_permission('appointment.create'))
);

create policy "Staff and front desk update appointments"
on public.appointments for update to authenticated
using (private.is_staff() or private.has_nonclinical_permission('appointment.update'))
with check (private.is_staff() or private.has_nonclinical_permission('appointment.update'));
