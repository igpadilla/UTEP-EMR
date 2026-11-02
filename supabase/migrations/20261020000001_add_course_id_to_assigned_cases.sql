alter table public.assigned_cases
    add column course_id uuid
        references public.courses(id)
        on delete set null;

create index idx_assigned_cases_course_id
    on public.assigned_cases(course_id)
    where course_id is not null;
