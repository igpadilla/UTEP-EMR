begin;

select plan(19);

-- --------------------------------------------------
-- Test setup (runs as the database owner)
-- --------------------------------------------------

-- a001 = nursing student, a002 = pharmacy student,
-- a003 = front desk,       a004 = instructor
insert into auth.users (id, email, aud, role, created_at, updated_at)
values
('10000000-0000-0000-0000-00000000a001', 'vitals.nurse@test.local',      'authenticated', 'authenticated', now(), now()),
('10000000-0000-0000-0000-00000000a002', 'vitals.pharmacy@test.local',   'authenticated', 'authenticated', now(), now()),
('10000000-0000-0000-0000-00000000a003', 'vitals.frontdesk@test.local',  'authenticated', 'authenticated', now(), now()),
('10000000-0000-0000-0000-00000000a004', 'vitals.instructor@test.local', 'authenticated', 'authenticated', now(), now());

update public.profiles
set account_type = 'instructor'
where user_id = '10000000-0000-0000-0000-00000000a004';

insert into public.profile_roles (user_id, role_id)
select v.user_id, r.role_id
from (values
    ('10000000-0000-0000-0000-00000000a001'::uuid, 'nursing'),
    ('10000000-0000-0000-0000-00000000a002'::uuid, 'pharmacy'),
    ('10000000-0000-0000-0000-00000000a003'::uuid, 'front_desk')
) as v(user_id, role_name)
join public.roles r on r.role_name = v.role_name;

insert into public.patients (id, first_name, last_name, age)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test', 'Patient', 58);

-- A case assigned to the nursing student, with one baseline set
insert into public.patient_templates (id, instructor_id, first_name, last_name, age, chief_complaint)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '10000000-0000-0000-0000-00000000a004', 'Case', 'Patient', 71, 'Shortness of breath');

insert into public.assigned_cases (id, template_id, student_id, assigned_by)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '10000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-00000000a004');

insert into public.vital_sign_sets (assigned_case_id, source, recorded_by, heart_rate)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'baseline', '10000000-0000-0000-0000-00000000a004', 84);

set local role authenticated;


-- --------------------------------------------------
-- TEST 1: Nursing student can record vitals on a live patient
-- --------------------------------------------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000a001', true);

select lives_ok(
    $$
        insert into public.vital_sign_sets (id, patient_id, systolic_bp, diastolic_bp, weight_lb, height_in)
        values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 148, 92, 192, 64);
    $$,
    'Nursing student can record vitals'
);

-- --------------------------------------------------
-- TEST 2: BMI is calculated from weight and height
-- --------------------------------------------------
select is(
    (select bmi from public.vital_sign_sets where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
    33.0,
    'BMI is calculated (192 lb, 64 in = 33.0)'
);

-- --------------------------------------------------
-- TEST 3: Impossible values are rejected
-- --------------------------------------------------
select throws_ok(
    $$
        insert into public.vital_sign_sets (patient_id, heart_rate)
        values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 900);
    $$,
    '23514',
    null,
    'Heart rate of 900 is rejected'
);

-- --------------------------------------------------
-- TEST 4: Values cannot be edited in place
-- --------------------------------------------------
select throws_ok(
    $$
        update public.vital_sign_sets set systolic_bp = 120
        where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    $$,
    '42501',
    null,
    'Recorded values cannot be edited'
);

-- --------------------------------------------------
-- TEST 5: Vitals cannot be deleted
-- --------------------------------------------------
select throws_ok(
    $$
        delete from public.vital_sign_sets
        where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    $$,
    '42501',
    null,
    'Vitals cannot be deleted'
);

-- --------------------------------------------------
-- TEST 6: A correction replaces the old value in current vitals
-- --------------------------------------------------
insert into public.vital_sign_sets (id, patient_id, systolic_bp, diastolic_bp, supersedes_id, correction_reason)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 138, 88, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Wrong cuff size');

select is(
    (select systolic_bp from public.current_vital_sign_sets where patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    138::smallint,
    'Current vitals show the corrected value only'
);

-- --------------------------------------------------
-- TEST 7: Case vitals are visible to the student on the case
-- --------------------------------------------------
select is(
    (select count(*) from public.vital_sign_sets where assigned_case_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    1::bigint,
    'Student sees vitals on their own case'
);

-- --------------------------------------------------
-- TEST: Recording vitals on a case writes to the case's audit log
-- --------------------------------------------------
insert into public.vital_sign_sets (id, assigned_case_id, heart_rate, spo2)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 92, 96);

select is(
    (select new_value from public.audit_logs
     where case_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and action_type = 'VITALS_RECORDED'),
    'HR 92, SpO2 96%',
    'Case vitals are logged with a summary'
);

-- --------------------------------------------------
-- TEST: Once the case is submitted, the student cannot add or remove vitals
-- --------------------------------------------------
update public.assigned_cases
set encounter_status = 'pending review'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select throws_ok(
    $$
        insert into public.vital_sign_sets (assigned_case_id, heart_rate)
        values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 80);
    $$,
    '42501',
    null,
    'Student cannot record vitals on a submitted case'
);

update public.vital_sign_sets
set status = 'entered_in_error', correction_reason = 'Trying after submit'
where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

select is(
    (select status from public.vital_sign_sets where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
    'active',
    'Student cannot mark vitals in error on a submitted case'
);

-- --------------------------------------------------
-- TEST 8: Marking a correction as entered in error hides the whole set
-- (the original must not come back)
-- --------------------------------------------------
update public.vital_sign_sets
set status = 'entered_in_error', correction_reason = 'Charted on the wrong patient'
where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

select is(
    (select status from public.vital_sign_sets where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
    'entered_in_error',
    'Own entry can be marked entered in error'
);

select is(
    (select count(*) from public.current_vital_sign_sets where patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    0::bigint,
    'Original set stays hidden after its correction is marked entered in error'
);

-- --------------------------------------------------
-- TEST 9: Pharmacy student can read but not record
-- --------------------------------------------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000a002', true);

select throws_ok(
    $$
        insert into public.vital_sign_sets (patient_id, heart_rate)
        values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 80);
    $$,
    '42501',
    null,
    'Pharmacy student cannot record vitals'
);

select is(
    (select count(*) from public.vital_sign_sets where patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    2::bigint,
    'Pharmacy student can read live-patient vitals'
);

-- --------------------------------------------------
-- TEST 10: Front desk cannot read vitals
-- --------------------------------------------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000a003', true);

select is(
    (select count(*) from public.vital_sign_sets),
    0::bigint,
    'Front desk cannot read vitals'
);

-- --------------------------------------------------
-- TEST: The instructor who assigned the case sees the student's vitals and the log
-- --------------------------------------------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000a004', true);

select is(
    (select count(*) from public.vital_sign_sets where assigned_case_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    2::bigint,
    'Instructor sees the baseline set and the student''s set on the case'
);

select is(
    (select count(*) from public.audit_logs
     where case_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and action_type like 'VITALS_%'),
    1::bigint,
    'Instructor sees the vitals entry in the case audit log'
);

-- --------------------------------------------------
-- TEST: Instructors record vitals on their live patients, but not on a student's case
-- --------------------------------------------------
select lives_ok(
    $$
        insert into public.vital_sign_sets (patient_id, heart_rate)
        values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 76);
    $$,
    'Instructor can record vitals on a live patient'
);

select throws_ok(
    $$
        insert into public.vital_sign_sets (assigned_case_id, heart_rate)
        values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 76);
    $$,
    '42501',
    null,
    'Instructor cannot record vitals on a student''s case'
);

select * from finish();

rollback;
