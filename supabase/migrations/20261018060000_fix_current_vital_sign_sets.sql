-- A corrected set must stay hidden, even if its correction is later
-- marked entered in error. Before, the original set came back.
create or replace view public.current_vital_sign_sets
with (security_invoker = true) as
select v.*
from public.vital_sign_sets v
where v.status = 'active'
  and not exists (
      select 1 from public.vital_sign_sets newer
      where newer.supersedes_id = v.id
  );
