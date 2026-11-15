-- Allow simulation participants to read patient_templates used in their simulation.
-- Med students need to view the full template (including clinical_baseline) during a live sim.

create policy "sim participants read their encounter templates"
on public.patient_templates
for select
using (
    exists (
        select 1
        from public.simulation_encounters se
        join public.simulation_participants sp
          on sp.simulation_id = se.simulation_id
        where se.template_id = patient_templates.id
          and sp.user_id = (select auth.uid())
    )
);
