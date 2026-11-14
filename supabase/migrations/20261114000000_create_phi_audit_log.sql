-- HIPAA audit trail: who changed patient health information, and when.
-- Rows are written only by the database (triggers below), never by the app, and can't be edited or removed.
-- Only changed column names are kept, so the log itself holds no health details.
create table public.phi_audit_log (
    id             bigint generated always as identity primary key,
    occurred_at    timestamptz not null default now(),
    actor_id       uuid,
    action         text not null,
    table_name     text not null,
    record_id      text,
    patient_id     text,
    changed_fields text[]
);

alter table public.phi_audit_log enable row level security;
revoke update, delete, truncate on public.phi_audit_log from anon, authenticated, service_role;

create policy "Admins read the PHI audit log"
on public.phi_audit_log for select to authenticated
using (exists (select 1 from public.profiles where user_id = auth.uid() and account_type = 'admin'));

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
        case when tg_table_name = 'patients' then row_data->>'id' else row_data->>'patient_id' end,
        case when tg_op = 'UPDATE' then (
            select array_agg(key) from jsonb_each(new_row)
            where value is distinct from old_row->key and key <> 'updated_at'
        ) end
    );
    return null;
end;
$$;

create trigger audit_patients after insert or update or delete on public.patients
    for each row execute function private.log_phi_change();
create trigger audit_vital_sign_sets after insert or update or delete on public.vital_sign_sets
    for each row execute function private.log_phi_change();
create trigger audit_clinical_notes after insert or update or delete on public.clinical_notes
    for each row execute function private.log_phi_change();
create trigger audit_diagnostic_orders after insert or update or delete on public.diagnostic_orders
    for each row execute function private.log_phi_change();
create trigger audit_diagnostic_results after insert or update or delete on public.diagnostic_results
    for each row execute function private.log_phi_change();
create trigger audit_referrals after insert or update or delete on public.referrals
    for each row execute function private.log_phi_change();
create trigger audit_appointments after insert or update or delete on public.appointments
    for each row execute function private.log_phi_change();
create trigger audit_visits after insert or update or delete on public.visits
    for each row execute function private.log_phi_change();
create trigger audit_assigned_cases after insert or update or delete on public.assigned_cases
    for each row execute function private.log_phi_change();
create trigger audit_patient_portal_accounts after insert or update or delete on public.patient_portal_accounts
    for each row execute function private.log_phi_change();
