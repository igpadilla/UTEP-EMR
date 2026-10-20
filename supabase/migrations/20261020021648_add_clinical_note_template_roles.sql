-- Create the relationship between clinical note templates and clinical roles.
CREATE TABLE public.clinical_note_template_roles (
    template_id uuid NOT NULL
        REFERENCES public.clinical_note_templates(id)
        ON DELETE CASCADE,

    role_id bigint NOT NULL
        REFERENCES public.roles(role_id)
        ON DELETE CASCADE,

    PRIMARY KEY (template_id, role_id)
);

-- Preserve existing Physical Therapy templates
INSERT INTO public.clinical_note_template_roles (
    template_id,
    role_id
)
SELECT
    id,
    role_id
FROM public.clinical_note_templates
WHERE role_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Enable Row Level Security.
ALTER TABLE public.clinical_note_template_roles
ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read role associations for active templates.
CREATE POLICY "Authenticated users can read active template roles"
ON public.clinical_note_template_roles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.clinical_note_templates t
        WHERE t.id = template_id
          AND t.active = true
    )
);

-- Allow authenticated users to query the relationship.
GRANT SELECT
ON public.clinical_note_template_roles
TO authenticated;

-- Improve performance when retrieving templates by role.
CREATE INDEX idx_clinical_note_template_roles_role
ON public.clinical_note_template_roles(role_id);