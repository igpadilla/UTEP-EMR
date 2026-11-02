import { supabase } from "../supabase";

export async function createPatient(patientData){
    // Extract current_medications from patientData
    const { current_medications, ...dataToInsert } = patientData;

    const {data, error} = await supabase
        .from("patients")
        .insert([{ ...dataToInsert, current_medications }])
        .select()
        .single();
    
    if (error) throw new Error(error.message);

    // If there are medications, create an initial visit record to store them (as string for visits)
    if (current_medications && current_medications.length > 0) {
        const medsString = current_medications.map(m => `${m.medicine.name} ${m.dosage}${m.medicine.unit} ${m.frequency}x/day`).join(", ");
        const { error: visitError } = await supabase.from("visits").insert([{
            patient_id: data.id,
            notes: "Initial Patient Registration",
            medications: medsString
        }]);
        if (visitError) console.error("Error saving initial medications:", visitError);
    }

    return data;
}