-- Physical Therapy SOAP Note
insert into public.clinical_note_templates (
    role_id,
    name,
    description,
    fields
)
select
    role_id,
    'PT SOAP Note',
    'Standard SOAP documentation for physical therapy.',
    '[
        {
            "key": "subjective",
            "label": "Subjective",
            "type": "textarea",
            "required": true
        },
        {
            "key": "objective",
            "label": "Objective",
            "type": "textarea",
            "required": true
        },
        {
            "key": "assessment.icd10_code",
            "label": "ICD-10 Diagnosis",
            "type": "text",
            "required": true
        },
        {
            "key": "assessment.clinical_rationale",
            "label": "Clinical Rationale",
            "type": "textarea",
            "required": true
        },
        {
            "key": "plan",
            "label": "Plan",
            "type": "textarea",
            "required": true
        }
    ]'::jsonb
from public.roles
where role_name = 'physical_therapy';


-- Physical Therapy Initial Evaluation
insert into public.clinical_note_templates (
    role_id,
    name,
    description,
    fields
)
select
    role_id,
    'PT Initial Evaluation',
    'Comprehensive initial physical therapy evaluation.',
    '[
        {
            "key": "chief_complaint",
            "label": "Chief Complaint",
            "type": "textarea",
            "required": true
        },
        {
            "key": "subjective",
            "label": "Subjective History",
            "type": "textarea",
            "required": true
        },
        {
            "key": "range_of_motion",
            "label": "Range of Motion",
            "type": "textarea",
            "required": true
        },
        {
            "key": "strength",
            "label": "Muscle Strength",
            "type": "textarea",
            "required": true
        },
        {
            "key": "functional_limitations",
            "label": "Functional Limitations",
            "type": "textarea",
            "required": true
        },
        {
            "key": "assessment",
            "label": "Clinical Assessment",
            "type": "textarea",
            "required": true
        },
        {
            "key": "goals",
            "label": "Treatment Goals",
            "type": "textarea",
            "required": true
        },
        {
            "key": "plan",
            "label": "Treatment Plan",
            "type": "textarea",
            "required": true
        }
    ]'::jsonb
from public.roles
where role_name = 'physical_therapy';