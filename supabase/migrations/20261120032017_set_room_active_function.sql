-- Activate or deactivate a room.
-- Requires the room.manage permission.
-- Occupied rooms cannot be deactivated.
CREATE OR REPLACE FUNCTION public.set_room_active(
    p_room_id UUID,
    p_is_active BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_room_id UUID;
    v_is_occupied BOOLEAN;
BEGIN
    -- Require authentication and room management permission.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.manage') THEN
        RAISE EXCEPTION
            'Permission denied: room.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- Validate the requested active status.
    IF p_is_active IS NULL THEN
        RAISE EXCEPTION 'Active status is required'
            USING ERRCODE = '22023';
    END IF;

    -- Lock the room to serialize concurrent status changes.
    SELECT id
    INTO v_room_id
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF v_room_id IS NULL THEN
        RAISE EXCEPTION 'Room not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- Check whether the room currently has a patient.
    SELECT EXISTS (
        SELECT 1
        FROM public.room_occupancies
        WHERE room_id = p_room_id
          AND dismissed_at IS NULL
    )
    INTO v_is_occupied;

    -- Prevent deactivation while a patient is assigned.
    IF p_is_active = FALSE AND v_is_occupied THEN
        RAISE EXCEPTION
            'Cannot deactivate an occupied room'
            USING ERRCODE = '23514';
    END IF;

    -- Update the room without deleting it.
    UPDATE public.rooms
    SET is_active = p_is_active
    WHERE id = p_room_id;

    RETURN v_room_id;
END;
$$;

-- Restrict execution to authenticated users.
REVOKE ALL ON FUNCTION public.set_room_active(UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_room_active(UUID, BOOLEAN)
    TO authenticated;
