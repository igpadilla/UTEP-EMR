-- Front Desk + Live Simulation: private helpers + RLS
-- Spec: docs/SIMULATION_FRONT_DESK_SPEC.md §4 (helpers), §5 (RLS)

-- ── Private helpers ───────────────────────────────────────────────────────────

-- Returns the caller's sim_role in the given simulation, or NULL if not a participant.
create function private.sim_role(p_sim_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select sim_role
    from public.simulation_participants
    where simulation_id = p_sim_id
      and user_id = (select auth.uid());
$$;

-- Returns true if the caller is any participant in the given simulation.
create function private.is_sim_participant(p_sim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.simulation_participants
        where simulation_id = p_sim_id
          and user_id = (select auth.uid())
    );
$$;

-- Returns true if the caller is an admin or the instructor of the simulation's course.
create function private.can_manage_sim(p_sim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_admin()
        or exists (
            select 1
            from public.simulations s
            join public.courses c on c.id = s.course_id
            where s.id = p_sim_id
              and c.instructor_id = (select auth.uid())
              and exists (
                  select 1 from public.profiles
                  where user_id = (select auth.uid()) and active = true
              )
        );
$$;

grant execute on function private.sim_role(uuid)         to authenticated;
grant execute on function private.is_sim_participant(uuid) to authenticated;
grant execute on function private.can_manage_sim(uuid)   to authenticated;

-- ── RLS: simulations ─────────────────────────────────────────────────────────

alter table public.simulations enable row level security;

create policy "simulations: active accounts only" on public.simulations
    as restrictive
    using (private.is_active_account());

create policy "simulations: managers and participants read" on public.simulations
    for select
    using (
        private.can_manage_sim(id) or private.is_sim_participant(id)
    );

create policy "simulations: staff insert" on public.simulations
    for insert
    with check (private.is_staff());

create policy "simulations: managers update" on public.simulations
    for update
    using (private.can_manage_sim(id));

create policy "simulations: managers delete" on public.simulations
    for delete
    using (private.can_manage_sim(id));

-- ── RLS: simulation_participants ─────────────────────────────────────────────

alter table public.simulation_participants enable row level security;

create policy "sim_participants: active accounts only" on public.simulation_participants
    as restrictive
    using (private.is_active_account());

-- All participants in the same sim can see each other (front desk needs the roster).
-- Review columns (instructor_feedback, rubric_scores) are present but only filled post-sim.
create policy "sim_participants: managers and co-participants read" on public.simulation_participants
    for select
    using (
        private.can_manage_sim(simulation_id)
        or private.is_sim_participant(simulation_id)
    );

-- Only managers write participant rows directly (RPCs also write as security definer).
create policy "sim_participants: managers write" on public.simulation_participants
    for all
    using (private.can_manage_sim(simulation_id))
    with check (private.can_manage_sim(simulation_id));

-- ── RLS: simulation_encounters ───────────────────────────────────────────────

alter table public.simulation_encounters enable row level security;

create policy "sim_encounters: active accounts only" on public.simulation_encounters
    as restrictive
    using (private.is_active_account());

-- front_desk, med, and observer participants see all encounters in their sim.
-- patient_actor sees only the encounter they are assigned to.
-- Managers see all.
create policy "sim_encounters: role-scoped read" on public.simulation_encounters
    for select
    using (
        private.can_manage_sim(simulation_id)
        or (
            private.is_sim_participant(simulation_id)
            and private.sim_role(simulation_id) in ('front_desk', 'med', 'observer')
        )
        or (
            patient_actor_id = (select auth.uid())
            and private.is_sim_participant(simulation_id)
        )
    );

-- No direct INSERT/UPDATE/DELETE from clients — all writes go through RPCs (security definer).

-- ── RLS: simulation_events ───────────────────────────────────────────────────

alter table public.simulation_events enable row level security;

create policy "sim_events: active accounts only" on public.simulation_events
    as restrictive
    using (private.is_active_account());

create policy "sim_events: managers and participants read" on public.simulation_events
    for select
    using (
        private.can_manage_sim(simulation_id)
        or private.is_sim_participant(simulation_id)
    );

-- No direct INSERT from clients — all writes go through RPCs (security definer).

-- Grant USAGE on the bigserial sequence so RLS (not sequence ownership) is the blocker
-- when a non-privileged user attempts a direct INSERT into simulation_events.
grant usage on sequence public.simulation_events_id_seq to authenticated;
