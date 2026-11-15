-- Admin screen for the HIPAA audit log: readable rows (names instead of IDs), filters, and paging.
create function public.get_phi_audit_log(
    p_search text default null,   -- matches who, patient, account, or case student names
    p_action text default null,   -- e.g. VIEW, UPDATE, ACCOUNT_DEACTIVATED
    p_from   date default null,
    p_to     date default null,
    p_page   int  default 1
) returns table (
    id bigint, occurred_at timestamptz, who text, action text, record text,
    patient text, account text, case_student text, changed_fields text[], total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles where user_id = auth.uid() and account_type = 'admin' and active) then
        raise exception 'Only admins can view the audit log.';
    end if;

    return query
    with readable as (
        select l.id, l.occurred_at,
               nullif(trim(concat(who.first_name, ' ', who.last_name)), '') as who,
               l.action,
               case l.table_name when 'assigned_cases' then 'Case copy' when 'patients' then 'Patient record'
                                 when 'profiles' then 'Account' when 'profile_roles' then 'Account role'
                                 when 'diagnostic_results' then 'Lab/imaging result' when 'diagnostic_orders' then 'Lab/imaging order'
                                 when 'vital_sign_sets' then 'Vitals' when 'clinical_notes' then 'Clinical note'
                                 else initcap(replace(l.table_name, '_', ' ')) end as record,
               nullif(trim(concat(coalesce(pt.first_name, src.first_name), ' ', coalesce(pt.last_name, src.last_name))), '') as patient,
               nullif(trim(concat(acct.first_name, ' ', acct.last_name)), '') as account,
               nullif(trim(concat(stu.first_name, ' ', stu.last_name)), '') as case_student,
               l.changed_fields
        from public.phi_audit_log l
        left join public.profiles who  on who.user_id = l.actor_id
        left join public.patients pt   on pt.id::text = l.patient_id
        left join public.profiles acct on l.table_name in ('profiles', 'profile_roles') and acct.user_id::text = l.record_id
        left join public.assigned_cases ac on l.table_name = 'assigned_cases' and ac.id::text = l.record_id
        left join public.profiles stu  on stu.user_id = ac.student_id
        left join public.patients src  on src.id = private.case_source_patient(ac.id)
        where (p_action is null or l.action = p_action)
          and (p_from is null or l.occurred_at >= p_from)
          and (p_to is null or l.occurred_at < p_to + 1)
    )
    select r.*, count(*) over () from readable r
    where p_search is null or concat_ws(' ', r.who, r.patient, r.account, r.case_student) ilike '%' || p_search || '%'
    order by r.id desc
    limit 50 offset (greatest(p_page, 1) - 1) * 50;
end;
$$;

revoke execute on function public.get_phi_audit_log(text, text, date, date, int) from public, anon;
grant execute on function public.get_phi_audit_log(text, text, date, date, int) to authenticated;
