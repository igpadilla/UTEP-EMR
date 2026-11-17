-- open_sim_case: called by the assigned med student when they click "See patient".
-- Creates an assigned_cases row (if not already open) pre-populated from the
-- encounter's patient_template + clinical_baseline, transitions the encounter to
-- in_progress, and returns the case id.
-- The case can then be passed straight to PatientChart as caseId.

create function public.open_sim_case(p_encounter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id  uuid := (select auth.uid());
    v_enc        record;
    v_tmpl       record;
    v_sim        record;
    v_snapshot   jsonb;
    v_case_id    uuid;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    -- Load encounter
    select * into v_enc
    from public.simulation_encounters
    where id = p_encounter_id;

    if not found then
        raise exception 'Encounter not found.';
    end if;

    -- Caller must be the assigned med student for this encounter
    if v_enc.assigned_med_id is distinct from v_caller_id then
        raise exception 'Only the assigned med student can open this patient.';
    end if;

    -- Simulation must be active
    select * into v_sim
    from public.simulations
    where id = v_enc.simulation_id and status = 'active';

    if not found then
        raise exception 'Simulation is not active.';
    end if;

    -- If a case was already opened for this encounter, return it
    if v_enc.assigned_case_id is not null then
        return v_enc.assigned_case_id;
    end if;

    -- Load template for snapshot
    select * into v_tmpl
    from public.patient_templates
    where id = v_enc.template_id;

    if not found then
        raise exception 'Patient template not found.';
    end if;

    -- Build patient_snapshot: top-level fields merged with clinical_baseline.
    -- The snapshot_patient_chart trigger will only overwrite this if the template
    -- has a live patient_id — simulation templates typically do not.
    v_snapshot := jsonb_build_object(
        'first_name',      v_tmpl.first_name,
        'last_name',       v_tmpl.last_name,
        'age',             v_tmpl.age,
        'sex',             v_tmpl.sex,
        'chief_complaint', v_tmpl.chief_complaint
    ) || coalesce(v_tmpl.clinical_baseline, '{}'::jsonb);

    -- Insert case as security definer so the med student (non-instructor) can create it.
    insert into public.assigned_cases (
        template_id,
        student_id,
        assigned_by,
        course_id,
        patient_snapshot,
        encounter_status
    ) values (
        v_enc.template_id,
        v_caller_id,
        v_sim.instructor_id,
        v_sim.course_id,
        v_snapshot,
        'in progress'
    )
    returning id into v_case_id;

    -- Transition encounter: checked_in → in_progress
    update public.simulation_encounters
    set assigned_case_id = v_case_id,
        med_owner_id     = v_caller_id,
        status           = 'in_progress',
        med_started_at   = now()
    where id = p_encounter_id;

    -- Audit event
    insert into public.simulation_events (
        simulation_id, encounter_id, actor_id, event_type, payload
    ) values (
        v_enc.simulation_id,
        p_encounter_id,
        v_caller_id,
        'med_opened',
        jsonb_build_object('case_id', v_case_id)
    );

    return v_case_id;
end;
$$;

grant execute on function public.open_sim_case(uuid) to authenticated;
