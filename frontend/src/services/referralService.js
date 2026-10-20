import { supabase } from "../supabase.js";
import { logCaseAction, ACTION_TYPES } from "./auditService.js";

export async function getReferrals({ patientId, caseId } = {}) {
    let query = supabase
        .from("referrals")
        .select("*, profiles:referring_user_id(first_name, last_name)")
        .order("created_at", { ascending: false });

    if (caseId) {
        query = query.eq("case_id", caseId);
    } else if (patientId) {
        query = query.eq("patient_id", patientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function getReferralsByPatient(patientId) {
    return getReferrals({ patientId });
}

export async function createReferral({ patientId, caseId, targetDiscipline, priority, reason, notes }) {
    const auth = await supabase.auth.getUser();
    const user = auth.data.user;

    const { data, error } = await supabase
        .from("referrals")
        .insert({
            patient_id: patientId || null,
            case_id: caseId || null,
            referring_user_id: user.id,
            target_discipline: targetDiscipline,
            priority: priority,
            reason: reason,
            notes: notes,
        })
        .select()
        .single();

    if (error) throw error;

    if (caseId) {
        const detail = `${targetDiscipline} (${(priority || "routine").toUpperCase()}) — ${reason}`;
        await logCaseAction(caseId, user.id, ACTION_TYPES.REFERRAL_REQUESTED, null, detail).catch(() => {});
    }

    return data;
}

export async function updateReferralStatus(referralId, newStatus, responseNotes = null) {
    const { data: ref } = await supabase
        .from("referrals")
        .select("case_id, status, target_discipline")
        .eq("id", referralId)
        .single();

    const updateData = { status: newStatus };
    if (responseNotes !== null) {
        updateData.response_notes = responseNotes;
    }

    const { data, error } = await supabase
        .from("referrals")
        .update(updateData)
        .eq("id", referralId);

    if (error) throw error;

    if (ref?.case_id) {
        const auth = await supabase.auth.getUser();
        const user = auth?.data?.user;
        if (user) {
            let actionType = ACTION_TYPES.STATUS_CHANGED;
            if (newStatus === "accepted") actionType = ACTION_TYPES.REFERRAL_ACCEPTED;
            else if (newStatus === "completed") actionType = ACTION_TYPES.REFERRAL_COMPLETED;
            else if (newStatus === "cancelled") actionType = ACTION_TYPES.REFERRAL_CANCELLED;

            const detail = responseNotes
                ? `${ref.target_discipline}: ${responseNotes}`
                : `${ref.target_discipline} — ${newStatus.toUpperCase()}`;

            await logCaseAction(ref.case_id, user.id, actionType, ref.status, detail).catch(() => {});
        }
    }

    return data;
}