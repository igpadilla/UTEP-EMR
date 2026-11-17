-- Simulation Script: actor scripts + per-check progress per encounter
-- Each encounter can have a script (narrative + checklist).
-- The assigned patient actor (or a manager) can check off items during the simulation.

-- ── Schema changes ─────────────────────────────────────────────────────────────

alter table public.simulation_encounters
    add column script          jsonb null,
    add column script_progress jsonb not null default '[]'::jsonb;
-- script format:          { narrative: text, checks: [{id: text, text: text}] }
-- script_progress format: ["check-id-1", "check-id-2"]  (array of checked item IDs)

-- ── Replace set_sim_encounters to persist script ───────────────────────────────

create or replace function public.set_sim_encounters(
    p_sim_id     uuid,
    p_encounters jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id      uuid := (select auth.uid());
    v_item             jsonb;
    v_arrival_type     text;
    v_assigned_med_id  uuid;
    v_actor_id       uuid;
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

        if not exists (
            select 1 from public.simulation_participants
            where simulation_id = p_sim_id
              and user_id = v_assigned_med_id
              and sim_role = 'med'
        ) then
            raise exception 'assigned_med_id must be a med participant in this simulation.';
        end if;

        if not exists (
            select 1 from public.simulation_participants
            where simulation_id = p_sim_id
              and user_id = v_actor_id
              and sim_role = 'patient_actor'
        ) then
            raise exception 'patient_actor_id must be a patient_actor participant in this simulation.';
        end if;
    end loop;

    delete from public.simulation_encounters where simulation_id = p_sim_id;

    for v_item in select * from jsonb_array_elements(p_encounters) loop
        v_arrival_type   := v_item->>'arrival_type';
        v_scheduled_time := case when (v_item->>'scheduled_time') is not null
                                 then (v_item->>'scheduled_time')::time
                                 else null end;

        insert into public.simulation_encounters (
            simulation_id, template_id, patient_actor_id, arrival_type,
            scheduled_time, assigned_med_id, script
        ) values (
            p_sim_id,
            (v_item->>'template_id')::uuid,
            (v_item->>'patient_actor_id')::uuid,
            v_arrival_type,
            v_scheduled_time,
            (v_item->>'assigned_med_id')::uuid,
            case when v_item->'script' is not null and v_item->>'script' <> 'null'
                 then v_item->'script' else null end
        );
    end loop;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'encounters_set',
            jsonb_build_object('count', jsonb_array_length(p_encounters)));
end;
$$;

-- ── update_script_progress ─────────────────────────────────────────────────────
-- The assigned patient actor or a sim manager can check off items during active sim.

create function public.update_script_progress(
    p_encounter_id uuid,
    p_checked_ids  jsonb   -- JSON array of check-item ID strings
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_enc record;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    select * into v_enc from public.simulation_encounters where id = p_encounter_id;
    if not found then
        raise exception 'Encounter not found.';
    end if;

    if v_enc.patient_actor_id <> (select auth.uid())
       and not private.can_manage_sim(v_enc.simulation_id) then
        raise exception 'Only the assigned patient actor or the instructor can update script progress.';
    end if;

    if not exists (
        select 1 from public.simulations
        where id = v_enc.simulation_id and status = 'active'
    ) then
        raise exception 'Simulation is not active.';
    end if;

    update public.simulation_encounters
    set script_progress = coalesce(p_checked_ids, '[]'::jsonb)
    where id = p_encounter_id;
end;
$$;

grant execute on function public.update_script_progress(uuid, jsonb) to authenticated;
