alter table public.patient_templates
    add column course_id uuid
        references public.courses(id)
        on delete set null;

create index idx_patient_templates_course_id
    on public.patient_templates(course_id)
    where course_id is not null;
