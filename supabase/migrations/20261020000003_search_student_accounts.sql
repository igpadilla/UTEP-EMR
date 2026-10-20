-- Only the admin-checked manage-students Edge Function calls this RPC.
-- Joining Auth here allows name/email search before pagination, without exposing
-- auth.users or copying email addresses into a second source of truth.
create function public.search_student_accounts(
    p_search text default '',
    p_status text default 'all',
    p_page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    result jsonb;
    search_text text := lower(trim(coalesce(p_search, '')));
begin
    if length(search_text) > 254 then
        raise exception 'Search must contain at most 254 characters.';
    end if;
    if p_status is null or p_status not in ('all', 'active', 'inactive') then
        raise exception 'Status must be all, active, or inactive.';
    end if;
    if p_page is null or p_page < 1 then
        raise exception 'Page must be a positive whole number.';
    end if;

    with matched as materialized (
        select p.user_id, p.first_name, p.last_name, p.active, p.created_at, u.email
        from public.profiles p
        join auth.users u on u.id = p.user_id
        where p.account_type = 'student'
          and (p_status = 'all' or p.active = (p_status = 'active'))
          -- strpos treats %, _, quotes, and commas as literal search text.
          and (search_text = ''
               or strpos(lower(concat_ws(' ', p.first_name, p.last_name)), search_text) > 0
               or strpos(lower(coalesce(u.email, '')), search_text) > 0)
    ), counts as (
        select count(*) as total from matched
    ), paging as (
        select total, least(p_page::bigint, greatest(1, (total + 24) / 25)) as page
        from counts
    ), selected as (
        select * from matched
        order by created_at desc, user_id
        limit 25 offset (select (page - 1) * 25 from paging)
    )
    select jsonb_build_object(
        'students', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc, s.user_id) from selected s), '[]'::jsonb),
        'total', paging.total,
        'page', paging.page,
        'pageSize', 25
    ) into result from paging;

    return result;
end;
$$;

revoke all on function public.search_student_accounts(text, text, integer) from public, anon, authenticated;
grant execute on function public.search_student_accounts(text, text, integer) to service_role;
