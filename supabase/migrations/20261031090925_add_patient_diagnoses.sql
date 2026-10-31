alter table public.patients
  add column diagnoses jsonb not null default '[]'::jsonb
  check (jsonb_typeof(diagnoses) = 'array');