-- HIPAA audit trail: also log opening a lab or imaging result's attached file.
create or replace function public.log_record_view(record_table text, record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or record_table not in ('patients', 'assigned_cases', 'diagnostic_results') then
        raise exception 'Cannot log this view.';
    end if;
    insert into public.phi_audit_log (actor_id, action, table_name, record_id, patient_id)
    values (auth.uid(), 'VIEW', record_table, record_id::text,
            case record_table
                when 'patients' then record_id::text
                when 'diagnostic_results' then (
                    select o.patient_id::text from public.diagnostic_results r
                    join public.diagnostic_orders o on o.id = r.order_id where r.id = record_id)
            end);
end;
$$;
