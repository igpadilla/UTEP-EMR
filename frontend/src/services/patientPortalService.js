import { supabase } from "../supabase.js";

export async function loadMyPatientPortal() {
    //     The server uses the signed in account to find the right patient
    const { data, error } = await supabase.rpc("get_my_patient_portal");
    if (error) throw new Error("Unable to load your records. Try again or contact your care team about portal access.");
    if (!data?.patient) throw new Error("Your patient records are not linked yet. Contact your care team.");
    return data;
}

export async function createPatientPortalAccount(details) {
    const { data, error } = await supabase.functions.invoke("create-patient-account", { body: details });
    if (error) {
        let message = "Unable to create portal access. Please try again.";
        if (error.context instanceof Response) {
            try { message = (await error.context.json()).error || message; } catch { /* Keep the message above */ }
        }
        throw new Error(message);
    }
    if (!data?.account?.id) throw new Error("Portal access was not confirmed. Refresh the account status before retrying.");
    return data.account;
}

export async function portalAccountStatus(patientId) {
    const { data, error } = await supabase.rpc("patient_portal_account_status", { p_patient_id: patientId });
    if (error) throw new Error("Unable to check portal access. Check that the portal migration is installed.");
    return data;
}

export async function setPortalAccess(patientId, active) {
    const { error } = await supabase.rpc("set_patient_portal_access", { p_patient_id: patientId, p_active: active });
    if (error) throw new Error("Unable to change portal access. Please try again.");
}

export async function releaseVisitSummary(visitId, summary) {
    const { error } = await supabase.rpc("release_patient_visit_summary", { p_visit_id: visitId, p_summary: summary });
    if (error) throw new Error(error.message);
}

export async function releaseLabResult(patientId, fields) {
    const { error } = await supabase.from("patient_lab_results").insert({
        patient_id: patientId, test_name: fields.test.trim(), result_value: fields.result.trim(),
        unit: fields.unit.trim() || null, reference_range: fields.range.trim() || null,
        result_note: fields.note.trim() || null, collected_at: new Date(fields.collected).toISOString(),
        released_at: new Date().toISOString(),
    });
    if (error) throw new Error("Unable to release the lab result. Please try again.");
}
