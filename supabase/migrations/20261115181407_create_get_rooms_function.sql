-- Return rooms and their current occupancy.
-- Requires the room.read permission.
CREATE OR REPLACE FUNCTION public.get_rooms()
RETURNS TABLE (
    id UUID,
    room_number TEXT,
    location TEXT,
    is_active BOOLEAN,
    is_occupied BOOLEAN,
    patient_id UUID,
    assigned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Verify authentication and room.read permission.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.read') THEN
        RAISE EXCEPTION
            'Permission denied: room.read required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.room_number,
        r.location,
        r.is_active,
        (o.id IS NOT NULL) AS is_occupied,
        o.patient_id,
        o.assigned_at
    FROM public.rooms AS r
    LEFT JOIN public.room_occupancies AS o
        ON o.room_id = r.id
       AND o.dismissed_at IS NULL
    ORDER BY r.room_number;
END;
$$;

-- Restrict execution to authenticated users.
REVOKE ALL ON FUNCTION public.get_rooms()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_rooms()
TO authenticated;
