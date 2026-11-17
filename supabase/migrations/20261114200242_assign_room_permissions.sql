-- Grant room permissions to Admin and Front Desk
INSERT INTO public.role_permissions (
    role_id,
    permission_id
)
SELECT
    r.role_id,
    p.permission_id
FROM public.roles AS r
CROSS JOIN public.permissions AS p
WHERE (
    (
        r.role_name = 'admin'
        AND p.permission_name IN (
            'room.read',
            'room.manage',
            'room.assign',
            'room.dismiss',
            'room.history.read'
        )
    )
    OR
    (
        r.role_name = 'front_desk'
        AND p.permission_name IN (
            'room.read',
            'room.assign',
            'room.dismiss'
        )
    )
)
AND NOT EXISTS (
    SELECT 1
    FROM public.role_permissions AS rp
    WHERE rp.role_id = r.role_id
      AND rp.permission_id = p.permission_id
);