-- Front Desk + Live Simulation: core tables
-- Spec: docs/SIMULATION_FRONT_DESK_SPEC.md §3.1–3.3, §3.5

-- ── simulations ──────────────────────────────────────────────────────────────

create table public.simulations (
    id               uuid        primary key default gen_random_uuid(),
    course_id        uuid        not null references public.courses(id) on delete cascade,
    instructor_id    uuid        not null references public.profiles(user_id),
    title            text        not null,
    status           text        not null default 'draft'
                                 check (status in ('draft', 'active', 'ended')),
    mode             text        not null default 'standard'
                                 check (mode in ('standard', 'chaos')),
    end_mode         text        not null
                                 check (end_mode in ('timer', 'workflow')),
    duration_minutes int         null,
    started_at       timestamptz null,
    ends_at          timestamptz null,
    ended_at         timestamptz null,
    ended_by         uuid        null references public.profiles(user_id),
    end_reason       text        null
                                 check (end_reason in ('timer', 'workflow_complete', 'stopped')),
    created_at       timestamptz not null default now(),
    check (end_mode <> 'timer' or duration_minutes > 0)
);

-- ── simulation_participants ───────────────────────────────────────────────────

create table public.simulation_participants (
    id                  uuid        primary key default gen_random_uuid(),
    simulation_id       uuid        not null references public.simulations(id) on delete cascade,
    user_id             uuid        not null references public.profiles(user_id),
    sim_role            text        not null
                                    check (sim_role in ('front_desk', 'med', 'patient_actor', 'observer')),
    discipline          text        null,   -- required for med; references roles.role_name
    instructor_feedback text        null,   -- post-sim review (unused until §7)
    rubric_scores       jsonb       null,
    reviewed_by         uuid        null references public.profiles(user_id),
    reviewed_at         timestamptz null,
    unique (simulation_id, user_id)         -- one role per person per sim
);

-- ── simulation_encounters ─────────────────────────────────────────────────────
-- room_label is intentionally omitted; Rooms team will add their own column.

create table public.simulation_encounters (
    id                       uuid        primary key default gen_random_uuid(),
    simulation_id            uuid        not null references public.simulations(id) on delete cascade,
    template_id              uuid        not null references public.patient_templates(id),
    patient_actor_id         uuid        null references public.profiles(user_id),
    arrival_type             text        not null
                                         check (arrival_type in ('scheduled', 'walk_in', 'new_patient')),
    status                   text        not null default 'expected'
                                         check (status in ('expected', 'arrived', 'checked_in',
                                                           'in_progress', 'med_complete',
                                                           'discharged', 'cancelled')),
    scheduled_time           time        null,
    -- ticket_code reserved for future walk-in flow; no logic in this commit
    ticket_code              text        null,
    assigned_med_id          uuid        null references public.profiles(user_id),
    med_owner_id             uuid        null references public.profiles(user_id),
    assigned_case_id         uuid        null references public.assigned_cases(id),
    registration_data        jsonb       null,
    verification_flags       jsonb       null,
    follow_up_needed         boolean     null,
    follow_up_appointment_id uuid        null references public.appointments(id),
    arrived_at               timestamptz null,
    checked_in_at            timestamptz null,
    med_started_at           timestamptz null,
    med_completed_at         timestamptz null,
    discharged_at            timestamptz null,
    checked_in_by            uuid        null references public.profiles(user_id),
    discharged_by            uuid        null references public.profiles(user_id),
    created_at               timestamptz not null default now(),
    check (arrival_type <> 'scheduled'    or scheduled_time is not null),
    check (arrival_type <> 'new_patient'  or ticket_code is not null),
    -- NULLs are distinct per SQL standard, so multiple NULL ticket_codes are fine
    unique (simulation_id, ticket_code)
);

-- ── simulation_events ─────────────────────────────────────────────────────────

create table public.simulation_events (
    id            bigserial   primary key,
    simulation_id uuid        not null references public.simulations(id),
    -- on delete set null preserves event history when encounters are reset during draft
    encounter_id  uuid        null references public.simulation_encounters(id) on delete set null,
    actor_id      uuid        not null references public.profiles(user_id),
    event_type    text        not null,
    -- known types: sim_created | participants_set | encounters_set | sim_started |
    --   arrived | checked_in | med_opened | med_complete | discharged |
    --   follow_up_booked | cancelled | sim_ended | cases_released_for_grading |
    --   wrong_record_selected | wrong_record_check_in_blocked | ticket_not_found | registered
    payload       jsonb,
    created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index on public.simulation_participants (simulation_id);
create index on public.simulation_participants (user_id);
create index on public.simulation_encounters (simulation_id);
create index on public.simulation_encounters (assigned_med_id);
create index on public.simulation_events (simulation_id);
create index on public.simulation_events (encounter_id);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- supabase_realtime publication exists on Supabase Cloud; guarded for local PGlite tests.
-- Do NOT publish simulation_roster_records (accessed via RPC only).

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table
            public.simulations,
            public.simulation_encounters,
            public.simulation_events;
    end if;
end;
$$;
