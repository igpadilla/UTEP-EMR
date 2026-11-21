-- Virtual rooms for educational simulations.
-- Separate from the real rooms and room_occupancies tables.
create table public.simulation_rooms (
    id uuid primary key default gen_random_uuid(),

    simulation_id uuid not null
        references public.simulations(id)
        on delete cascade,

    round smallint not null default 1
        check (round >= 1),

    room_number integer not null
        check (room_number between 1 and 50),

    -- Background occupancy represents simulated patients
    -- who are not part of a student encounter.
    is_background_occupied boolean not null default false,

    created_at timestamptz not null default now(),

    -- Each simulation round has its own room inventory.
    unique (simulation_id, round, room_number),

    -- Needed for round-safe composite references later.
    unique (id, simulation_id, round)
);

create index simulation_rooms_simulation_round_idx
    on public.simulation_rooms (simulation_id, round);

-- Tracks virtual room assignments to simulation encounters.
-- Released assignments remain available for historical review.
create table public.simulation_room_assignments (
    id uuid primary key default gen_random_uuid(),

    simulation_id uuid not null,
    round smallint not null,

    simulation_room_id uuid not null,

    encounter_id uuid not null
        references public.simulation_encounters(id)
        on delete cascade,

    assigned_at timestamptz not null default now(),

    assigned_by uuid not null
        references public.profiles(user_id),

    released_at timestamptz null,

    released_by uuid null
        references public.profiles(user_id),

    foreign key (simulation_room_id, simulation_id, round)
        references public.simulation_rooms(id, simulation_id, round),

    check (released_at is null or released_at >= assigned_at)
);

-- Prevent two active encounters from occupying the same room.
create unique index simulation_room_one_active_assignment
    on public.simulation_room_assignments (simulation_room_id)
    where released_at is null;

-- Prevent one encounter from having multiple active rooms.
create unique index simulation_encounter_one_active_room
    on public.simulation_room_assignments (encounter_id)
    where released_at is null;

-- Support room lookups and occupancy history.
create index simulation_room_assignments_lookup_idx
    on public.simulation_room_assignments
    (simulation_id, round, simulation_room_id);

-- Allow room assignments to reference an encounter together with its simulation and round.
alter table public.simulation_encounters
    add constraint simulation_encounters_id_sim_round_unique
    unique (id, simulation_id, round);

-- Ensure the encounter belongs to the same simulation and round as the assigned virtual room.
alter table public.simulation_room_assignments
    add constraint simulation_room_assignments_encounter_fk
    foreign key (encounter_id, simulation_id, round)
    references public.simulation_encounters
        (id, simulation_id, round)
    on delete cascade;

-- Initializes 50 virtual rooms for one simulation round.
-- Existing room inventories are never regenerated.
create function private.initialize_simulation_rooms(
    p_sim_id uuid,
    p_round smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_room_number integer;
begin
    -- Verify the simulation exists.
    if not exists (
        select 1
        from public.simulations
        where id = p_sim_id
    ) then
        raise exception 'Simulation not found.';
    end if;

    if p_round is null or p_round < 1 then
        raise exception 'Invalid simulation round.';
    end if;

    -- Prevent concurrent initialization of the same
    -- simulation by locking its parent record.
    perform 1
    from public.simulations
    where id = p_sim_id
    for update;

    -- Do not regenerate an existing inventory.
    if exists (
        select 1
        from public.simulation_rooms
        where simulation_id = p_sim_id
          and round = p_round
    ) then
        return;
    end if;

    -- Generate 50 virtual rooms.
    for v_room_number in 1..50 loop
        insert into public.simulation_rooms (
            simulation_id,
            round,
            room_number,
            is_background_occupied
        )
        values (
            p_sim_id,
            p_round,
            v_room_number,
            random() < 0.30
        );
    end loop;
end;
$$;

-- This is an internal helper, not a student-facing RPC.
revoke all on function
    private.initialize_simulation_rooms(uuid, smallint)
    from public, anon, authenticated;

-- Enable Row Level Security for virtual simulation rooms.
alter table public.simulation_rooms
    enable row level security;

alter table public.simulation_room_assignments
    enable row level security;

-- Participants in the current simulation round and simulation managers can view the virtual rooms.
create policy "simulation_rooms: authorized read"
on public.simulation_rooms
for select
to authenticated
using (
    (
        round = (
            select s.current_round
            from public.simulations s
            where s.id = simulation_id
        )
        and private.sim_role(simulation_id) is not null
    )
    or private.can_manage_sim(simulation_id)
);

-- Authorized users can view current-round room assignments.
create policy "simulation_room_assignments: authorized read"
on public.simulation_room_assignments
for select
to authenticated
using (
    (
        round = (
            select s.current_round
            from public.simulations s
            where s.id = simulation_id
        )
        and private.sim_role(simulation_id) is not null
    )
    or private.can_manage_sim(simulation_id)
);

-- Initialize virtual rooms when a simulation starts or advances to a new round.
create function private.initialize_rooms_on_simulation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'active'
       and (
           old.status is distinct from 'active'
           or new.current_round is distinct from old.current_round
       ) then

        perform private.initialize_simulation_rooms(
            new.id,
            new.current_round
        );

    end if;

    return new;
end;
$$;

create trigger initialize_simulation_rooms_trigger
after update of status, current_round
on public.simulations
for each row
execute function private.initialize_rooms_on_simulation_change();

-- Assign an available virtual room to a checked-in encounter.
-- Only the current-round Front Desk participant may assign rooms.
create function public.assign_simulation_room(
    p_encounter_id uuid,
    p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid := (select auth.uid());
    v_enc public.simulation_encounters%rowtype;
    v_room public.simulation_rooms%rowtype;
begin
    if not private.is_active_account() then
        raise exception 'Account is inactive.';
    end if;

    -- Lock the encounter to serialize assignments to it.
    select * into v_enc
    from public.simulation_encounters
    where id = p_encounter_id
    for update;

    if not found then
        raise exception 'Encounter not found.';
    end if;

    if private.sim_role(v_enc.simulation_id)
       is distinct from 'front_desk' then
        raise exception 'Only front desk participants can assign rooms.';
    end if;

    if not exists (
        select 1
        from public.simulations
        where id = v_enc.simulation_id
          and status = 'active'
          and current_round = v_enc.round
          and (ends_at is null or ends_at >= now())
    ) then
        raise exception 'Simulation is not active for this round.';
    end if;

    if v_enc.status <> 'checked_in' then
        raise exception 'Patient must be checked in before room assignment.';
    end if;

    -- Lock the room to serialize competing assignments.
    select * into v_room
    from public.simulation_rooms
    where id = p_room_id
    for update;

    if not found then
        raise exception 'Simulation room not found.';
    end if;

    if v_room.simulation_id <> v_enc.simulation_id
       or v_room.round <> v_enc.round then
        raise exception 'Room does not belong to this simulation round.';
    end if;

    if v_room.is_background_occupied then
        raise exception 'Room is occupied by a background patient.';
    end if;

    if exists (
        select 1
        from public.simulation_room_assignments
        where simulation_room_id = p_room_id
          and released_at is null
    ) then
        raise exception 'Room is already occupied.';
    end if;

    if exists (
        select 1
        from public.simulation_room_assignments
        where encounter_id = p_encounter_id
          and released_at is null
    ) then
        raise exception 'Encounter already has an assigned room.';
    end if;

    insert into public.simulation_room_assignments (
        simulation_id,
        round,
        simulation_room_id,
        encounter_id,
        assigned_by
    )
    values (
        v_enc.simulation_id,
        v_enc.round,
        p_room_id,
        p_encounter_id,
        v_caller_id
    );

    insert into public.simulation_events (
        simulation_id,
        encounter_id,
        actor_id,
        event_type,
        payload
    )
    values (
        v_enc.simulation_id,
        p_encounter_id,
        v_caller_id,
        'room_assigned',
        jsonb_build_object(
            'room_id', p_room_id,
            'room_number', v_room.room_number,
            'round', v_enc.round
        )
    );
end;
$$;

revoke all on function
    public.assign_simulation_room(uuid, uuid)
    from public, anon;

grant execute on function
    public.assign_simulation_room(uuid, uuid)
    to authenticated;

-- Automatically release a virtual room when its simulation encounter is discharged.
create function private.release_simulation_room_on_discharge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_room_id uuid;
    v_room_number integer;
begin
    -- Only process a transition into discharged status.
    if new.status = 'discharged'
       and old.status is distinct from 'discharged' then

        -- Release the encounter's active room assignment.   
        update public.simulation_room_assignments
        set released_at = greatest(
                clock_timestamp(),
                assigned_at
            ),
            released_by = new.discharged_by
        where encounter_id = new.id
        and released_at is null
        returning simulation_room_id into v_room_id;

        -- Record a release event only if a room was assigned.
        if v_room_id is not null then

            select room_number into v_room_number
            from public.simulation_rooms
            where id = v_room_id;

            insert into public.simulation_events (
                simulation_id,
                encounter_id,
                actor_id,
                event_type,
                payload
            )
            values (
                new.simulation_id,
                new.id,
                new.discharged_by,
                'room_released',
                jsonb_build_object(
                    'room_id', v_room_id,
                    'room_number', v_room_number,
                    'round', new.round
                )
            );
        end if;
    end if;

    return new;
end;
$$;

create trigger release_simulation_room_on_discharge_trigger
after update of status
on public.simulation_encounters
for each row
execute function private.release_simulation_room_on_discharge();

-- Allow authenticated users to read simulation room data.
-- RLS policies still determine which records they can see.
grant select on public.simulation_rooms
to authenticated;

grant select on public.simulation_room_assignments
to authenticated;

-- Enable Supabase Realtime for virtual room assignments.
ALTER PUBLICATION supabase_realtime
ADD TABLE public.simulation_room_assignments;

