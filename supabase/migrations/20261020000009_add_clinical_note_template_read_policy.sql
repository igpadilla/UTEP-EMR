create policy "Authenticated users can read active clinical note templates"
on public.clinical_note_templates
for select
to authenticated
using (active = true);