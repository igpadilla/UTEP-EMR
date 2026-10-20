-- Log vitals activity on assigned cases into audit_logs,
-- so instructors see it in the case's Audit Log.
-- (Vitals on live patients are not logged here: audit_logs needs a case_id.)

-- One-line summary of a set, e.g. "BP 148/92, HR 88, RR 16, Temp 98.4°F, SpO2 97%".
-- Measurements that were not taken are skipped.
create or replace function private.vitals_summary(v public.vital_sign_sets)
returns text
language sql
immutable
as $$
    select concat_ws(', ',
        'BP ' || v.systolic_bp || '/' || v.diastolic_bp,
        'HR ' || v.heart_rate,
        'RR ' || v.resp_rate,
        'Temp ' || v.temperature_f || '°F',
        'SpO2 ' || v.spo2 || '%',
        'O2 ' || v.oxygen,
        'Wt ' || v.weight_lb || ' lb',
        'Ht ' || v.height_in || ' in',
        'Pain ' || v.pain_score || '/10'
    );
$$;

create or replace function private.log_case_vitals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    old_set public.vital_sign_sets;
begin
    -- Only a student's case vitals are logged; instructor baseline rows are not.
    if new.assigned_case_id is null or new.source = 'baseline' then
        return new;
    end if;

    if tg_op = 'INSERT' and new.supersedes_id is null then
        insert into public.audit_logs (case_id, actor_id, action_type, new_value)
        values (new.assigned_case_id, new.recorded_by, 'VITALS_RECORDED',
                private.vitals_summary(new));

    elsif tg_op = 'INSERT' then
        select * into old_set from public.vital_sign_sets where id = new.supersedes_id;

        insert into public.audit_logs (case_id, actor_id, action_type, old_value, new_value)
        values (new.assigned_case_id, new.recorded_by, 'VITALS_CORRECTED',
                private.vitals_summary(old_set),
                'Was: ' || private.vitals_summary(old_set)
                    || '. Now: ' || private.vitals_summary(new)
                    || '. Reason: ' || new.correction_reason);

    elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'entered_in_error' then
        insert into public.audit_logs (case_id, actor_id, action_type, old_value, new_value)
        values (new.assigned_case_id, coalesce(auth.uid(), new.recorded_by), 'VITALS_ENTERED_IN_ERROR',
                private.vitals_summary(old),
                'Removed: ' || private.vitals_summary(old)
                    || '. Reason: ' || new.correction_reason);
    end if;

    return new;
end;
$$;

create trigger log_case_vitals
after insert or update on public.vital_sign_sets
for each row execute function private.log_case_vitals();
