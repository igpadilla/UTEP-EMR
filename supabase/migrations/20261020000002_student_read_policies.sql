-- Students can read templates for cases assigned to them
create policy "Students can read assigned templates"
    on public.patient_templates
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.assigned_cases ac
            where ac.template_id = patient_templates.id
              and ac.student_id = auth.uid()
        )
    );

-- Students (and all authenticated users) can read instructor profiles
create policy "Students can read instructor profiles"
    on public.profiles
    for select
    to authenticated
    using (account_type = 'instructor');
