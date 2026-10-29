alter table public.profiles add column must_change_password boolean not null default false;

create function public.set_must_change_password_false() returns void
language sql security definer set search_path = ''
as $$ update public.profiles set must_change_password = false where user_id = auth.uid(); $$;

revoke execute on function public.set_must_change_password_false() from public, anon;
grant execute on function public.set_must_change_password_false to authenticated;