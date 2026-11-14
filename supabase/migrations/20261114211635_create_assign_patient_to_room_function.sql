
CREATE OR REPLACE FUNCTION public.assign_patient_to_room(
    p_room_id UUID,
    p_patient_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_occupancy_id UUID;
    v_room_active BOOLEAN;
    v_patient_archived_at TIMESTAMPTZ;
BEGIN
    -- Verify the caller has assignment permission.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.assign') THEN
        RAISE EXCEPTION 'Permission denied: room.assign required'
            USING ERRCODE = '42501';
    END IF;

    -- Require both identifiers.
    IF p_room_id IS NULL OR p_patient_id IS NULL THEN
        RAISE EXCEPTION 'Room and patient IDs are required';
    END IF;

    -- Lock the room to coordinate concurrent assignments.
    SELECT is_active
    INTO v_room_active
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room not found';
    END IF;

    IF NOT v_room_active THEN
        RAISE EXCEPTION 'Cannot assign a patient to an inactive room';
    END IF;

    -- Lock the patient to coordinate concurrent assignments.
    SELECT archived_at
    INTO v_patient_archived_at
    FROM public.patients
    WHERE id = p_patient_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;

    IF v_patient_archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot assign an archived patient';
    END IF;

    -- Reject rooms with an existing occupant.
    IF EXISTS (
        SELECT 1
        FROM public.room_occupancies
        WHERE room_id = p_room_id
          AND dismissed_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Room is already occupied';
    END IF;

    -- Reject patients already assigned to another room.
    IF EXISTS (
        SELECT 1
        FROM public.room_occupancies
        WHERE patient_id = p_patient_id
          AND dismissed_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Patient is already assigned to a room';
    END IF;

    -- Create the occupancy record.
    INSERT INTO public.room_occupancies (
        room_id,
        patient_id,
        assigned_by
    )
    VALUES (
        p_room_id,
        p_patient_id,
        auth.uid()
    )
    RETURNING id INTO v_occupancy_id;

    RETURN v_occupancy_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION
            'Room or patient already has an active assignment'
            USING ERRCODE = '23505';
END;
$$;

-- Restrict who can execute this function.
REVOKE ALL ON FUNCTION public.assign_patient_to_room(UUID, UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assign_patient_to_room(UUID, UUID)
TO authenticated;
