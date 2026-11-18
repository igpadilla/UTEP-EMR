-- cancel_sim_lobby: instructor cancels a lobby or draft simulation before it starts.
-- Sets status = 'ended' and notifies waiting students via realtime.

create function public.cancel_sim_lobby(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_status    text;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can cancel simulations.';
    end if;

    select status into v_status
    from public.simulations
    where id = p_sim_id;

    if v_status is null then
        raise exception 'Simulation not found.';
    end if;

    if v_status not in ('draft', 'lobby') then
        raise exception 'Only draft or lobby simulations can be cancelled (current: %).', v_status;
    end if;

    update public.simulations
    set status   = 'ended',
        ended_at = now(),
        ended_by = v_caller_id
    where id = p_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'lobby_cancelled',
            jsonb_build_object('previous_status', v_status));
end;
$$;

grant execute on function public.cancel_sim_lobby(uuid) to authenticated;
