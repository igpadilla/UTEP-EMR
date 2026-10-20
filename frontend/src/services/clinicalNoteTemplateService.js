
import { supabase } from "../supabase.js";
import { getAssignedCaseClinicalRole } from "./studentCaseService.js";

// Get all clinical note templates associated with a specific clinical role

export async function getClinicalNoteTemplatesByRole(roleId) {
    if (roleId == null) {
        return [];
    }

    // Find templates associated with the clinical role.
    const { data: assignments, error: assignmentsError } =
        await supabase
            .from("clinical_note_template_roles")
            .select("template_id")
            .eq("role_id", roleId);

    if (assignmentsError) throw assignmentsError;

    const templateIds = (assignments ?? []).map((assignment) => assignment.template_id);

    if (templateIds.length === 0) {
        return [];
    }

    // Retrieve active templates.
    const { data: templates, error: templatesError } =
        await supabase
            .from("clinical_note_templates")
            .select("id, role_id, name, description, fields, active")
            .in("id", templateIds)
            .eq("active", true)
            .order("name", { ascending: true });

    if (templatesError) throw templatesError;

    return templates ?? [];
}

// Retrieve available clinical note templates for a specific assigned case
export async function getClinicalNoteTemplatesForCase(caseId) {
    const clinicalRole = await getAssignedCaseClinicalRole(caseId);

    // Cases without a course enrollment cannot
    // determine their course-specific clinical role.
    if (!clinicalRole || !clinicalRole.roleId) {
        return {
            clinicalRole: null,
            templates: [],
        };
    }

    const templates = await getClinicalNoteTemplatesByRole(
        clinicalRole.roleId
    );

    return {
        clinicalRole,
        templates,
    };
}
