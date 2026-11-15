-- Security Advisor fixes.
-- Supabase grants EXECUTE on new public functions to anon directly, so "revoke ... from public" alone
-- left these callable without signing in. The app requires sign-in for everything.
revoke execute on function public.can_record_case_vitals(uuid) from anon;
revoke execute on function public.get_student_disciplines() from anon;
revoke execute on function public.grant_admin(uuid) from anon;
revoke execute on function public.has_permission(text) from anon;
revoke execute on function public.has_permission_in_course(uuid, text) from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_instructor() from anon;
revoke execute on function public.my_live_patient_access() from anon;
revoke execute on function public.remove_admin(uuid, text) from anon;

-- Trigger function for new sign-ups; nobody should call it through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Fixed search_path so the function can't be pointed at look-alike objects.
alter function private.vitals_summary(public.vital_sign_sets) set search_path = '';
