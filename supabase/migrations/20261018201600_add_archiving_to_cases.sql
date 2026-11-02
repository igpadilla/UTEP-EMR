alter table public.assigned_cases
    add column if not exists is_archived boolean not null default false;

create index if not exists idx_assigned_cases_is_archived
    on public.assigned_cases (is_archived);
