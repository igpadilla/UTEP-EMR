
INSERT INTO public.permissions (
    permission_name,
    category,
    description,
    active
)
SELECT
    new_permission.permission_name,
    new_permission.category,
    new_permission.description,
    true
FROM (
    VALUES
        (
            'room.read',
            'room',
            'View rooms and current room occupants.'
        ),
        (
            'room.manage',
            'room',
            'Create, edit, and deactivate rooms.'
        ),
        (
            'room.assign',
            'room',
            'Assign patients to available rooms.'
        ),
        (
            'room.dismiss',
            'room',
            'Release patients from occupied rooms.'
        ),
        (
            'room.history.read',
            'room',
            'View historical room occupancy records.'
        )
) AS new_permission (
    permission_name,
    category,
    description
)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.permissions AS existing
    WHERE existing.permission_name =
          new_permission.permission_name
);
