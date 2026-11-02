alter table public.courses
    add column discipline text
        references public.roles(role_name)
        on update cascade
        on delete restrict;

create index idx_courses_discipline
    on public.courses(discipline)
    where discipline is not null;

create or replace view public.student_course_roles
with (security_invoker = true)
as
select
    ce.student_id,
    ce.course_id,
    c.discipline          as role_name,
    r.display_name        as discipline_display,
    r.is_clinical,
    c.course_number,
    c.crn,
    c.instructor_id
from public.course_enrollments ce
join public.courses c
    on c.id = ce.course_id
join public.roles r
    on r.role_name = c.discipline
where c.discipline is not null
  and r.active = true;

create or replace function public.has_permission_in_course(
    p_course_id     uuid,
    p_permission    text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.course_enrollments ce
        join public.courses c
            on c.id = ce.course_id
        join public.roles r
            on r.role_name = c.discipline
        join public.role_permissions rp
            on rp.role_id = r.role_id
        join public.permissions p
            on p.permission_id = rp.permission_id
        where ce.student_id  = auth.uid()
          and ce.course_id   = p_course_id
          and r.active       = true
          and p.active       = true
          and p.permission_name = p_permission
    );
$$;

revoke all
    on function public.has_permission_in_course(uuid, text)
    from public;

grant execute
    on function public.has_permission_in_course(uuid, text)
    to authenticated;

create or replace function public.get_student_disciplines()
returns table (
    role_name       text,
    display_name    text,
    course_id       uuid,
    course_number   text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.discipline,
        r.display_name,
        c.id,
        c.course_number
    from public.course_enrollments ce
    join public.courses c
        on c.id = ce.course_id
    join public.roles r
        on r.role_name = c.discipline
    where ce.student_id = auth.uid()
      and c.discipline is not null
      and r.active = true;
$$;

revoke all
    on function public.get_student_disciplines()
    from public;

grant execute
    on function public.get_student_disciplines()
    to authenticated;
