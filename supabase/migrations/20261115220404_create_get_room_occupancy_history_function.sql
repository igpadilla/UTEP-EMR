-- Return occupancy history for one room.
-- Access requires the room.history.read permission.
CREATE OR REPLACE FUNCTION public.get_room_occupancy_history(
    p_room_id UUID
)
RETURNS TABLE (
    occupancy_id UUID,
    room_id UUID,
    room_number TEXT,
    location TEXT,
    patient_id UUID,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID,
    dismissed_at TIMESTAMPTZ,
    dismissed_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.history.read') THEN
        RAISE EXCEPTION
            'Permission denied: room.history.read required'
            USING ERRCODE = '42501';
    END IF;

    IF p_room_id IS NULL THEN
        RAISE EXCEPTION
            'Room ID is required'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        o.id,
        r.id,
        r.room_number,
        r.location,
        o.patient_id,
        o.assigned_at,
        o.assigned_by,
        o.dismissed_at,
        o.dismissed_by
    FROM public.room_occupancies AS o
    JOIN public.rooms AS r
        ON r.id = o.room_id
    WHERE r.id = p_room_id
    ORDER BY o.assigned_at DESC;
END;
$$;

-- Prevent unauthenticated access.
REVOKE ALL ON FUNCTION
    public.get_room_occupancy_history(UUID)
FROM PUBLIC, anon, authenticated;

-- Allow authenticated users to call the function.
-- The function itself enforces room.history.read.
GRANT EXECUTE ON FUNCTION
    public.get_room_occupancy_history(UUID)
TO authenticated;
