-- Shared Instructor Answer Key on patient templates (visible only to staff, stripped from student snapshots)

alter table public.patient_templates add column if not exists answer_key text;

create or replace function private.strip_answer_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.patient_snapshot := new.patient_snapshot - 'traps' - 'rubric_criteria' - 'answer_key';
    return new;
end;
$$;

update public.assigned_cases
set patient_snapshot = patient_snapshot - 'answer_key'
where patient_snapshot ? 'answer_key';
