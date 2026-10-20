create table public.clinical_note_templates (
    id uuid primary key default gen_random_uuid(),

    role_id bigint not null
        references public.roles(role_id),

    name text not null,
    description text,

    fields jsonb not null default '[]'::jsonb,

    active boolean not null default true,

    created_at timestamptz not null default now()
);