--     -------------------Teachers can see their roster, only admins change who is in it-------------------
drop policy "Instructors enroll students in own courses" on public.course_enrollments;
drop policy "Instructors remove students from own courses" on public.course_enrollments;
drop policy "Admins manage all enrollments" on public.course_enrollments;

create function private.is_active_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.profiles
        where user_id = p_student_id and account_type = 'student' and active);
$$;
revoke all on function private.is_active_student(uuid) from public;
grant execute on function private.is_active_student(uuid) to authenticated;

create policy "Admins read enrollments" on public.course_enrollments
for select to authenticated using (public.is_admin());
create policy "Admins enroll active students" on public.course_enrollments
for insert to authenticated with check (
    public.is_admin() and enrolled_by = auth.uid() and private.is_active_student(student_id)
);
create policy "Admins update enrollments" on public.course_enrollments
for update to authenticated using (public.is_admin())
with check (public.is_admin() and private.is_active_student(student_id));
create policy "Admins remove enrollments" on public.course_enrollments
for delete to authenticated using (public.is_admin());

---------------------Deleting a course also deletes its roster, so check this path too -------------------
create function private.check_course_roster_delete()

returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null and not public.is_admin() and exists (
        select 1 from public.course_enrollments where course_id = old.id
    ) then
        raise exception 'Only admins can delete a course with enrolled students';
    end if;
    return old;
end;
$$;
revoke all on function private.check_course_roster_delete() from public;
create trigger check_course_roster_before_delete before delete on public.courses
for each row execute function private.check_course_roster_delete();
