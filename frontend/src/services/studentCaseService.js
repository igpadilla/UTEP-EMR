import { supabase } from "../supabase.js";
import { logCaseAction, ACTION_TYPES } from "./auditService.js";

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

// HIPAA-compliant append-only clinical note addendum for signed-off cases.
// Never mutates encounter_notes or prior addendums; appends a timestamped entry and routes for review.
export async function submitCaseAddendum(caseId, existingAddendums = [], { reason = "clarification", content = "" } = {}) {
    const trimmed = content.trim();
    if (!trimmed) {
        throw new Error("Addendum narrative cannot be empty.");
    }

    const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: null }));
    const userId = authData?.user?.id ?? null;

    const newEntry = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `add-${Date.now()}`,
        reason,
        content: trimmed,
        created_at: new Date().toISOString(),
        author_id: userId,
    };

    const nextAddendums = [
        ...(Array.isArray(existingAddendums) ? existingAddendums : []),
        newEntry,
    ];

    const { data, error } = await supabase
        .from("assigned_cases")
        .update({
            addendums: nextAddendums,
            encounter_status: "pending review",
            updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .select()
        .single();

    if (error) throw error;

    if (userId) {
        await logCaseAction(
            caseId,
            userId,
            ACTION_TYPES.ADDENDUM_SUBMITTED,
            "completed",
            `Addendum (${reason.replace(/_/g, " ")})`
        ).catch(() => {});
    }

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
