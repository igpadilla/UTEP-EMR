import { supabase } from "../supabase.js";

// `owner` is { patientId } for an instructor's patient, or { caseId } for a student's case copy.
function ownerColumns(owner) {
    return owner.caseId ? { assigned_case_id: owner.caseId } : { patient_id: owner.patientId };
}

// Whether the signed-in student may record vitals on this case.
export async function canRecordCaseVitals(caseId) {
    const { data, error } = await supabase.rpc("can_record_case_vitals", { p_case_id: caseId });
    if (error) throw error;
    return data === true;
}

// Current vitals, newest first.
export async function getVitals(owner) {
    const { data, error } = await supabase
        .from("current_vital_sign_sets")
        .select("*")
        .match(ownerColumns(owner))
        .order("measured_at", { ascending: false });

    if (error) throw error;
    return data;
}

export async function recordVitals(owner, vitals) {
    const { data, error } = await supabase
        .from("vital_sign_sets")
        .insert({ ...ownerColumns(owner), ...vitals })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Correct a set by saving a new set that replaces the old one.
export async function correctVitals(oldSet, newValues, reason) {
    const { data, error } = await supabase
        .from("vital_sign_sets")
        .insert({
            patient_id: oldSet.patient_id,
            assigned_case_id: oldSet.assigned_case_id,
            care_setting: oldSet.care_setting,
            measured_at: oldSet.measured_at,
            ...newValues,
            supersedes_id: oldSet.id,
            correction_reason: reason,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Mark a set as entered in error. Only the person who recorded it can do this.
export async function markVitalsInError(id, reason) {
    const { data, error } = await supabase
        .from("vital_sign_sets")
        .update({ status: "entered_in_error", correction_reason: reason })
        .eq("id", id)
        .select();

    if (error) throw error;
    if (data.length === 0) throw new Error("You can only mark your own entries as entered in error.");
}

// Every set, including corrected and entered-in-error ones, for the history list.
export async function getVitalsHistory(owner) {
    const { data, error } = await supabase
        .from("vital_sign_sets")
        .select("*")
        .match(ownerColumns(owner))
        .order("recorded_at", { ascending: false });

    if (error) throw error;
    return data;
}
