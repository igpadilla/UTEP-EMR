import { supabase } from "../supabase.js";

export async function getMyAssignedCases() {
    const { data, error } = await supabase
        .from("assigned_cases")
        .select("*")
        .order("assigned_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function startCase(caseId) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({ encounter_status: "in progress", updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function saveCaseNotes(caseId, notes) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({
            encounter_notes: notes,
            updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Works whether the student is submitting for the first time (in progress)
// or resubmitting after the instructor returned it (revision_requested)
export async function submitCase(caseId, notes) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({
            encounter_notes: notes,
            encounter_status: "pending review",
            updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Retrieve the clinical role for an assigned case from its course's discipline
export async function getAssignedCaseClinicalRole(caseId) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .select(`
            id,
            course_id,
            courses (
                discipline,
                roles (
                    role_id,
                    role_name,
                    display_name
                )
            )
        `)
        .eq("id", caseId)
        .single();

    if (error) throw error;

    // Cases without a course, or courses without a discipline, have no clinical role.
    const role = data.courses?.roles;
    if (!role) {
        return null;
    }

    return {
        courseId: data.course_id,
        roleId: role.role_id,
        roleName: role.role_name,
        roleDisplayName: role.display_name,
    };
}
