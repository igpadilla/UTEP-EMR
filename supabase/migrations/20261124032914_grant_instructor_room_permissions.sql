-- Grant active instructors room-specific permissions
-- while preserving existing role-based authorization.
CREATE OR REPLACE FUNCTION public.has_permission(
    requested_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles prof
        JOIN public.profile_roles pr
            ON pr.user_id = prof.user_id
        JOIN public.roles r
            ON r.role_id = pr.role_id
        JOIN public.role_permissions rp
            ON rp.role_id = r.role_id
        JOIN public.permissions p
            ON p.permission_id = rp.permission_id
        WHERE prof.user_id = auth.uid()
          AND prof.active = TRUE
          AND r.active = TRUE
          AND p.active = TRUE
          AND p.permission_name = requested_permission
    )
    OR EXISTS (
        SELECT 1
        FROM public.profiles prof
        JOIN public.permissions p
            ON p.permission_name = requested_permission
        WHERE prof.user_id = auth.uid()
          AND prof.active = TRUE
          AND prof.account_type = 'instructor'
          AND p.active = TRUE
          AND p.permission_name IN (
              'room.read',
              'room.manage',
              'room.assign',
              'room.dismiss',
              'room.history.read'
          )
    );
$$;

-- Preserve restricted execution access.
REVOKE ALL ON FUNCTION public.has_permission(TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_permission(TEXT)
TO authenticated;

