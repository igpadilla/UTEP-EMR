-- Keep the existing inactive-account rule on the new clinical tables too.
-- These checks restrict access without granting any new permissions.
create policy "Active accounts only"
on public.referrals as restrictive
for all to authenticated
using ((select private.is_active_account()))
with check ((select private.is_active_account()));

create policy "Active accounts only"
on public.vital_sign_sets as restrictive
for all to authenticated
using ((select private.is_active_account()))
with check ((select private.is_active_account()));
