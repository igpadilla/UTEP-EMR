
CREATE OR REPLACE FUNCTION public.transfer_patient_to_room(
    p_patient_id UUID,
    p_destination_room_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_room_id UUID;
    v_current_occupancy_id UUID;
    v_new_occupancy_id UUID;
    v_destination_active BOOLEAN;
    v_patient_archived_at TIMESTAMPTZ;
BEGIN
    -- A transfer requires permission to both dismiss and assign.
    IF auth.uid() IS NULL
       OR NOT public.has_permission('room.assign')
       OR NOT public.has_permission('room.dismiss') THEN
        RAISE EXCEPTION
            'Permission denied: room.assign and room.dismiss required'
            USING ERRCODE = '42501';
    END IF;

    IF p_patient_id IS NULL OR p_destination_room_id IS NULL THEN
        RAISE EXCEPTION
            'Patient and destination room IDs are required'
            USING ERRCODE = '22023';
    END IF;

    -- Locate the patient's current room.
    SELECT room_id
    INTO v_source_room_id
    FROM public.room_occupancies
    WHERE patient_id = p_patient_id
      AND dismissed_at IS NULL;

    IF v_source_room_id IS NULL THEN
        RAISE EXCEPTION
            'Patient has no active room assignment'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_source_room_id = p_destination_room_id THEN
        RAISE EXCEPTION
            'Patient is already assigned to the destination room'
            USING ERRCODE = '22023';
    END IF;

    -- Lock both rooms in a consistent order to reduce deadlocks.
    -- A single ordered query does not guarantee lock order, so
    -- acquire each lock explicitly in UUID order.
    IF v_source_room_id < p_destination_room_id THEN
        PERFORM 1 FROM public.rooms
        WHERE id = v_source_room_id FOR UPDATE;

        SELECT is_active INTO v_destination_active
        FROM public.rooms
        WHERE id = p_destination_room_id FOR UPDATE;
    ELSE
        SELECT is_active INTO v_destination_active
        FROM public.rooms
        WHERE id = p_destination_room_id FOR UPDATE;

        PERFORM 1 FROM public.rooms
        WHERE id = v_source_room_id FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Destination room not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_destination_active THEN
        RAISE EXCEPTION
            'Cannot transfer to an inactive room'
            USING ERRCODE = '22023';
    END IF;

    -- Lock and validate the patient.
    SELECT archived_at INTO v_patient_archived_at
    FROM public.patients
    WHERE id = p_patient_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_patient_archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot transfer an archived patient'
            USING ERRCODE = '22023';
    END IF;

    -- Recheck the occupancy after acquiring locks.
    SELECT id INTO v_current_occupancy_id
    FROM public.room_occupancies
    WHERE patient_id = p_patient_id
      AND room_id = v_source_room_id
      AND dismissed_at IS NULL
    FOR UPDATE;

    IF v_current_occupancy_id IS NULL THEN
        RAISE EXCEPTION
            'Room assignment changed during transfer; please retry'
            USING ERRCODE = '40001';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.room_occupancies
        WHERE room_id = p_destination_room_id
          AND dismissed_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Destination room is already occupied'
            USING ERRCODE = '23505';
    END IF;

    -- End the previous occupancy without deleting history.
    UPDATE public.room_occupancies
    SET dismissed_at = GREATEST(
            pg_catalog.clock_timestamp(),
            assigned_at
        ),
        dismissed_by = auth.uid()
    WHERE id = v_current_occupancy_id
      AND dismissed_at IS NULL;

    -- Create the new occupancy.
    INSERT INTO public.room_occupancies (
        room_id,
        patient_id,
        assigned_by
    )
    VALUES (
        p_destination_room_id,
        p_patient_id,
        auth.uid()
    )
    RETURNING id INTO v_new_occupancy_id;

    RETURN v_new_occupancy_id;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION
            'Destination room or patient has a conflicting assignment'
            USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_patient_to_room(UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_patient_to_room(UUID, UUID)
TO authenticated;
