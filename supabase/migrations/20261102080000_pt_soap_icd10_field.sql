-- Use the ICD-10 search for the PT SOAP Note diagnosis field
update public.clinical_note_templates
set fields = (
    select jsonb_agg(
        case when field->>'key' = 'assessment.icd10_code'
            then field || '{"type": "icd10"}'
            else field
        end
        order by position)
    from jsonb_array_elements(fields) with ordinality as f(field, position)
)
where name = 'PT SOAP Note';

