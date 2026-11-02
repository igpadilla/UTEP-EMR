-- Extend the existing inactive-account restriction to newer tables.
-- These policies only restrict access; they grant no new role permissions.
create policy "Active accounts only"
on public.courses as restrictive
for all to authenticated
using ((select private.is_active_account()))
with check ((select private.is_active_account()));

create policy "Active accounts only"
on public.course_enrollments as restrictive
for all to authenticated
using ((select private.is_active_account()))
with check ((select private.is_active_account()));

create policy "Active accounts only"
on public.clinical_notes as restrictive
for all to authenticated
using ((select private.is_active_account()))
with check ((select private.is_active_account()));
