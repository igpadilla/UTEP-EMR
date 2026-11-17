-- Returns user_id + email for every student enrolled in a given course.
-- Callable only by active staff (admin or instructor). The instructor does
-- not need to own the course — enrollment implies they can see the roster.
create function public.get_course_student_emails(p_course_id uuid)
returns table(user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not private.is_staff() then
        raise exception 'Access denied';
    end if;

    return query
    select p.user_id, u.email::text
    from public.course_enrollments ce
    join public.profiles p on p.user_id = ce.student_id
    join auth.users u on u.id = p.user_id
    where ce.course_id = p_course_id;
end;
$$;

grant execute on function public.get_course_student_emails(uuid) to authenticated;
