-- Create a room.
-- Access requires the room.manage permission.
CREATE OR REPLACE FUNCTION public.create_room(
    p_room_number TEXT,
    p_location TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_room_id UUID;
    v_room_number TEXT;
    v_location TEXT;
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

    -- Create an active room.
    INSERT INTO public.rooms (
        room_number,
        location,
        is_active,
        created_by
    )
    VALUES (
        v_room_number,
        v_location,
        TRUE,
        auth.uid()
    )
    RETURNING id INTO v_room_id;

    RETURN v_room_id;
END;
$$;

-- Prevent public or anonymous execution.
REVOKE ALL ON FUNCTION public.create_room(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

-- Only authenticated users may invoke the function.
-- The function itself checks room.manage.
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT)
    TO authenticated;
