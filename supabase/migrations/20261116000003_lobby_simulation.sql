-- Lobby-based simulation: students join a waiting room, roles are randomly assigned.
-- Supports role switching (med ↔ front_desk with different patients in round 2).

-- ── Schema: simulations ───────────────────────────────────────────────────────

alter table public.simulations
    add column sim_type           text     not null default 'assigned'
                                  check (sim_type in ('assigned', 'lobby')),
    add column current_round      smallint not null default 1,
    add column lobby_template_ids jsonb;   -- array of template UUIDs for lobby mode

-- Drop old status constraint (auto-generated name varies) and add new one with 'lobby'
do $$
declare v_name text;
begin
    select conname into v_name
    from pg_constraint
    where conrelid = 'public.simulations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
    limit 1;
    if v_name is not null then
        execute 'alter table public.simulations drop constraint ' || quote_ident(v_name);
    end if;
end;
$$;

alter table public.simulations
    add constraint simulations_status_check
        check (status in ('draft', 'lobby', 'active', 'ended'));

-- ── Schema: simulation_participants ──────────────────────────────────────────

alter table public.simulation_participants
    add column round smallint not null default 1;

alter table public.simulation_participants
    drop constraint simulation_participants_simulation_id_user_id_key,
    add constraint simulation_participants_simulation_id_user_id_round_key
        unique (simulation_id, user_id, round);

-- ── Schema: simulation_encounters ─────────────────────────────────────────────

alter table public.simulation_encounters
    add column round smallint not null default 1;

-- ── New table: simulation_lobby_members ───────────────────────────────────────

create table public.simulation_lobby_members (
    id                   uuid        primary key default gen_random_uuid(),
    simulation_id        uuid        not null references public.simulations(id) on delete cascade,
    user_id              uuid        not null references public.profiles(user_id) on delete cascade,
    joined_at            timestamptz not null default now(),
    assigned_role        text        check (assigned_role in ('front_desk', 'med', 'patient_actor', 'observer')),
    assigned_template_id uuid        references public.patient_templates(id),
    discipline           text,
    unique (simulation_id, user_id)
);

create index on public.simulation_lobby_members (simulation_id);
create index on public.simulation_lobby_members (user_id);

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.simulation_lobby_members;
    end if;
end;
$$;

-- ── RLS: simulation_lobby_members ────────────────────────────────────────────

alter table public.simulation_lobby_members enable row level security;

create policy "lobby_members: active accounts only" on public.simulation_lobby_members
    as restrictive
    using (private.is_active_account());

-- Helper: is the caller in this simulation's lobby?
create function private.is_lobby_member(p_sim_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.simulation_lobby_members
        where simulation_id = p_sim_id
          and user_id = (select auth.uid())
    );
$$;

grant execute on function private.is_lobby_member(uuid) to authenticated;

create policy "lobby_members: managers and members read" on public.simulation_lobby_members
    for select
    using (
        private.can_manage_sim(simulation_id)
        or private.is_lobby_member(simulation_id)
        or private.is_sim_participant(simulation_id)
    );

create policy "lobby_members: managers write" on public.simulation_lobby_members
    for all
    using (private.can_manage_sim(simulation_id))
    with check (private.can_manage_sim(simulation_id));

-- ── RLS: lobby discovery ──────────────────────────────────────────────────────

create policy "simulations: lobby discovery for enrolled students" on public.simulations
    for select
    using (
        status = 'lobby'
        and private.is_active_account()
        and exists (
            select 1 from public.course_enrollments
            where course_id = simulations.course_id
              and student_id = (select auth.uid())
        )
    );

create policy "simulations: lobby members read" on public.simulations
    for select
    using (private.is_lobby_member(id));

-- ── Update private.sim_role to be round-aware ─────────────────────────────────

create or replace function private.sim_role(p_sim_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select sp.sim_role
    from public.simulation_participants sp
    join public.simulations s on s.id = p_sim_id
    where sp.simulation_id = p_sim_id
      and sp.user_id = (select auth.uid())
      and sp.round = s.current_round
    limit 1;
$$;

-- ── Public: get_my_sim_role ───────────────────────────────────────────────────

create function public.get_my_sim_role(p_sim_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select sp.sim_role
    from public.simulation_participants sp
    join public.simulations s on s.id = p_sim_id
    where sp.simulation_id = p_sim_id
      and sp.user_id = (select auth.uid())
      and sp.round = s.current_round
    limit 1;
$$;

grant execute on function public.get_my_sim_role(uuid) to authenticated;

-- ── Update create_simulation to support lobby type ────────────────────────────

create or replace function public.create_simulation(
    p_course_id           uuid,
    p_title               text,
    p_mode                text  default 'standard',
    p_end_mode            text  default 'workflow',
    p_duration_minutes    int   default null,
    p_sim_type            text  default 'assigned',
    p_lobby_template_ids  jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_sim_id    uuid;
    v_status    text;
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

    if p_sim_type not in ('assigned', 'lobby') then
        raise exception 'sim_type must be ''assigned'' or ''lobby''.';
    end if;

    if p_end_mode = 'timer' and (p_duration_minutes is null or p_duration_minutes <= 0) then
        raise exception 'Timer mode requires a positive duration_minutes.';
    end if;

    if p_sim_type = 'lobby' and (p_lobby_template_ids is null or jsonb_array_length(p_lobby_template_ids) < 1) then
        raise exception 'Lobby simulations require at least one patient template.';
    end if;

    v_status := case when p_sim_type = 'lobby' then 'lobby' else 'draft' end;

    insert into public.simulations (
        course_id, instructor_id, title, mode, end_mode, duration_minutes,
        sim_type, status, lobby_template_ids
    ) values (
        p_course_id, v_caller_id, p_title, p_mode, p_end_mode, p_duration_minutes,
        p_sim_type, v_status, p_lobby_template_ids
    )
    returning id into v_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (v_sim_id, v_caller_id,
            case when p_sim_type = 'lobby' then 'lobby_opened' else 'sim_created' end,
            jsonb_build_object('title', p_title, 'sim_type', p_sim_type));

    return v_sim_id;
end;
$$;

grant execute on function public.create_simulation(uuid, text, text, text, int, text, jsonb) to authenticated;

-- ── join_sim_lobby ────────────────────────────────────────────────────────────

create function public.join_sim_lobby(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id      uuid := (select auth.uid());
    v_course_id      uuid;
    v_instructor_id  uuid;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    select s.course_id, c.instructor_id
    into v_course_id, v_instructor_id
    from public.simulations s
    join public.courses c on c.id = s.course_id
    where s.id = p_sim_id and s.status = 'lobby';

    if not found then
        raise exception 'Simulation is not open for joining.';
    end if;

    if not (private.is_staff() or exists (
        select 1 from public.course_enrollments
        where course_id = v_course_id and student_id = v_caller_id
    )) then
        raise exception 'You must be enrolled in this course to join.';
    end if;

    -- Already joined → no-op
    if exists (
        select 1 from public.simulation_lobby_members
        where simulation_id = p_sim_id and user_id = v_caller_id
    ) then
        return;
    end if;

    insert into public.simulation_lobby_members (simulation_id, user_id, assigned_role)
    values (
        p_sim_id,
        v_caller_id,
        case when v_caller_id = v_instructor_id then 'patient_actor' else null end
    );

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'lobby_joined', jsonb_build_object('user_id', v_caller_id));
end;
$$;

grant execute on function public.join_sim_lobby(uuid) to authenticated;

-- ── leave_sim_lobby ───────────────────────────────────────────────────────────

create function public.leave_sim_lobby(p_sim_id uuid)
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

    if not exists (
        select 1 from public.simulations where id = p_sim_id and status = 'lobby'
    ) then
        raise exception 'Can only leave a lobby that is still open.';
    end if;

    delete from public.simulation_lobby_members
    where simulation_id = p_sim_id and user_id = v_caller_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'lobby_left', jsonb_build_object('user_id', v_caller_id));
end;
$$;

grant execute on function public.leave_sim_lobby(uuid) to authenticated;

-- ── auto_assign_lobby_roles ───────────────────────────────────────────────────
-- Shuffles non-instructor members and assigns: floor(N/2) med, floor(N/2) front_desk,
-- remainder as observer. Assigns lobby templates to med members (round 1 only).

create function public.auto_assign_lobby_roles(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id      uuid := (select auth.uid());
    v_sim            record;
    v_discipline     text;
    v_instructor_id  uuid;
    v_template_ids   uuid[];
    v_total          int;
    v_med_count      int;
    v_fd_count       int;
    v_rn             int := 0;
    v_user_id        uuid;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can assign roles.';
    end if;

    select s.*, c.discipline, c.instructor_id as inst_id
    into v_sim
    from public.simulations s
    join public.courses c on c.id = s.course_id
    where s.id = p_sim_id and s.status = 'lobby';

    if not found then
        raise exception 'Simulation is not in lobby status.';
    end if;

    v_instructor_id := v_sim.inst_id;
    v_discipline    := v_sim.discipline;

    -- Parse template IDs from lobby_template_ids
    select array(
        select (value)::uuid
        from jsonb_array_elements_text(v_sim.lobby_template_ids)
    ) into v_template_ids;

    -- Count non-instructor members
    select count(*) into v_total
    from public.simulation_lobby_members
    where simulation_id = p_sim_id and user_id <> v_instructor_id;

    if v_total = 0 then
        raise exception 'No students in the lobby to assign roles to.';
    end if;

    if array_length(v_template_ids, 1) < (v_total / 2) then
        raise exception 'Not enough templates. Need at least % for % med students.',
            (v_total / 2), (v_total / 2);
    end if;

    v_med_count := v_total / 2;
    v_fd_count  := v_total / 2;

    -- Clear existing assignments for non-instructor members
    update public.simulation_lobby_members
    set assigned_role = null, assigned_template_id = null, discipline = null
    where simulation_id = p_sim_id and user_id <> v_instructor_id;

    -- Assign roles in random order
    for v_user_id in
        select user_id
        from public.simulation_lobby_members
        where simulation_id = p_sim_id and user_id <> v_instructor_id
        order by random()
    loop
        v_rn := v_rn + 1;
        if v_rn <= v_med_count then
            update public.simulation_lobby_members
            set assigned_role        = 'med',
                discipline           = v_discipline,
                assigned_template_id = v_template_ids[v_rn]
            where simulation_id = p_sim_id and user_id = v_user_id;
        elsif v_rn <= v_med_count + v_fd_count then
            update public.simulation_lobby_members
            set assigned_role = 'front_desk'
            where simulation_id = p_sim_id and user_id = v_user_id;
        else
            update public.simulation_lobby_members
            set assigned_role = 'observer'
            where simulation_id = p_sim_id and user_id = v_user_id;
        end if;
    end loop;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'roles_assigned',
            jsonb_build_object('med_count', v_med_count, 'fd_count', v_fd_count));
end;
$$;

grant execute on function public.auto_assign_lobby_roles(uuid) to authenticated;

-- ── override_lobby_assignment ─────────────────────────────────────────────────

create function public.override_lobby_assignment(
    p_sim_id      uuid,
    p_user_id     uuid,
    p_new_role    text,
    p_template_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id  uuid := (select auth.uid());
    v_discipline text;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can override role assignments.';
    end if;

    if not exists (
        select 1 from public.simulations where id = p_sim_id and status = 'lobby'
    ) then
        raise exception 'Simulation is not in lobby status.';
    end if;

    if p_new_role not in ('front_desk', 'med', 'patient_actor', 'observer') then
        raise exception 'Invalid role: %', p_new_role;
    end if;

    if p_new_role = 'med' then
        select c.discipline into v_discipline
        from public.simulations s join public.courses c on c.id = s.course_id
        where s.id = p_sim_id;
    end if;

    update public.simulation_lobby_members
    set assigned_role        = p_new_role,
        assigned_template_id = case when p_new_role = 'med' then p_template_id else null end,
        discipline           = case when p_new_role = 'med' then v_discipline else null end
    where simulation_id = p_sim_id and user_id = p_user_id;

    if not found then
        raise exception 'User is not in the lobby.';
    end if;
end;
$$;

grant execute on function public.override_lobby_assignment(uuid, uuid, text, uuid) to authenticated;

-- ── start_lobby_simulation ────────────────────────────────────────────────────
-- lobby → active. Materialises participants + encounters from lobby assignments.

create function public.start_lobby_simulation(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id      uuid := (select auth.uid());
    v_sim            record;
    v_discipline     text;
    v_instructor_id  uuid;
    v_actor_id       uuid;
    v_member         record;
    v_med_arr        uuid[];
    v_tpl_arr        uuid[];
    v_i              int;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can start simulations.';
    end if;

    select s.*, c.discipline, c.instructor_id as inst_id
    into v_sim
    from public.simulations s
    join public.courses c on c.id = s.course_id
    where s.id = p_sim_id;

    if not found then
        raise exception 'Simulation not found.';
    end if;

    if v_sim.status <> 'lobby' then
        raise exception 'Simulation must be in lobby status to start (current: %).', v_sim.status;
    end if;

    if v_sim.sim_type <> 'lobby' then
        raise exception 'Use start_simulation for assigned simulations.';
    end if;

    -- Validate everyone has a role
    if exists (
        select 1 from public.simulation_lobby_members
        where simulation_id = p_sim_id and assigned_role is null
    ) then
        raise exception 'All lobby members must be assigned a role before starting.';
    end if;

    -- Validate med members have templates
    if exists (
        select 1 from public.simulation_lobby_members
        where simulation_id = p_sim_id and assigned_role = 'med' and assigned_template_id is null
    ) then
        raise exception 'All med students must have a patient template assigned.';
    end if;

    if not exists (
        select 1 from public.simulation_lobby_members
        where simulation_id = p_sim_id and assigned_role = 'med'
    ) then
        raise exception 'At least one med student is required.';
    end if;

    v_instructor_id := v_sim.inst_id;
    v_discipline    := v_sim.discipline;

    -- Determine patient_actor: instructor if they are assigned patient_actor, else null
    select user_id into v_actor_id
    from public.simulation_lobby_members
    where simulation_id = p_sim_id and assigned_role = 'patient_actor'
    limit 1;

    -- Create round-1 participants for all lobby members
    for v_member in
        select user_id, assigned_role, assigned_template_id, discipline
        from public.simulation_lobby_members
        where simulation_id = p_sim_id
        order by joined_at
    loop
        insert into public.simulation_participants (simulation_id, user_id, sim_role, discipline, round)
        values (
            p_sim_id,
            v_member.user_id,
            v_member.assigned_role,
            v_member.discipline,
            1
        );
    end loop;

    -- Gather med members and their templates
    select array_agg(user_id order by joined_at),
           array_agg(assigned_template_id order by joined_at)
    into v_med_arr, v_tpl_arr
    from public.simulation_lobby_members
    where simulation_id = p_sim_id and assigned_role = 'med';

    -- Create round-1 encounters for each med student
    for v_i in 1..array_length(v_med_arr, 1) loop
        insert into public.simulation_encounters (
            simulation_id, template_id, assigned_med_id, patient_actor_id,
            arrival_type, round, status
        ) values (
            p_sim_id,
            v_tpl_arr[v_i],
            v_med_arr[v_i],
            v_actor_id,  -- same actor for all (instructor) or null
            'walk_in',
            1,
            'expected'
        );
    end loop;

    -- Activate
    update public.simulations
    set status     = 'active',
        started_at = now(),
        ends_at    = case when v_sim.end_mode = 'timer'
                          then now() + (v_sim.duration_minutes * interval '1 minute')
                          else null end
    where id = p_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'sim_started',
            jsonb_build_object('mode', v_sim.mode, 'end_mode', v_sim.end_mode, 'sim_type', 'lobby'));
end;
$$;

grant execute on function public.start_lobby_simulation(uuid) to authenticated;

-- ── switch_sim_round ──────────────────────────────────────────────────────────
-- Swaps med ↔ front_desk roles. Old med → front_desk, old front_desk → med
-- with fresh templates (not used in round 1). Sets current_round = 2.

create function public.switch_sim_round(p_sim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id     uuid := (select auth.uid());
    v_sim           record;
    v_discipline    text;
    v_round1_tids   uuid[];
    v_all_tids      uuid[];
    v_avail_tids    uuid[];
    v_fd_users      uuid[];
    v_med_users     uuid[];
    v_actor_arr     uuid[];
    v_actor_id      uuid;
    v_i             int;
    v_uid           uuid;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    if not private.can_manage_sim(p_sim_id) then
        raise exception 'Only course instructors and admins can switch rounds.';
    end if;

    select s.*, c.discipline, c.instructor_id as inst_id
    into v_sim
    from public.simulations s
    join public.courses c on c.id = s.course_id
    where s.id = p_sim_id;

    if not found then raise exception 'Simulation not found.'; end if;
    if v_sim.status <> 'active' then
        raise exception 'Simulation must be active to switch rounds.';
    end if;
    if v_sim.sim_type <> 'lobby' then
        raise exception 'Role switching is only available for lobby simulations.';
    end if;
    if v_sim.current_round <> 1 then
        raise exception 'Role switch has already occurred (currently in round %).', v_sim.current_round;
    end if;

    v_discipline := v_sim.discipline;

    -- Templates used in round 1
    select array_agg(template_id) into v_round1_tids
    from public.simulation_encounters
    where simulation_id = p_sim_id and round = 1;

    -- All lobby templates
    select array(
        select (value)::uuid
        from jsonb_array_elements_text(v_sim.lobby_template_ids)
    ) into v_all_tids;

    -- Available (unused) templates
    select array(
        select t from unnest(v_all_tids) t
        where t <> all(coalesce(v_round1_tids, array[]::uuid[]))
    ) into v_avail_tids;

    -- Round 1 front_desk → become med in round 2
    select array_agg(user_id order by id) into v_fd_users
    from public.simulation_participants
    where simulation_id = p_sim_id and round = 1 and sim_role = 'front_desk';

    -- Round 1 med → become front_desk in round 2
    select array_agg(user_id order by id) into v_med_users
    from public.simulation_participants
    where simulation_id = p_sim_id and round = 1 and sim_role = 'med';

    -- Round 1 patient_actors → remain patient_actor in round 2
    select array_agg(user_id) into v_actor_arr
    from public.simulation_participants
    where simulation_id = p_sim_id and round = 1 and sim_role = 'patient_actor';

    if v_fd_users is null or array_length(v_fd_users, 1) = 0 then
        raise exception 'No front_desk participants to switch to med.';
    end if;

    if v_avail_tids is null
       or array_length(v_avail_tids, 1) < array_length(v_fd_users, 1) then
        raise exception 'Not enough unused templates for round 2. Have %, need %.',
            coalesce(array_length(v_avail_tids, 1), 0),
            array_length(v_fd_users, 1);
    end if;

    -- Determine patient_actor for round 2 encounters
    v_actor_id := case
        when v_actor_arr is not null and array_length(v_actor_arr, 1) > 0
        then v_actor_arr[1]  -- use first (typically the instructor)
        else null
    end;

    -- Create round-2 participants: old front_desk → med
    foreach v_uid in array v_fd_users loop
        insert into public.simulation_participants (simulation_id, user_id, sim_role, discipline, round)
        values (p_sim_id, v_uid, 'med', v_discipline, 2);
    end loop;

    -- Create round-2 participants: old med → front_desk
    if v_med_users is not null then
        foreach v_uid in array v_med_users loop
            insert into public.simulation_participants (simulation_id, user_id, sim_role, round)
            values (p_sim_id, v_uid, 'front_desk', 2);
        end loop;
    end if;

    -- Create round-2 participants: same patient_actors
    if v_actor_arr is not null then
        foreach v_uid in array v_actor_arr loop
            insert into public.simulation_participants (simulation_id, user_id, sim_role, round)
            values (p_sim_id, v_uid, 'patient_actor', 2);
        end loop;
    end if;

    -- Create round-2 encounters for each new med student (old front_desk)
    for v_i in 1..array_length(v_fd_users, 1) loop
        insert into public.simulation_encounters (
            simulation_id, template_id, assigned_med_id, patient_actor_id,
            arrival_type, round, status
        ) values (
            p_sim_id,
            v_avail_tids[v_i],
            v_fd_users[v_i],
            v_actor_id,
            'walk_in',
            2,
            'expected'
        );
    end loop;

    -- Advance round
    update public.simulations set current_round = 2 where id = p_sim_id;

    insert into public.simulation_events (simulation_id, actor_id, event_type, payload)
    values (p_sim_id, v_caller_id, 'round_switched',
            jsonb_build_object('new_round', 2, 'new_med_count', array_length(v_fd_users, 1)));
end;
$$;

grant execute on function public.switch_sim_round(uuid) to authenticated;

-- ── Fix sim_encounters read policy to include current-round lobby participants ─
-- The existing policy uses private.sim_role (now round-aware) which may return
-- null for lobby participants who haven't been assigned yet. Add a clause so
-- lobby members (pre-start) can't accidentally read encounters (there are none yet
-- in lobby status anyway, but be explicit).

-- Note: existing RLS policy "sim_encounters: role-scoped read" already handles
-- everything correctly because private.sim_role is now round-aware and
-- private.is_sim_participant remains round-agnostic (any round counts).
-- No changes needed to sim_encounters RLS.
