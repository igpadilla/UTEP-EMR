create table public.patient_prescription_alerts (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references public.patients(id),
    medication_name text not null check (length(medication_name) between 1 and 200),
    pharmacy_name text not null check (length(pharmacy_name) between 1 and 200),
    created_by uuid not null references public.profiles(user_id),
    created_at timestamptz not null default now(),
    read_at timestamptz
);
create index on public.patient_prescription_alerts(patient_id, created_at desc);
alter table public.patient_prescription_alerts enable row level security;
revoke all on public.patient_prescription_alerts from public, anon, authenticated;

create function public.notify_patient_prescription(p_patient_id uuid, p_medication_name text, p_pharmacy_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare alert_id uuid;
begin
    if not private.is_staff() then raise exception 'Only active staff can send prescription alerts'; end if;
    if nullif(trim(p_medication_name), '') is null or length(trim(p_medication_name)) > 200
       or nullif(trim(p_pharmacy_name), '') is null or length(trim(p_pharmacy_name)) > 200 then
        raise exception 'Choose a medication and enter a pharmacy name of 200 characters or fewer';
    end if;
    if not exists (select 1 from public.patients p,
        lateral jsonb_array_elements(case when jsonb_typeof(p.current_medications) = 'array'
            then p.current_medications else '[]'::jsonb end) m
        where p.id = p_patient_id and p.archived_at is null
          and coalesce(m->'medicine'->>'name', m->>'name', case when jsonb_typeof(m) = 'string' then m #>> '{}' end) = trim(p_medication_name)) then
        raise exception 'Choose a saved medication on an active patient record';
    end if;
    if not exists (select 1 from public.patient_portal_accounts a join public.profiles pr on pr.user_id = a.user_id
        where a.patient_id = p_patient_id and pr.active and pr.account_type = 'patient') then
        raise exception 'This patient needs active portal access first';
    end if;
    insert into public.patient_prescription_alerts(patient_id, medication_name, pharmacy_name, created_by)
    values (p_patient_id, trim(p_medication_name), trim(p_pharmacy_name), auth.uid()) returning id into alert_id;
    insert into public.phi_audit_log(actor_id, action, table_name, record_id, patient_id)
    values (auth.uid(), 'INSERT', 'patient_prescription_alerts', alert_id::text, p_patient_id::text);
end;
$$;

create function public.get_my_prescription_alerts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare portal_patient uuid;
begin
    select a.patient_id into portal_patient from public.patient_portal_accounts a join public.profiles pr on pr.user_id = a.user_id
    where a.user_id = auth.uid() and pr.active and pr.account_type = 'patient';
    if portal_patient is null then raise exception 'Patient portal access is not available for this account'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'medication_name', n.medication_name,
        'pharmacy_name', n.pharmacy_name, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc, n.id desc)
        from public.patient_prescription_alerts n where n.patient_id = portal_patient), '[]'::jsonb);
end;
$$;

create function public.read_my_prescription_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    update public.patient_prescription_alerts n set read_at = coalesce(n.read_at, now())
    where n.id = p_alert_id and exists (select 1 from public.patient_portal_accounts a join public.profiles pr on pr.user_id = a.user_id
        where a.user_id = auth.uid() and a.patient_id = n.patient_id and pr.active and pr.account_type = 'patient');
    if not found then raise exception 'Prescription alert is not available for this account'; end if;
end;
$$;
revoke all on function public.notify_patient_prescription(uuid, text, text), public.get_my_prescription_alerts(), public.read_my_prescription_alert(uuid) from public, anon;
grant execute on function public.notify_patient_prescription(uuid, text, text), public.get_my_prescription_alerts(), public.read_my_prescription_alert(uuid) to authenticated;
