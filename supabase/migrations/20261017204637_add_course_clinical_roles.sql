-- Assign one clinical role per course enrollment.
alter table public.course_enrollments
add column clinical_role_id bigint
references public.roles(role_id);