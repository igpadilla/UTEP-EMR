-- Cases are built from a patient whose chart the instructor manages.
-- The template points at that patient. Assigning the case snapshots the
-- whole chart into the student's case: the patient record goes into
-- patient_snapshot and vitals are copied as rows. Every student works on
-- their own copy, and later chart edits do not change assigned cases.

alter table public.patient_templates
    add column patient_id uuid references public.patients(id) on delete restrict;

create index patient_templates_patient_id_idx on public.patient_templates (patient_id);

-- The patient a case was built from, or null for older templates
-- whose patient was typed into the template builder.
-- Chart tables that copy into a case on assignment use this.
create or replace function private.case_source_patient(p_case_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select t.patient_id
    from public.assigned_cases ac
    join public.patient_templates t on t.id = ac.template_id
    where ac.id = p_case_id;
$$;

-- Snapshot the patient record into the new case.
-- Patient fields come from the chart as it is now; case fields the
-- browser sent (chief complaint, instructions, rubric) are kept.
create or replace function private.snapshot_patient_chart()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    chart jsonb;
begin
    select to_jsonb(p) - 'id' - 'created_at' - 'updated_at' - 'last_visit' - 'last_visit_notes'
    into chart
    from public.patients p
    join public.patient_templates t on t.patient_id = p.id
    where t.id = new.template_id;

    if chart is not null then
        new.patient_snapshot := coalesce(new.patient_snapshot, '{}'::jsonb) || chart;
    end if;

    return new;
end;
$$;

create trigger snapshot_patient_chart
before insert on public.assigned_cases
for each row execute function private.snapshot_patient_chart();

-- Copy the patient's current vitals into the new case as baseline rows.
create or replace function private.copy_patient_vitals_to_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    source_patient uuid := private.case_source_patient(new.id);
begin
    if source_patient is null then
        return new;
    end if;

    insert into public.vital_sign_sets (
        assigned_case_id, source, care_setting, measured_at, recorded_by,
        systolic_bp, diastolic_bp, heart_rate, resp_rate, temperature_f, spo2,
        oxygen, weight_lb, height_in, pain_score, comment
    )
    select
        new.id, 'baseline', v.care_setting, v.measured_at, coalesce(new.assigned_by, v.recorded_by),
        v.systolic_bp, v.diastolic_bp, v.heart_rate, v.resp_rate, v.temperature_f, v.spo2,
        v.oxygen, v.weight_lb, v.height_in, v.pain_score, v.comment
    from public.current_vital_sign_sets v
    where v.patient_id = source_patient;

    return new;
end;
$$;

create trigger copy_patient_vitals_to_case
after insert on public.assigned_cases
for each row execute function private.copy_patient_vitals_to_case();
