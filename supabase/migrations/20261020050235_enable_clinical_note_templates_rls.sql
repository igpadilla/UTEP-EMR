-- Enable RLS to protect clinical note templates
ALTER TABLE public.clinical_note_templates
ENABLE ROW LEVEL SECURITY;

-- Supabase stops auto-granting new public tables to API roles; grant read access explicitly.
GRANT SELECT ON public.clinical_note_templates TO authenticated;
