-- Shared access checks for assigned cases.
-- One place decides who is the student on a case and who manages it,
-- so every case table (cases, vitals, referrals, audit logs, notes) uses the same rule.
-- security definer: these read assigned_cases/courses without re-triggering their RLS.

-- Active admin or active instructor.
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_admin() or public.is_instructor();
$$;

-- The signed-in user is the student on this case.
create or replace function private.is_case_student(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.assigned_cases ac
        where ac.id = p_case_id
          and ac.student_id = auth.uid()
    );
$$;

-- The signed-in user is the active instructor who owns this course.
create or replace function private.owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_instructor() and exists (
        select 1 from public.courses c
        where c.id = p_course_id and c.instructor_id = auth.uid()
    );
$$;

revoke all on function private.owns_course(uuid) from public;
grant execute on function private.owns_course(uuid) to authenticated;

-- The signed-in user manages this case:
-- an admin, the instructor who assigned it, or the instructor who owns its course.
create or replace function private.can_manage_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_admin() or (
        public.is_instructor()
        and exists (
            select 1 from public.assigned_cases ac
            left join public.courses c on c.id = ac.course_id
            where ac.id = p_case_id
              and (ac.assigned_by = auth.uid() or c.instructor_id = auth.uid())
        )
    );
$$;

-- The student can still work on the case (not submitted or completed).
create or replace function private.is_case_editable(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.assigned_cases ac
        where ac.id = p_case_id
          and ac.encounter_status in ('not started', 'in progress', 'revision_requested')
    );
$$;

-- The student on this case may record vitals on it.
-- The case's course discipline decides (e.g. a Nursing course has vitals.write).
-- Older cases without a course discipline fall back to the student's own clinical role.
create or replace function public.can_record_case_vitals(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.assigned_cases ac
        left join public.courses c on c.id = ac.course_id
        where ac.id = p_case_id
          and ac.student_id = auth.uid()
          and ac.encounter_status in ('not started', 'in progress', 'revision_requested')
          and case
                when c.discipline is not null
                    then public.has_permission_in_course(c.id, 'vitals.write')
                else public.has_permission('vitals.write')
              end
    );
$$;

revoke all on function private.is_staff() from public;
revoke all on function private.is_case_student(uuid) from public;
revoke all on function private.can_manage_case(uuid) from public;
revoke all on function private.is_case_editable(uuid) from public;
revoke all on function public.can_record_case_vitals(uuid) from public;

grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_case_student(uuid) to authenticated;
grant execute on function private.can_manage_case(uuid) to authenticated;
grant execute on function private.is_case_editable(uuid) to authenticated;
-- Public so the Vitals panel can ask before showing the "Record vitals" button.
grant execute on function public.can_record_case_vitals(uuid) to authenticated;
