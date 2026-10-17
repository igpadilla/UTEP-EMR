import { supabase } from "../supabase.js";

// Current vitals for a live patient, newest first.
export async function getVitals(patientId) {
    const { data, error } = await supabase
        .from("current_vital_sign_sets")
        .select("*")
        .eq("patient_id", patientId)
        .order("measured_at", { ascending: false });

    if (error) throw error;
    return data;
}

export async function recordVitals(patientId, vitals) {
    const { data, error } = await supabase
        .from("vital_sign_sets")
        .insert({ patient_id: patientId, ...vitals })
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
