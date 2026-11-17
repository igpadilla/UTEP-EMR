-- Allows the assigned med student (or a sim manager) to mark their encounter complete.
-- Transitions in_progress → med_complete and writes an event.

create function public.complete_med_encounter(p_encounter_id uuid)
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

    if v_enc.assigned_med_id <> v_caller_id
       and not private.can_manage_sim(v_enc.simulation_id) then
        raise exception 'Only the assigned med student can complete this encounter.';
    end if;

    if not exists (
        select 1 from public.simulations
        where id = v_enc.simulation_id and status = 'active'
    ) then
        raise exception 'Simulation is not active.';
    end if;

    if v_enc.status not in ('checked_in', 'in_progress') then
        raise exception 'Encounter must be checked in or in progress to mark complete (current: %).', v_enc.status;
    end if;

    update public.simulation_encounters
    set status           = 'med_complete',
        med_completed_at = now()
    where id = p_encounter_id;

    insert into public.simulation_events (
        simulation_id, encounter_id, actor_id, event_type, payload
    ) values (
        v_enc.simulation_id, p_encounter_id, v_caller_id, 'med_complete',
        jsonb_build_object('encounter_id', p_encounter_id)
    );
end;
$$;

grant execute on function public.complete_med_encounter(uuid) to authenticated;
