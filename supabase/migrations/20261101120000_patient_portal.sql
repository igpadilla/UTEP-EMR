--     A portal login belongs to one patient, it never gets the staff chart
alter table public.profiles drop constraint profiles_account_type_check;
alter table public.profiles add constraint profiles_account_type_check
    check (account_type in ('admin', 'instructor', 'student', 'patient'));

create table public.patient_portal_accounts (
    user_id uuid primary key references public.profiles(user_id) on delete cascade,
    patient_id uuid not null unique references public.patients(id) on delete cascade,
    created_at timestamptz not null default now()
);
alter table public.patient_portal_accounts enable row level security;
-- The link is managed through the checked functions below
revoke all on public.patient_portal_accounts from anon, authenticated;

create function private.is_portal_patient() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.profiles
        where user_id = auth.uid() and account_type = 'patient');
$$;
revoke all on function private.is_portal_patient() from public;
grant execute on function private.is_portal_patient() to authenticated;

-- Even a leftover course or clinical role cannot open staff records
do $$
declare table_name text;
begin
    foreach table_name in array array['patients','visits','appointments','assigned_cases',
        'patient_templates','clinical_notes','referrals','vital_sign_sets','audit_logs',
        'courses','course_enrollments','profile_roles'] loop
        execute format('create policy "Portal accounts use their own portal only" on public.%I
            as restrictive for all to authenticated
            using (not private.is_portal_patient()) with check (not private.is_portal_patient())', table_name);
    end loop;
end;
$$;

alter table public.visits add column portal_summary text,
    add column portal_released_at timestamptz;

-- Called only by the account creation server, both changes happen together
create function public.finish_patient_portal_account(p_user_id uuid, p_patient_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    update public.profiles pr set account_type = 'patient', must_change_password = true,
        first_name = p.first_name, last_name = p.last_name, updated_at = now()
    from public.patients p where pr.user_id = p_user_id and p.id = p_patient_id
        and pr.account_type = 'student';
    if not found then raise exception 'New account or patient not found'; end if;
    insert into public.patient_portal_accounts(user_id, patient_id) values (p_user_id, p_patient_id);
end;
$$;
revoke all on function public.finish_patient_portal_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finish_patient_portal_account(uuid, uuid) to service_role;

create function public.patient_portal_account_status(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'Only active admins manage portal accounts'; end if;
    return (select jsonb_build_object('email', u.email, 'active', pr.active)
        from public.patient_portal_accounts a join public.profiles pr on pr.user_id = a.user_id
        join auth.users u on u.id = a.user_id where a.patient_id = p_patient_id);
end;
$$;

create function public.set_patient_portal_access(p_patient_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_admin() then raise exception 'Only active admins manage portal accounts'; end if;
    if p_active is null then raise exception 'Choose active or inactive'; end if;
    update public.profiles pr set active = p_active, updated_at = now()
        from public.patient_portal_accounts a where a.patient_id = p_patient_id
        and pr.user_id = a.user_id and pr.account_type = 'patient';
    if not found then raise exception 'Portal account not found'; end if;
end;
$$;

create function public.release_patient_visit_summary(p_visit_id uuid, p_summary text)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not private.is_staff() then raise exception 'Only active staff can release visit summaries'; end if;
    if p_summary is null or length(trim(p_summary)) not between 1 and 10000 then
        raise exception 'Enter a visit summary of 1 to 10000 characters';
    end if;
    update public.visits set portal_summary = trim(p_summary), portal_released_at = now()
        where id = p_visit_id;
    if not found then raise exception 'Visit not found'; end if;
end;
$$;

-- No patient id comes from the browser, the login decides which chart to use
create function public.get_my_patient_portal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare patient_record public.patients; portal_user uuid;
begin
    select a.patient_id into portal_user from public.patient_portal_accounts a
        join public.profiles pr on pr.user_id = a.user_id
        where a.user_id = auth.uid() and pr.active and pr.account_type = 'patient';
    if portal_user is null then raise exception 'Patient portal access is not available for this account'; end if;
    select * into patient_record from public.patients where id = portal_user;
    return jsonb_build_object(
        'patient', jsonb_build_object('first_name', patient_record.first_name,
            'last_name', patient_record.last_name, 'date_of_birth', patient_record.date_of_birth),
        'medications', coalesce((select jsonb_agg(jsonb_build_object(
            'name', coalesce(m->'medicine'->>'name', m->>'name'),
            'dosage', m->>'dosage', 'unit', coalesce(m->'medicine'->>'unit', m->>'unit'),
            'frequency', m->>'frequency', 'instructions', m->>'instructions',
            'prescriber', m->>'prescriber', 'status', m->>'status'))
            from jsonb_array_elements(case when jsonb_typeof(patient_record.current_medications) = 'array'
                then patient_record.current_medications else '[]'::jsonb end) m), '[]'::jsonb),
        'labs', '[]'::jsonb,
        'last_visit', (select jsonb_build_object('visit_type', v.visit_type, 'date', v.created_at,
            'summary', v.portal_summary) from public.visits v where v.patient_id = portal_user
            and v.portal_released_at <= now() and nullif(trim(v.portal_summary), '') is not null
            order by v.created_at desc, v.id desc limit 1)
    );
end;
$$;

revoke all on function public.patient_portal_account_status(uuid) from public, anon;
revoke all on function public.set_patient_portal_access(uuid, boolean) from public, anon;
revoke all on function public.release_patient_visit_summary(uuid, text) from public, anon;
revoke all on function public.get_my_patient_portal() from public, anon;
grant execute on function public.patient_portal_account_status(uuid) to authenticated;
grant execute on function public.set_patient_portal_access(uuid, boolean) to authenticated;
grant execute on function public.release_patient_visit_summary(uuid, text) to authenticated;
grant execute on function public.get_my_patient_portal() to authenticated;
