import { supabase } from "../supabase.js";
import { demographicsToUpdate, historyToUpdate } from "../components/patient-chart/patientChartForm.js";

const PATIENT_FIELDS = "id, first_name, last_name, age, sex, date_of_birth, occupation, phone_number, email, address, emergency_contacts, allergies, medical_history, current_medications, updated_at";


export async function loadPatientChart({ patientId, caseId }) {
    if (caseId) {
        const { data, error } = await supabase.from("assigned_cases")
            .select("patient_snapshot, encounter_status").eq("id", caseId).single();
        if (error || !data?.patient_snapshot || typeof data.patient_snapshot !== "object" || Array.isArray(data.patient_snapshot)) {
            throw new Error("Could not load this case chart. Try again or go back to the case list.");
        }
        return { patient: data.patient_snapshot, caseStatus: data.encounter_status };
    }

    if (!patientId) throw new Error("Choose a patient before opening the chart.");
    const { data, error } = await supabase.from("patients").select(PATIENT_FIELDS).eq("id", patientId).single();
    if (error || !data) throw new Error("Could not load this patient chart. Try again or go back to the patient list.");
    return { patient: data, caseStatus: null };
}


async function saveSection(patient, changes) {
    if (!patient?.id) throw new Error("Case copies cannot change the original patient details.");

    //     Only save the fields from the section that was edited
    let query = supabase.from("patients")
        .update({ ...changes, updated_at: new Date().toISOString() }).eq("id", patient.id);

    //     Stop if another person changed this patient while the form was open
    if (patient.updated_at) query = query.eq("updated_at", patient.updated_at);
    const { data, error } = await query.select(PATIENT_FIELDS).maybeSingle();
    if (error) throw new Error("Could not save these patient details. Your edits are still here; try again.");
    if (!data) throw new Error("The patient changed or you no longer have edit access. Cancel, refresh the chart, and try again.");
    return data;
}


// A new patient starts with demographics only; the rest of the chart is filled in afterwards.
export async function createPatientFromChart(form) {
    const row = demographicsToUpdate(form, {});
    const { data, error } = await supabase.from("patients")
        .insert({ ...row, allergies: [], medical_history: [] })
        .select(PATIENT_FIELDS).single();
    if (error || !data) throw new Error("Could not create the patient. Your entries are still here; try again.");
    return data;
}


export function saveDemographics(patient, form) {
    return saveSection(patient, demographicsToUpdate(form, patient));
}


export function saveAllergiesAndHistory(patient, form) {
    return saveSection(patient, historyToUpdate(form));
}


export function saveMedications(patient, medications) {
    return saveSection(patient, { current_medications: medications });
}
