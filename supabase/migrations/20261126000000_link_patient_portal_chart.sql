-- Read current chart fields from the linked patient. Internal notes and unreleased labs stay private.
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
            'last_name', patient_record.last_name, 'date_of_birth', patient_record.date_of_birth,
            'age', patient_record.age, 'sex', patient_record.sex, 'occupation', patient_record.occupation,
            'phone_number', patient_record.phone_number, 'email', patient_record.email, 'address', patient_record.address),
        'allergies', coalesce((select jsonb_agg(v) from jsonb_array_elements(case when jsonb_typeof(to_jsonb(patient_record.allergies)) = 'array' then to_jsonb(patient_record.allergies) else '[]'::jsonb end) v where jsonb_typeof(v) = 'string'), '[]'::jsonb),
        'medical_history', coalesce((select jsonb_agg(v) from jsonb_array_elements(case when jsonb_typeof(to_jsonb(patient_record.medical_history)) = 'array' then to_jsonb(patient_record.medical_history) else '[]'::jsonb end) v where jsonb_typeof(v) = 'string'), '[]'::jsonb),
        'diagnoses', coalesce((select jsonb_agg(case when jsonb_typeof(v) = 'string' then jsonb_build_object('description', v #>> '{}') else jsonb_build_object('code', v->>'code', 'description', v->>'description', 'status', v->>'status') end) from jsonb_array_elements(case when jsonb_typeof(patient_record.diagnoses) = 'array' then patient_record.diagnoses else '[]'::jsonb end) v where jsonb_typeof(v) in ('string', 'object')), '[]'::jsonb),
        'immunizations', coalesce((select jsonb_agg(jsonb_build_object('vaccine', v->>'vaccine', 'date', v->>'date', 'dose', v->>'dose', 'notes', v->>'notes')) from jsonb_array_elements(case when jsonb_typeof(patient_record.immunizations) = 'array' then patient_record.immunizations else '[]'::jsonb end) v where jsonb_typeof(v) = 'object'), '[]'::jsonb),
        'medications', coalesce((select jsonb_agg(jsonb_build_object(
            'name', coalesce(m->'medicine'->>'name', m->>'name', case when jsonb_typeof(m) = 'string' then m #>> '{}' end),
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
        'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_type', v.visit_type,
            'date', v.created_at, 'medications', v.medications,
            'summary', case when v.portal_released_at <= now() then nullif(trim(v.portal_summary), '') end)
            order by v.created_at desc, v.id desc) from public.visits v where v.patient_id = portal_patient), '[]'::jsonb),
        'last_visit', (select jsonb_build_object('visit_type', v.visit_type, 'date', v.created_at,
            'summary', v.portal_summary) from public.visits v where v.patient_id = portal_patient
            and v.portal_released_at <= now() and nullif(trim(v.portal_summary), '') is not null
            order by v.created_at desc, v.id desc limit 1)
    );
end;
$$;
revoke all on function public.get_my_patient_portal() from public, anon;
grant execute on function public.get_my_patient_portal() to authenticated;
