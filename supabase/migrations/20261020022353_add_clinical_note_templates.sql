-- Templates for the clinical roles
WITH template_definitions(role_name, name, description, fields) AS (
    VALUES

    -- Nursing
    (
        'nursing',
        'Nursing Admission Assessment',
        'Initial nursing assessment for an admitted patient.',
        '[
            {"key":"chief_complaint","label":"Chief Complaint","type":"textarea","required":true},
            {"key":"health_history","label":"Health History","type":"textarea","required":true},
            {"key":"vital_signs","label":"Vital Signs","type":"textarea","required":true},
            {"key":"physical_assessment","label":"Physical Assessment","type":"textarea","required":true},
            {"key":"pain_assessment","label":"Pain Assessment","type":"textarea","required":true},
            {"key":"safety_risks","label":"Safety and Fall Risk Assessment","type":"textarea","required":true},
            {"key":"nursing_plan","label":"Nursing Care Plan","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- Pharmacy
    (
        'pharmacy',
        'Medication Reconciliation',
        'Review medications and identify discrepancies.',
        '[
            {"key":"medication_history","label":"Medication History","type":"textarea","required":true},
            {"key":"current_medications","label":"Current Medications","type":"textarea","required":true},
            {"key":"allergies","label":"Medication Allergies","type":"textarea","required":true},
            {"key":"discrepancies","label":"Medication Discrepancies","type":"textarea","required":true},
            {"key":"recommendations","label":"Pharmacist Recommendations","type":"textarea","required":true},
            {"key":"follow_up","label":"Follow-Up Plan","type":"textarea","required":false}
        ]'::jsonb
    ),

    -- Occupational Therapy
    (
        'occupational_therapy',
        'OT Initial Evaluation',
        'Initial occupational therapy evaluation.',
        '[
            {"key":"reason_for_referral","label":"Reason for Referral","type":"textarea","required":true},
            {"key":"occupational_profile","label":"Occupational Profile","type":"textarea","required":true},
            {"key":"adl_assessment","label":"Activities of Daily Living","type":"textarea","required":true},
            {"key":"functional_mobility","label":"Functional Mobility","type":"textarea","required":true},
            {"key":"cognitive_assessment","label":"Cognitive and Perceptual Assessment","type":"textarea","required":true},
            {"key":"goals","label":"Functional Goals","type":"textarea","required":true},
            {"key":"treatment_plan","label":"Treatment Plan","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- Speech-Language Pathology
    (
        'speech_language_pathology',
        'SLP Initial Evaluation',
        'Initial speech-language pathology assessment.',
        '[
            {"key":"reason_for_referral","label":"Reason for Referral","type":"textarea","required":true},
            {"key":"communication_history","label":"Communication History","type":"textarea","required":true},
            {"key":"speech_assessment","label":"Speech Assessment","type":"textarea","required":true},
            {"key":"language_assessment","label":"Language Assessment","type":"textarea","required":true},
            {"key":"swallowing_assessment","label":"Swallowing Assessment, if applicable","type":"textarea","required":false},
            {"key":"clinical_impression","label":"Clinical Impression","type":"textarea","required":true},
            {"key":"treatment_goals","label":"Treatment Goals and Plan","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- Psychology
    (
        'psychology',
        'Psychological Intake Assessment',
        'Initial psychological evaluation and history.',
        '[
            {"key":"presenting_concerns","label":"Presenting Concerns","type":"textarea","required":true},
            {"key":"psychological_history","label":"Psychological History","type":"textarea","required":true},
            {"key":"social_history","label":"Social and Family History","type":"textarea","required":true},
            {"key":"mental_status","label":"Mental Status Observations","type":"textarea","required":true},
            {"key":"risk_assessment","label":"Risk Assessment","type":"textarea","required":true},
            {"key":"clinical_formulation","label":"Clinical Formulation","type":"textarea","required":true},
            {"key":"treatment_recommendations","label":"Treatment Recommendations","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- Psychiatry
    (
        'psychiatry',
        'Psychiatric Initial Evaluation',
        'Comprehensive initial psychiatric evaluation.',
        '[
            {"key":"chief_complaint","label":"Chief Complaint","type":"textarea","required":true},
            {"key":"history_present_illness","label":"History of Present Illness","type":"textarea","required":true},
            {"key":"psychiatric_history","label":"Past Psychiatric History","type":"textarea","required":true},
            {"key":"medical_medication_history","label":"Medical and Medication History","type":"textarea","required":true},
            {"key":"mental_status_exam","label":"Mental Status Examination","type":"textarea","required":true},
            {"key":"safety_assessment","label":"Safety and Risk Assessment","type":"textarea","required":true},
            {"key":"diagnostic_impression","label":"Diagnostic Impression","type":"textarea","required":true},
            {"key":"treatment_plan","label":"Treatment Plan","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- Social Work
    (
        'social_work',
        'Psychosocial Assessment',
        'Assessment of psychosocial needs and available supports.',
        '[
            {"key":"reason_for_referral","label":"Reason for Referral","type":"textarea","required":true},
            {"key":"living_situation","label":"Living Situation","type":"textarea","required":true},
            {"key":"family_support","label":"Family and Social Support","type":"textarea","required":true},
            {"key":"financial_resources","label":"Financial and Community Resources","type":"textarea","required":true},
            {"key":"psychosocial_concerns","label":"Psychosocial Concerns","type":"textarea","required":true},
            {"key":"interventions","label":"Social Work Interventions","type":"textarea","required":true},
            {"key":"follow_up_plan","label":"Follow-Up and Discharge Planning","type":"textarea","required":true}
        ]'::jsonb
    ),

    -- In-patient Physician
    (
        'inpatient_physician',
        'Admission History & Physical',
        'Initial physician admission history and examination.',
        '[
            {"key":"chief_complaint","label":"Chief Complaint","type":"textarea","required":true},
            {"key":"history_present_illness","label":"History of Present Illness","type":"textarea","required":true},
            {"key":"past_medical_history","label":"Past Medical and Surgical History","type":"textarea","required":true},
            {"key":"medications_allergies","label":"Medications and Allergies","type":"textarea","required":true},
            {"key":"review_of_systems","label":"Review of Systems","type":"textarea","required":true},
            {"key":"physical_examination","label":"Physical Examination","type":"textarea","required":true},
            {"key":"assessment","label":"Assessment and Differential Diagnosis","type":"textarea","required":true},
            {"key":"plan","label":"Admission Plan","type":"textarea","required":true}
        ]'::jsonb
    )
),

inserted_templates AS (
    INSERT INTO public.clinical_note_templates (
        role_id,
        name,
        description,
        fields
    )
    SELECT
        r.role_id,
        td.name,
        td.description,
        td.fields
    FROM template_definitions td
    JOIN public.roles r
        ON r.role_name = td.role_name
    WHERE r.active = true
      AND r.is_clinical = true
      AND NOT EXISTS (
          SELECT 1
          FROM public.clinical_note_templates existing
          WHERE existing.role_id = r.role_id
            AND existing.name = td.name
      )
    RETURNING id, role_id
)

INSERT INTO public.clinical_note_template_roles (
    template_id,
    role_id
)
SELECT id, role_id
FROM inserted_templates
ON CONFLICT DO NOTHING;

-- Ensure all matching templates, including previously existing ones, have their role associations.

INSERT INTO public.clinical_note_template_roles (
    template_id,
    role_id
)
SELECT t.id, r.role_id
FROM public.clinical_note_templates t
JOIN public.roles r
    ON r.role_id = t.role_id
WHERE r.is_clinical = true
ON CONFLICT DO NOTHING;
