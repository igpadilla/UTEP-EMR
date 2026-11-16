-- Track current and historical patient room assignments.
CREATE TABLE public.room_occupancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    room_id UUID NOT NULL
        REFERENCES public.rooms(id)
        ON DELETE RESTRICT,

    patient_id UUID NOT NULL
        REFERENCES public.patients(id)
        ON DELETE RESTRICT,

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    assigned_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    dismissed_at TIMESTAMPTZ,

    dismissed_by UUID
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    CONSTRAINT valid_occupancy_times
        CHECK (
            dismissed_at IS NULL
            OR dismissed_at >= assigned_at
        ),

    CONSTRAINT valid_dismissal_actor
        CHECK (
            dismissed_at IS NOT NULL
            OR dismissed_by IS NULL
        )
);

-- Only one current patient per room.
CREATE UNIQUE INDEX one_current_patient_per_room
ON public.room_occupancies (room_id)
WHERE dismissed_at IS NULL;

-- A patient can occupy only one room at a time.
CREATE UNIQUE INDEX one_current_room_per_patient
ON public.room_occupancies (patient_id)
WHERE dismissed_at IS NULL;

-- Room occupancy history queries.
CREATE INDEX room_occupancies_room_history_idx
ON public.room_occupancies (room_id, assigned_at DESC);

-- Enable RLS.
ALTER TABLE public.room_occupancies
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.room_occupancies
FROM anon, authenticated;
