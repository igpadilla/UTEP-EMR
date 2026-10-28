-- Each student works only on their own copy of a case, and only on their notes.
-- Fixes: students could set their own score/status/feedback, keep editing after
-- submitting, and read the hidden diagnosis and traps of their case template.


-- --------------------------------------------------
-- 1. Students change only their notes and submit, while the case is open
-- --------------------------------------------------

create or replace function private.guard_student_case_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Admins, the case's instructor, and server code (no signed-in user) are not limited here.
    if auth.uid() is null or private.can_manage_case(old.id) then
        return new;
    end if;

    if old.encounter_status not in ('not started', 'in progress', 'revision_requested') then
        raise exception 'This case was submitted and can no longer be changed.';
    end if;

    -- A student can start the case or submit it; nothing else.
    if new.encounter_status is distinct from old.encounter_status
       and new.encounter_status not in ('in progress', 'pending review') then
        raise exception 'Students can only start or submit a case.';
    end if;

    -- Every other column must stay the same (score, feedback, archive, student, course...).
    if (to_jsonb(new) - 'encounter_notes' - 'encounter_status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'encounter_notes' - 'encounter_status' - 'updated_at') then
        raise exception 'Students can only change their case notes.';
    end if;

    return new;
end;
$$;

create trigger guard_student_case_update
before update on public.assigned_cases
for each row execute function private.guard_student_case_update();


-- --------------------------------------------------
-- 2. Instructors see and manage cases they assigned OR cases in their courses
-- --------------------------------------------------

drop policy "Instructors view assigned cases" on public.assigned_cases;
drop policy "Instructors update assigned cases" on public.assigned_cases;
drop policy "Instructors insert cases" on public.assigned_cases;

-- Written out on the row (not through can_manage_case) so a new case can be read back right after insert.
create policy "Instructors view managed cases"
on public.assigned_cases for select to authenticated
using ((assigned_by = auth.uid() and public.is_instructor()) or private.owns_course(course_id));

create policy "Instructors update managed cases"
on public.assigned_cases for update to authenticated
using ((assigned_by = auth.uid() and public.is_instructor()) or private.owns_course(course_id))
with check ((assigned_by = auth.uid() and public.is_instructor()) or private.owns_course(course_id));

-- A case goes to a student enrolled in one of the instructor's courses,
-- and a student gets one open copy of the same template at a time.
create function private.can_assign_case(p_template_id uuid, p_student_id uuid, p_course_id uuid)
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
              and (c.instructor_id = auth.uid() or public.is_admin())
        )
        and not exists (
            select 1 from public.assigned_cases ac
            where ac.template_id = p_template_id
              and ac.student_id = p_student_id
              and ac.is_archived = false
        );
$$;

revoke all on function private.can_assign_case(uuid, uuid, uuid) from public;
grant execute on function private.can_assign_case(uuid, uuid, uuid) to authenticated;

create policy "Instructors assign cases to their course students"
on public.assigned_cases for insert to authenticated
with check (
    assigned_by = auth.uid()
    and public.is_instructor()
    and private.can_assign_case(template_id, student_id, course_id)
);


-- --------------------------------------------------
-- 3. Students never see the answer key
-- --------------------------------------------------

-- The template row holds hidden_diagnosis, traps and rubric_criteria.
-- Students already get everything they need in patient_snapshot.
drop policy "Students can read assigned templates" on public.patient_templates;

-- Snapshots used to copy the traps and rubric criteria too.
-- Grading reads the criteria from the template, which instructors still see.
-- Strip them from every new or changed snapshot...
create or replace function private.strip_answer_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.patient_snapshot := new.patient_snapshot - 'traps' - 'rubric_criteria';
    return new;
end;
$$;

create trigger strip_answer_key
before insert or update of patient_snapshot on public.assigned_cases
for each row execute function private.strip_answer_key();

-- ...and from the ones already saved.
update public.assigned_cases
set patient_snapshot = patient_snapshot - 'traps' - 'rubric_criteria'
where patient_snapshot ? 'traps' or patient_snapshot ? 'rubric_criteria';
