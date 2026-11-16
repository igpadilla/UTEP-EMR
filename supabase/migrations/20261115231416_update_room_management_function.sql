-- Update an existing room.
-- Access requires the room.manage permission.
CREATE OR REPLACE FUNCTION public.update_room(
    p_room_id UUID,
    p_room_number TEXT,
    p_location TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_room_number TEXT;
    v_location TEXT;
    v_room_id UUID;
BEGIN
    -- Require authentication and room management permission.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.manage') THEN
        RAISE EXCEPTION
            'Permission denied: room.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- Normalize and validate the room number.
    v_room_number := upper(btrim(p_room_number));

    IF v_room_number IS NULL OR v_room_number = '' THEN
        RAISE EXCEPTION 'Room number is required'
            USING ERRCODE = '22023';
    END IF;

    -- Normalize optional location.
    v_location := NULLIF(btrim(p_location), '');

    -- Update the existing room without changing its ID.
    UPDATE public.rooms
    SET
        room_number = v_room_number,
        location = v_location
    WHERE id = p_room_id
    RETURNING id INTO v_room_id;

    -- Reject nonexistent room IDs.
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Room not found'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_room_id;
END;
$$;

-- Prevent public or anonymous execution.
REVOKE ALL ON FUNCTION public.update_room(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

-- Only authenticated users may invoke the function.
-- The function itself checks room.manage.
GRANT EXECUTE ON FUNCTION public.update_room(UUID, TEXT, TEXT)
    TO authenticated;
