-- Create the rooms table
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    room_number TEXT NOT NULL,

    location TEXT,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_by UUID REFERENCES auth.users(id)
        ON DELETE SET NULL,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT rooms_number_not_blank
        CHECK (length(btrim(room_number)) > 0),

    CONSTRAINT rooms_number_normalized
        CHECK (
            room_number = upper(btrim(room_number))
        ),

    CONSTRAINT rooms_number_unique
        UNIQUE (room_number)
);

-- Automatically update the modification timestamp.
CREATE OR REPLACE FUNCTION public.set_room_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.set_room_updated_at();

-- Enable row-level security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rooms
FROM anon, authenticated;
