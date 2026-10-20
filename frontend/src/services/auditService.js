import { supabase } from "../supabase.js";

export const ACTION_TYPES = {
    CASE_ASSIGNED:       "CASE_ASSIGNED",
    STATUS_CHANGED:      "STATUS_CHANGED",
    NOTES_SAVED:         "NOTES_SAVED",
    CASE_SUBMITTED:      "CASE_SUBMITTED",
    FEEDBACK_ADDED:      "FEEDBACK_ADDED",
    CASE_SIGNED_OFF:     "CASE_SIGNED_OFF",
    CASE_RETURNED:       "CASE_RETURNED",
    REFERRAL_REQUESTED:  "REFERRAL_REQUESTED",
    REFERRAL_ACCEPTED:   "REFERRAL_ACCEPTED",
    REFERRAL_COMPLETED:  "REFERRAL_COMPLETED",
    REFERRAL_CANCELLED:  "REFERRAL_CANCELLED",
};

export async function logCaseAction(caseId, actorId, actionType, oldValue = null, newValue = null) {
    const { error } = await supabase
        .from("audit_logs")
        .insert({ case_id: caseId, actor_id: actorId, action_type: actionType, old_value: oldValue, new_value: newValue });

    if (error) throw error;
}

export async function getCaseAuditLogs(caseId) {
    const { data, error } = await supabase
        .from("audit_logs")
        .select(`
            id,
            action_type,
            old_value,
            new_value,
            created_at,
            profiles!actor_id ( first_name, last_name )
        `)
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}
