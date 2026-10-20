alter table public.assigned_cases
add column enrollment_id uuid
references public.course_enrollments(id);