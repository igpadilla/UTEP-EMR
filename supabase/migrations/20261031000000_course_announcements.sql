create table public.course_announcements (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.courses(id) on delete cascade not null,
  author_id   uuid references auth.users(id) not null,
  title       text not null check (char_length(title) > 0),
  body        text not null check (char_length(body) > 0),
  created_at  timestamptz default now() not null
);

alter table public.course_announcements enable row level security;

-- Course instructor and enrolled students can read
create policy "course members read announcements"
  on public.course_announcements for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_announcements.course_id
        and (
          c.instructor_id = auth.uid()
          or exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = c.id and ce.student_id = auth.uid()
          )
        )
    )
  );

-- Only the course instructor can post
create policy "course instructor posts announcements"
  on public.course_announcements for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_announcements.course_id
        and c.instructor_id = auth.uid()
    )
  );

-- Only the author can delete
create policy "author deletes announcements"
  on public.course_announcements for delete to authenticated
  using (author_id = auth.uid());
