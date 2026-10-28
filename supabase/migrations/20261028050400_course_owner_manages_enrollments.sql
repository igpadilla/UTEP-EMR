-- Enrollments belong to the course, not to whoever clicked "enroll".
-- Before: an instructor could enroll students into another instructor's course,
-- and could not see students an admin enrolled into their own course.

drop policy "Instructors manage course enrollments" on public.course_enrollments;

create policy "Instructors read enrollments in own courses"
on public.course_enrollments for select to authenticated
using (private.owns_course(course_id));

create policy "Instructors enroll students in own courses"
on public.course_enrollments for insert to authenticated
with check (private.owns_course(course_id) and enrolled_by = auth.uid());

create policy "Instructors remove students from own courses"
on public.course_enrollments for delete to authenticated
using (private.owns_course(course_id));
