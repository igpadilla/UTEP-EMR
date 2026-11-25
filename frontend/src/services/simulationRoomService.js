import { supabase } from "../supabase.js";

export async function getSimulationRooms(simulationId, round) {
    const { data, error } = await supabase
        .from("simulation_rooms")
        .select("id, simulation_id, round, room_number, is_background_occupied")
        .eq("simulation_id", simulationId)
        .eq("round", round)
        .order("room_number", { ascending: true });

    if (error) throw error;

    return data || [];
}

// Retrieve room assignments for a specific simulation round.
export async function getSimulationRoomAssignments(simulationId, round) {
    const { data, error } = await supabase
        .from("simulation_room_assignments")
        .select(
            "id, simulation_id, round, simulation_room_id, encounter_id, assigned_at, released_at"
        )
        .eq("simulation_id", simulationId)
        .eq("round", round)
        .is("released_at", null);

    if (error) throw error;

    return data || [];
}

// Assign an available virtual room to a checked-in encounter.
export async function assignSimulationRoom(encounterId, roomId) {
    const { error } = await supabase.rpc("assign_simulation_room", {
        p_encounter_id: encounterId,
        p_room_id: roomId,
    });

    if (error) throw error;
}

// Subscribe to virtual room assignment changes for a simulation.
export function subscribeToSimulationRoomAssignments(simulationId, onChange) {
    const channel = supabase
        .channel(`simulation-rooms:${simulationId}:${crypto.randomUUID()}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "simulation_room_assignments",
            filter: `simulation_id=eq.${simulationId}`,
        }, onChange)
        .subscribe();

    return () => supabase.removeChannel(channel);
}
