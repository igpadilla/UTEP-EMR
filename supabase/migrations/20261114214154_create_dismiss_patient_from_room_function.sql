
CREATE OR REPLACE FUNCTION public.dismiss_patient_from_room(
    p_patient_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_occupancy_id UUID;
    v_room_id UUID;
BEGIN
    -- Require an authenticated user with dismissal permission.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.dismiss') THEN
        RAISE EXCEPTION
            'Permission denied: room.dismiss required'
            USING ERRCODE = '42501';
    END IF;

    IF p_patient_id IS NULL THEN
        RAISE EXCEPTION
            'Patient ID is required'
            USING ERRCODE = '22023';
    END IF;

    -- Find the patient's current room.
    SELECT room_id
    INTO v_room_id
    FROM public.room_occupancies
    WHERE patient_id = p_patient_id
    AND dismissed_at IS NULL;

    -- Reject dismissal when the patient has no active room.
    IF v_room_id IS NULL THEN
        RAISE EXCEPTION
            'Patient has no active room assignment'
            USING ERRCODE = 'P0002';
    END IF;

    -- Lock the room and serialize competing operations.
    PERFORM 1
    FROM public.rooms
    WHERE id = v_room_id
    FOR UPDATE;

    -- Lock the patient after locking the room.
    PERFORM 1
    FROM public.patients
    WHERE id = p_patient_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Patient not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- Verify the original assignment is still active.
    -- Lock the occupancy row to serialize concurrent dismissals.
    SELECT id
    INTO v_occupancy_id
    FROM public.room_occupancies
    WHERE patient_id = p_patient_id
    AND room_id = v_room_id
    AND dismissed_at IS NULL
    FOR UPDATE;

    IF v_occupancy_id IS NULL THEN
        RAISE EXCEPTION
            'Room assignment changed during dismissal; please retry'
            USING ERRCODE = '40001';
    END IF;

    -- Dismiss only the current occupancy.
    UPDATE public.room_occupancies
    SET
        dismissed_at = GREATEST(
            pg_catalog.clock_timestamp(),
            assigned_at
        ),
        dismissed_by = auth.uid()
    WHERE id = v_occupancy_id
        AND dismissed_at IS NULL
    RETURNING id INTO v_occupancy_id;

    IF v_occupancy_id IS NULL THEN
        RAISE EXCEPTION
            'Patient has no active room assignment'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_occupancy_id;
END;
$$;

-- Restrict execution to authenticated users.
REVOKE ALL ON FUNCTION
    public.dismiss_patient_from_room(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
    public.dismiss_patient_from_room(UUID)
TO authenticated;
