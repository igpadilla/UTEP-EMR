import { supabase } from "../supabase.js";

export async function getRooms() {
  const { data, error } = await supabase.rpc("get_rooms");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function assignPatientToRoom(roomId, patientId) {
  const { data, error } = await supabase.rpc(
    "assign_patient_to_room",
    {
      p_room_id: roomId,
      p_patient_id: patientId,
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function getPatientsForRoomAssignment() {
  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name")
    .is("archived_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function dismissPatientFromRoom(patientId) {
    const { data, error } = await supabase.rpc(
        "dismiss_patient_from_room",
        {
            p_patient_id: patientId,
        }
    );

    if (error) {
        throw error;
    }

    return data;
}