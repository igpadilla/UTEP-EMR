-- Dev seed: Front Desk + Live Simulation
-- Creates one simulation in draft status with 3 scheduled encounters.
-- Run after `supabase db reset` or against a local Supabase instance:
--
--   supabase db execute --file supabase/simulation_dev_seed.sql
--
-- LOCAL ONLY: never run this against the shared or production project.
-- Credentials:
--   instructor@sim.dev    / SimInstr123!
--   frontdesk@sim.dev     / SimFront123!
--   med-a@sim.dev         / SimMedA123!
--   med-b@sim.dev         / SimMedB123!
--   actor@sim.dev         / SimActor123!
--
-- After running: sign in as the instructor and open Course "SIM 101" to start the sim.
-- The simulation will be in draft and ready to start from the Simulations tab.

-- ── Fixed IDs for reproducibility ────────────────────────────────────────────

do $$
declare
    v_instructor  uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
    v_front       uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
    v_med_a       uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
    v_med_b       uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
    v_actor       uuid := 'aaaaaaaa-0000-4000-8000-000000000005';
    v_course      uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
    v_tpl_1       uuid := 'cccccccc-0000-4000-8000-000000000001';
    v_tpl_2       uuid := 'cccccccc-0000-4000-8000-000000000002';
    v_tpl_3       uuid := 'cccccccc-0000-4000-8000-000000000003';
    v_sim         uuid := 'dddddddd-0000-4000-8000-000000000001';
begin

    -- Auth users with the passwords listed above. Supabase Auth needs the password hash,
    -- a confirmed email, timestamps, and empty (not NULL) token fields to allow sign-in.
    -- Re-running this also repairs accounts created by the older version of this seed.
    insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
    )
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
           extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}', '{}', now(), now(),
           '', '', '', '', '', '', '', ''
    from (values
        (v_instructor, 'instructor@sim.dev', 'SimInstr123!'),
        (v_front,      'frontdesk@sim.dev',  'SimFront123!'),
        (v_med_a,      'med-a@sim.dev',      'SimMedA123!'),
        (v_med_b,      'med-b@sim.dev',      'SimMedB123!'),
        (v_actor,      'actor@sim.dev',      'SimActor123!')
    ) as u(id, email, pw)
    on conflict (id) do update set
        instance_id = excluded.instance_id, aud = excluded.aud, role = excluded.role,
        encrypted_password = excluded.encrypted_password,
        email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
        raw_app_meta_data = excluded.raw_app_meta_data,
        created_at = coalesce(auth.users.created_at, excluded.created_at), updated_at = now(),
        confirmation_token = '', recovery_token = '', email_change = '', email_change_token_new = '',
        email_change_token_current = '', phone_change = '', phone_change_token = '', reauthentication_token = '';

    -- Supabase Auth also expects an email identity for each account.
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select u.id::text, u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', now(), now(), now()
    from auth.users u
    where u.id in (v_instructor, v_front, v_med_a, v_med_b, v_actor)
      and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

    -- Profiles
    update public.profiles set
        first_name   = 'Sim',
        last_name    = 'Instructor',
        account_type = 'instructor',
        active       = true
    where user_id = v_instructor;

    update public.profiles set
        first_name   = 'Front',
        last_name    = 'Desk',
        account_type = 'student',
        active       = true
    where user_id = v_front;

    update public.profiles set
        first_name   = 'Med',
        last_name    = 'StudentA',
        account_type = 'student',
        active       = true
    where user_id = v_med_a;

    update public.profiles set
        first_name   = 'Med',
        last_name    = 'StudentB',
        account_type = 'student',
        active       = true
    where user_id = v_med_b;

    update public.profiles set
        first_name   = 'Actor',
        last_name    = 'Student',
        account_type = 'student',
        active       = true
    where user_id = v_actor;

    -- Course
    insert into public.courses (id, instructor_id, course_number, crn, discipline)
    values (v_course, v_instructor, 'SIM 101', 'SIM001', 'nursing')
    on conflict (id) do nothing;

    -- Enroll sim students
    insert into public.course_enrollments (course_id, student_id, enrolled_by)
    values
        (v_course, v_front,  v_instructor),
        (v_course, v_med_a,  v_instructor),
        (v_course, v_med_b,  v_instructor),
        (v_course, v_actor,  v_instructor)
    on conflict do nothing;

    -- Patient templates (3 scheduled encounters)
    insert into public.patient_templates
        (id, instructor_id, course_id, first_name, last_name, age, sex, chief_complaint)
    values
        (v_tpl_1, v_instructor, v_course, 'Elena',  'Vega',    52, 'F', 'Chest tightness and shortness of breath'),
        (v_tpl_2, v_instructor, v_course, 'Marcus', 'Rivera',  38, 'M', 'Persistent lower back pain after fall'),
        (v_tpl_3, v_instructor, v_course, 'Sarah',  'Okonkwo', 67, 'F', 'Confusion and elevated blood pressure')
    on conflict (id) do nothing;

    -- Simulation in draft
    insert into public.simulations
        (id, course_id, instructor_id, title, status, mode, end_mode, duration_minutes)
    values
        (v_sim, v_course, v_instructor, 'Week 3 Front Desk Simulation',
         'draft', 'standard', 'timer', 30)
    on conflict (id) do nothing;

    -- Participants
    delete from public.simulation_participants where simulation_id = v_sim;
    insert into public.simulation_participants (simulation_id, user_id, sim_role, discipline)
    values
        (v_sim, v_front,  'front_desk',    null),
        (v_sim, v_med_a,  'med',           'nursing'),
        (v_sim, v_med_b,  'med',           'nursing'),
        (v_sim, v_actor,  'patient_actor', null);

    -- Encounters: 2 assigned to med-a, 1 to med-b.
    -- A student can play only one patient, so the instructor plays encounters 2 and 3.
    delete from public.simulation_encounters where simulation_id = v_sim;
    insert into public.simulation_encounters
        (simulation_id, template_id, patient_actor_id, arrival_type,
         scheduled_time, assigned_med_id)
    values
        (v_sim, v_tpl_1, v_actor, 'scheduled', '09:00:00', v_med_a),
        (v_sim, v_tpl_2, v_instructor, 'scheduled', '09:15:00', v_med_a),
        (v_sim, v_tpl_3, v_instructor, 'scheduled', '09:30:00', v_med_b);

    raise notice 'Seed complete. Sign in as instructor@sim.dev, open Course SIM 101, and start the simulation from the Simulations tab.';
end;
$$;
