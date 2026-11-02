create policy "Authenticated users can read all courses"
on public.courses for select to authenticated
using (true);
