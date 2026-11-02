alter table public.clinical_notes
add column template_id uuid
references public.clinical_note_templates(id);