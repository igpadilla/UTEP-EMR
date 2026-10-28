begin;

-- We have seven tests
select plan(7);

-- --------------------------------------------------
-- Test setup
-- --------------------------------------------------

insert into auth.users (
    id,
    email,
    aud,
    role,
    created_at,
    updated_at
)
values
(
    '11111111-1111-1111-1111-111111111111',
    'student.pgtap@test.invalid',
    'authenticated',
    'authenticated',
    now(),
    now()
),
(
    '22222222-2222-2222-2222-222222222222',
    'admin.pgtap@test.invalid',
    'authenticated',
    'authenticated',
    now(),
    now()
),
(
    '33333333-3333-3333-3333-333333333333',
    'secondadmin.pgtap@test.invalid',
    'authenticated',
    'authenticated',
    now(),
    now()
);

-- Bootstrap two admins for testing
update public.profiles
set account_type = 'admin'
where user_id in (
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

-- Simulate an authenticated user
set local role authenticated;


-- --------------------------------------------------
-- TEST 1: Student cannot grant admin
-- --------------------------------------------------

select set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    true
);

select throws_ok(
    $$
        select public.grant_admin(
            '11111111-1111-1111-1111-111111111111'
        );
    $$,
    'P0001',
    'Only admins can grant admin access',
    'Student cannot grant admin access'
);


-- --------------------------------------------------
-- TEST 2: Admin can grant admin
-- --------------------------------------------------

select set_config(
    'request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222',
    true
);

select lives_ok(
    $$
        select public.grant_admin(
            '11111111-1111-1111-1111-111111111111'
        );
    $$,
    'Admin can grant admin access'
);


-- --------------------------------------------------
-- TEST 3: Admin can remove admin
-- --------------------------------------------------

select lives_ok(
    $$
        select public.remove_admin(
            '11111111-1111-1111-1111-111111111111',
            'student'
        );
    $$,
    'Admin can remove admin access'
);


-- --------------------------------------------------
-- TEST 4: Last admin cannot be removed
-- --------------------------------------------------

-- Any other admin in this database would hide the "last admin" rule, so stand
-- them down for the length of this transaction, which rolls back at the end.
reset role;

update public.profiles
set account_type = 'student'
where account_type = 'admin'
  and user_id not in (
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
  );

set local role authenticated;

-- Remove second admin first
select public.remove_admin(
    '33333333-3333-3333-3333-333333333333',
    'student'
);

-- Only admin.pgtap@test.invalid remains as admin
select throws_ok(
    $$
        select public.remove_admin(
            '22222222-2222-2222-2222-222222222222',
            'student'
        );
    $$,
    'P0001',
    'Cannot remove the last active admin',
    'Last active admin cannot be removed'
);


-- --------------------------------------------------
-- TEST 5: Student can only read their own profile
-- --------------------------------------------------

select set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    true
);

select is(
    (
        select count(*) from public.profiles
        where user_id in (
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333'
        )
    ),
    1::bigint,
    'Student can only read their own profile'
);


-- --------------------------------------------------
-- TEST 6: Admin can read all profiles
-- --------------------------------------------------

select set_config(
    'request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222',
    true
);

select is(
    (
        select count(*) from public.profiles
        where user_id in (
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333'
        )
    ),
    3::bigint,
    'Admin can read all profiles'
);


-- --------------------------------------------------
-- TEST 7: Student cannot directly promote themselves
-- --------------------------------------------------

select set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    true
);

update public.profiles
set account_type = 'admin'
where user_id = '11111111-1111-1111-1111-111111111111';

select is(
    (
        select account_type
        from public.profiles
        where user_id = '11111111-1111-1111-1111-111111111111'
    ),
    'student',
    'Student cannot directly change their account type to admin'
);


select * from finish();

rollback;
