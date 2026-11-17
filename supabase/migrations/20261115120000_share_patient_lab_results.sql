-- Staff explicitly release live-patient lab results. Case copies and internal reports stay private.
do $$ begin
    if to_regclass('public.phi_audit_log') is null then
        raise exception 'Apply the team audit-log migrations before portal lab sharing';
    end if;
end $$;

alter table public.diagnostic_results
    add column portal_released_at timestamptz,
    add column portal_released_by uuid references public.profiles(user_id),
    add column portal_note text check (length(portal_note) <= 10000);

create function public.set_diagnostic_result_portal_release(
    p_result_id uuid, p_released boolean, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare result_values jsonb;
begin
    if not private.is_staff() then raise exception 'Only active staff can share lab results'; end if;
    if p_released is null then raise exception 'Choose shared or private'; end if;
    if length(coalesce(p_note, '')) > 10000 then raise exception 'Patient summary must be 10000 characters or fewer'; end if;

    select r.structured_values into result_values
    from public.diagnostic_results r join public.diagnostic_orders o on o.id = r.order_id
    where r.id = p_result_id and o.patient_id is not null and o.case_id is null
      and o.category = 'lab' and o.status = 'completed';
    if not found then raise exception 'Choose a completed lab result on a patient record'; end if;
    if p_released and (case when jsonb_typeof(result_values) = 'array' then jsonb_array_length(result_values) = 0 else true end)
        and nullif(trim(p_note), '') is null then
        raise exception 'Add lab values or a patient summary before sharing';
    end if;

    update public.diagnostic_results set
        portal_released_at = case when p_released then now() end,
        portal_released_by = case when p_released then auth.uid() end,
        portal_note = case when p_released then nullif(trim(p_note), '') else portal_note end
    where id = p_result_id;
end;
$$;
revoke all on function public.set_diagnostic_result_portal_release(uuid, boolean, text) from public, anon;
grant execute on function public.set_diagnostic_result_portal_release(uuid, boolean, text) to authenticated;

-- The account determines the patient. No patient ID is accepted from the browser.
-- VOLATILE is required because successful reads also write an audit entry.
create or replace function public.get_my_patient_portal()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare patient_record public.patients; portal_patient uuid;
begin
    select a.patient_id into portal_patient from public.patient_portal_accounts a
        join public.profiles pr on pr.user_id = a.user_id
        where a.user_id = auth.uid() and pr.active and pr.account_type = 'patient';
    if portal_patient is null then raise exception 'Patient portal access is not available for this account'; end if;
    select * into patient_record from public.patients where id = portal_patient;

    insert into public.phi_audit_log(actor_id, action, table_name, record_id, patient_id)
    values (auth.uid(), 'VIEW', 'patient_portal_accounts', auth.uid()::text, portal_patient::text);

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
        'labs', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'test_name', o.test_name, 'resulted_at', r.resulted_at,
            'released_at', r.portal_released_at, 'overall_flag', r.overall_flag,
            'result_note', r.portal_note,
            'values', coalesce((select jsonb_agg(jsonb_build_object(
                'code', v->>'code', 'name', coalesce(v->>'name', v->>'code'),
                'value', v->>'value', 'unit', v->>'unit',
                'reference_range', v->>'reference_range', 'flag', v->>'flag'))
                from jsonb_array_elements(case when jsonb_typeof(r.structured_values) = 'array'
                    then r.structured_values else '[]'::jsonb end) v), '[]'::jsonb))
            order by r.resulted_at desc, r.id desc)
            from public.diagnostic_results r join public.diagnostic_orders o on o.id = r.order_id
            where o.patient_id = portal_patient and o.case_id is null and o.category = 'lab'
              and o.status = 'completed' and r.portal_released_at <= now()), '[]'::jsonb),
        'last_visit', (select jsonb_build_object('visit_type', v.visit_type, 'date', v.created_at,
            'summary', v.portal_summary) from public.visits v where v.patient_id = portal_patient
            and v.portal_released_at <= now() and nullif(trim(v.portal_summary), '') is not null
            order by v.created_at desc, v.id desc limit 1)
    );
end;
$$;
revoke all on function public.get_my_patient_portal() from public, anon;
grant execute on function public.get_my_patient_portal() to authenticated;
