-- Review fixes for the Front Desk simulation (PR #49).

-- 1. The lobby migration added a 7-parameter create_simulation but kept the original
--    5-parameter one, so 5-argument calls fail with "function is not unique".
--    The app uses the 7-parameter version; its new parameters have defaults, so it covers both.
drop function if exists public.create_simulation(uuid, text, text, text, int);

-- 2. Simulation participants could read the full patient_templates rows (hidden diagnosis,
--    traps, rubric, answer key). Replace that policy with a function that returns only the
--    fields the simulation screens show, and only to participants or the managing instructor.
drop policy "sim participants read their encounter templates" on public.patient_templates;

create function public.get_sim_patients(p_sim_id uuid)
returns table (id uuid, patient_id uuid, first_name text, last_name text,
               age integer, sex text, chief_complaint text, clinical_baseline jsonb)
language sql stable security definer set search_path = '' as $$
    select distinct t.id, t.patient_id, t.first_name, t.last_name,
           t.age, t.sex, t.chief_complaint, t.clinical_baseline
    from public.simulation_encounters se
    join public.patient_templates t on t.id = se.template_id
    where se.simulation_id = p_sim_id
      and (private.is_sim_participant(p_sim_id) or private.can_manage_sim(p_sim_id));
$$;
revoke all on function public.get_sim_patients(uuid) from public, anon;
grant execute on function public.get_sim_patients(uuid) to authenticated;

-- 3. Only the course's instructor (or an admin) may list its students' emails.
--    Others get no rows (not an error) so course pages they can open still load.
create or replace function public.get_course_student_emails(p_course_id uuid)
returns table(user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not (public.is_admin() or private.owns_course(p_course_id)) then
        return;
    end if;

    return query
    select p.user_id, u.email::text
    from public.course_enrollments ce
    join public.profiles p on p.user_id = ce.student_id
    join auth.users u on u.id = p.user_id
    where ce.course_id = p_course_id;
end;
$$;
