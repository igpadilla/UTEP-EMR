alter table public.patients
  add column immunizations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(immunizations) = 'array');
