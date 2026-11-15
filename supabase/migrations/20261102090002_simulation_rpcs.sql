-- Front Desk + Live Simulation: state-transition RPCs
-- Spec: docs/SIMULATION_FRONT_DESK_SPEC.md §4
-- All RPCs: security definer, set search_path = '', write a simulation_events row,
-- reject inactive accounts, wrong role, wrong state, and (for active-sim RPCs) expired timer.

-- ── create_simulation ─────────────────────────────────────────────────────────
-- Creates a simulation in draft status for the given course.
-- Caller must be an instructor who owns the course, or an admin.

create function public.create_simulation(
    p_course_id        uuid,
    p_title            text,
    p_mode             text default 'standard',
    p_end_mode         text default 'workflow',
    p_duration_minutes int  default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_sim_id    uuid;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.is_staff() then
        raise exception 'Only instructors and admins can create simulations.';
    end if;

    if not public.is_admin() then
        if not exists (
            select 1 from public.courses
            where id = p_course_id and instructor_id = v_caller_id
        ) then
            raise exception 'You do not own this course.';
        end if;
    end if;

    if p_end_mode not in ('timer', 'workflow') then
        raise exception 'end_mode must be ''timer'' or ''workflow''.';
    end if;

    if p_mode not in ('standard', 'chaos') then
        raise exception 'mode must be ''standard'' or ''chaos''.';
    end if;

    if p_end_mode = 'timer' and (p_duration_minutes is null or p_duration_minutes <= 0) then
        raise exception 'Timer mode requires a positive duration_minutes.';
    end if;

    insert into public.simulations (
        course_id, instructor_id, title, mode, end_mode, duration_minutes
    ) values (
        p_course_id, v_caller_id, p_title, p_mode, p_end_mode, p_duration_minutes
    )
    returning id into v_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (v_sim_id, v_caller_id, 'sim_created',
            jsonb_build_object('title', p_title, 'mode', p_mode, 'end_mode', p_end_mode));

    return v_sim_id;
end;
$$;

grant execute on function public.create_simulation(uuid, text, text, text, int) to authenticated;

-- ── set_sim_participants ──────────────────────────────────────────────────────
-- Replaces the participant list while the simulation is in draft.
-- p_participants: [{user_id, sim_role, discipline?}]
-- Validates: one role per person, med requires discipline.

create function public.set_sim_participants(
    p_sim_id       uuid,
    p_participants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id  uuid := (select auth.uid());
    v_item       jsonb;
    v_sim_role   text;
    v_discipline text;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can configure simulations.';
    end if;

    if not exists (
        select 1 from public.simulations where id = p_sim_id and status = 'draft'
    ) then
        raise exception 'Simulation setup is locked once the simulation starts.';
    end if;

    -- One user_id must not appear twice
    if (select count(distinct p->>'user_id') from jsonb_array_elements(p_participants) p)
        < jsonb_array_length(p_participants) then
        raise exception 'Each person can have only one role per simulation.';
    end if;

    -- Validate each entry before making changes
    for v_item in select * from jsonb_array_elements(p_participants) loop
        v_sim_role   := v_item->>'sim_role';
        v_discipline := v_item->>'discipline';

        if v_sim_role not in ('front_desk', 'med', 'patient_actor', 'observer') then
            raise exception 'Invalid sim_role: %', v_sim_role;
        end if;

        if v_sim_role = 'med' and (v_discipline is null or trim(v_discipline) = '') then
            raise exception 'Med participants require a discipline.';
        end if;
    end loop;

    delete from public.simulation_participants where simulation_id = p_sim_id;

    for v_item in select * from jsonb_array_elements(p_participants) loop
        insert into public.simulation_participants (simulation_id, user_id, sim_role, discipline)
        values (
            p_sim_id,
            (v_item->>'user_id')::uuid,
            v_item->>'sim_role',
            nullif(trim(coalesce(v_item->>'discipline', '')), '')
        );
    end loop;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'participants_set',
            jsonb_build_object('count', jsonb_array_length(p_participants)));
end;
$$;

grant execute on function public.set_sim_participants(uuid, jsonb) to authenticated;

-- ── set_sim_encounters ────────────────────────────────────────────────────────
-- Replaces the encounter list while the simulation is in draft.
-- p_encounters: [{template_id, patient_actor_id, assigned_med_id, arrival_type, scheduled_time?}]
-- Validates: actor/med must already be participants; arrival_type constraints enforced.

create function public.set_sim_encounters(
    p_sim_id     uuid,
    p_encounters jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id        uuid := (select auth.uid());
    v_item             jsonb;
    v_arrival_type     text;
    v_assigned_med_id  uuid;
    v_actor_id         uuid;
    v_scheduled_time   time;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can configure simulations.';
    end if;

    if not exists (
        select 1 from public.simulations where id = p_sim_id and status = 'draft'
    ) then
        raise exception 'Simulation setup is locked once the simulation starts.';
    end if;

    -- Validate before making changes
    for v_item in select * from jsonb_array_elements(p_encounters) loop
        v_arrival_type    := v_item->>'arrival_type';
        v_assigned_med_id := (v_item->>'assigned_med_id')::uuid;
        v_actor_id        := (v_item->>'patient_actor_id')::uuid;

        if v_arrival_type not in ('scheduled', 'walk_in', 'new_patient') then
            raise exception 'Invalid arrival_type: %', v_arrival_type;
        end if;

        if v_arrival_type = 'scheduled' and (v_item->>'scheduled_time') is null then
            raise exception 'Scheduled encounters require a scheduled_time.';
        end if;

        -- assigned_med_id must be a med participant in this sim
        if not exists (
            select 1 from public.simulation_participants
            where simulation_id = p_sim_id
              and user_id = v_assigned_med_id
              and sim_role = 'med'
        ) then
            raise exception 'assigned_med_id must be a med participant in this simulation.';
        end if;

        -- patient_actor_id must be a patient_actor participant in this sim
        if not exists (
            select 1 from public.simulation_participants
            where simulation_id = p_sim_id
              and user_id = v_actor_id
              and sim_role = 'patient_actor'
        ) then
            raise exception 'patient_actor_id must be a patient_actor participant in this simulation.';
        end if;
    end loop;

    -- Encounters deleted during draft have no event rows referencing them yet, so delete is safe.
    delete from public.simulation_encounters where simulation_id = p_sim_id;

    for v_item in select * from jsonb_array_elements(p_encounters) loop
        v_arrival_type  := v_item->>'arrival_type';
        v_scheduled_time := case when (v_item->>'scheduled_time') is not null
                                 then (v_item->>'scheduled_time')::time
                                 else null end;

        insert into public.simulation_encounters (
            simulation_id, template_id, patient_actor_id, arrival_type,
            scheduled_time, assigned_med_id
        ) values (
            p_sim_id,
            (v_item->>'template_id')::uuid,
            (v_item->>'patient_actor_id')::uuid,
            v_arrival_type,
            v_scheduled_time,
            (v_item->>'assigned_med_id')::uuid
        );
    end loop;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'encounters_set',
            jsonb_build_object('count', jsonb_array_length(p_encounters)));
end;
$$;

grant execute on function public.set_sim_encounters(uuid, jsonb) to authenticated;

-- ── start_simulation ──────────────────────────────────────────────────────────
-- draft → active. Rejects if any encounter is missing an actor or med student.

create function public.start_simulation(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_sim       record;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can start simulations.';
    end if;

    select * into v_sim from public.simulations where id = p_sim_id;

    if not found then
        raise exception 'Simulation not found.';
    end if;

    if v_sim.status <> 'draft' then
        raise exception 'Simulation must be in draft status to start (current: %).', v_sim.status;
    end if;

    if not exists (
        select 1 from public.simulation_encounters where simulation_id = p_sim_id
    ) then
        raise exception 'Simulation must have at least one encounter to start.';
    end if;

    -- Standard mode: every encounter must have actor and med assigned
    if exists (
        select 1 from public.simulation_encounters
        where simulation_id = p_sim_id
          and (patient_actor_id is null or assigned_med_id is null)
    ) then
        raise exception 'Every encounter must have a patient actor and a med student assigned.';
    end if;

    update public.simulations
    set status    = 'active',
        started_at = now(),
        ends_at    = case when v_sim.end_mode = 'timer'
                          then now() + (v_sim.duration_minutes * interval '1 minute')
                          else null end
    where id = p_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'sim_started',
            jsonb_build_object('mode', v_sim.mode, 'end_mode', v_sim.end_mode));
end;
$$;

grant execute on function public.start_simulation(uuid) to authenticated;

-- ── stop_simulation ───────────────────────────────────────────────────────────
-- active → ended (end_reason = 'stopped'). Staff only. Included so test runs can be closed.

create function public.stop_simulation(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can stop simulations.';
    end if;

    if not exists (
        select 1 from public.simulations where id = p_sim_id and status = 'active'
    ) then
        raise exception 'Simulation must be active to stop.';
    end if;

    update public.simulations
    set status     = 'ended',
        ended_at   = now(),
        ended_by   = v_caller_id,
        end_reason = 'stopped'
    where id = p_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'sim_ended',
            jsonb_build_object('end_reason', 'stopped'));
end;
$$;

grant execute on function public.stop_simulation(uuid) to authenticated;

-- ── check_in_encounter ────────────────────────────────────────────────────────
-- expected → checked_in in one step (arrived status preserved for future split).
-- Caller must be a front_desk participant in the encounter's simulation.
-- No room argument in this commit; RoomsSlot.jsx is the Rooms team handoff point.

create function public.check_in_encounter(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_enc       record;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    select * into v_enc from public.simulation_encounters where id = p_encounter_id;

    if not found then
        raise exception 'Encounter not found.';
    end if;

    if private.sim_role(v_enc.simulation_id) is distinct from 'front_desk' then
        raise exception 'Only front desk participants can check in patients.';
    end if;

    if not exists (
        select 1 from public.simulations
        where id = v_enc.simulation_id and status = 'active'
    ) then
        raise exception 'Simulation is not active.';
    end if;

    -- Reject if timer has expired
    if exists (
        select 1 from public.simulations
        where id = v_enc.simulation_id
          and ends_at is not null and ends_at < now()
    ) then
        raise exception 'Simulation time has expired.';
    end if;

    if v_enc.status <> 'expected' then
        raise exception 'Encounter cannot be checked in (current status: %).', v_enc.status;
    end if;

    update public.simulation_encounters
    set status        = 'checked_in',
        checked_in_at = now(),
        checked_in_by = v_caller_id
    where id = p_encounter_id;

    insert into public.simulation_events (
        simulation_id, encounter_id, actor_id, event_type, payload
    ) values (
        v_enc.simulation_id, p_encounter_id, v_caller_id, 'checked_in',
        jsonb_build_object('encounter_id', p_encounter_id)
    );
end;
$$;

grant execute on function public.check_in_encounter(uuid) to authenticated;
