-- Lab and imaging results store their patient on the order, so look it up there.
-- Same as the previous log_phi_change, plus the diagnostic_results patient lookup.
create or replace function private.log_phi_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
    new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
    row_data jsonb := coalesce(new_row, old_row);
begin
    -- Skip saves that changed nothing but updated_at
    if tg_op = 'UPDATE' and (new_row - 'updated_at') = (old_row - 'updated_at') then return null; end if;

    insert into public.phi_audit_log (actor_id, action, table_name, record_id, patient_id, changed_fields)
    values (
        auth.uid(),
        tg_op,
        tg_table_name,
        coalesce(row_data->>'id', row_data->>'note_id', row_data->>'user_id'),
        case tg_table_name
            when 'patients' then row_data->>'id'
            when 'diagnostic_results' then (
                select o.patient_id::text from public.diagnostic_orders o where o.id = (row_data->>'order_id')::uuid)
            else row_data->>'patient_id'
        end,
        case when tg_op = 'UPDATE' then (
            select array_agg(key) from jsonb_each(new_row)
            where value is distinct from old_row->key and key <> 'updated_at'
        ) end
    );
    return null;
end;
$$;
