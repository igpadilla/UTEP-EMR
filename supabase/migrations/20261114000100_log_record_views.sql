-- HIPAA audit trail: who opened which patient record or case chart, and when.
-- The app calls this when a chart loads; the database writes the entry under the caller's own account.
create function public.log_record_view(record_table text, record_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or record_table not in ('patients', 'assigned_cases') then
        raise exception 'Cannot log this view.';
    end if;
    insert into public.phi_audit_log (actor_id, action, table_name, record_id, patient_id)
    values (auth.uid(), 'VIEW', record_table, record_id::text,
            case when record_table = 'patients' then record_id::text end);
end;
$$;

revoke execute on function public.log_record_view(text, uuid) from public, anon;
grant execute on function public.log_record_view(text, uuid) to authenticated;
