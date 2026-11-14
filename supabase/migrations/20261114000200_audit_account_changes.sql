-- HIPAA audit trail: who created, changed or deactivated accounts and who granted roles.
-- record_id is the affected account's user_id.
create trigger audit_profiles after insert or update or delete on public.profiles
    for each row execute function private.log_phi_change();
create trigger audit_profile_roles after insert or update or delete on public.profile_roles
    for each row execute function private.log_phi_change();
