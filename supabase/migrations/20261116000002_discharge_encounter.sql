-- Allows front desk (or a sim manager) to discharge a patient after med_complete.
-- Transitions med_complete → discharged and writes an event.

create function public.discharge_encounter(p_encounter_id uuid)
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

    -- Front desk participant or a sim manager
    if private.sim_role(v_enc.simulation_id) is distinct from 'front_desk'
       and not private.can_manage_sim(v_enc.simulation_id) then
        raise exception 'Only front desk participants can discharge patients.';
    end if;

    if not exists (
        select 1 from public.simulations
        where id = v_enc.simulation_id and status = 'active'
    ) then
        raise exception 'Simulation is not active.';
    end if;

    if v_enc.status <> 'med_complete' then
        raise exception 'Patient must be med_complete before discharge (current: %).', v_enc.status;
    end if;

    update public.simulation_encounters
    set status        = 'discharged',
        discharged_at = now(),
        discharged_by = v_caller_id
    where id = p_encounter_id;

    insert into public.simulation_events (
        simulation_id, encounter_id, actor_id, event_type, payload
    ) values (
        v_enc.simulation_id, p_encounter_id, v_caller_id, 'discharged',
        jsonb_build_object('encounter_id', p_encounter_id)
    );
end;
$$;

grant execute on function public.discharge_encounter(uuid) to authenticated;
