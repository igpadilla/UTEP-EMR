import { supabase } from "../supabase.js";


export async function createSimulation({ courseId, title, mode = "standard", endMode = "workflow", durationMinutes = null }) {
    const { data, error } = await supabase.rpc("create_simulation", {
        p_course_id: courseId,
        p_title: title,
        p_mode: mode,
        p_end_mode: endMode,
        p_duration_minutes: durationMinutes,
    });
    if (error) throw error;
    return data; // uuid of new simulation
}

export async function setSimParticipants(simId, participants) {
    // participants: [{user_id, sim_role, discipline?}]
    const { error } = await supabase.rpc("set_sim_participants", {
        p_sim_id: simId,
        p_participants: participants,
    });
    if (error) throw error;
}

export async function setSimEncounters(simId, encounters) {
    // encounters: [{template_id, patient_actor_id, assigned_med_id, arrival_type, scheduled_time?}]
    const { error } = await supabase.rpc("set_sim_encounters", {
        p_sim_id: simId,
        p_encounters: encounters,
    });
    if (error) throw error;
}

export async function startSimulation(simId) {
    const { error } = await supabase.rpc("start_simulation", { p_sim_id: simId });
    if (error) throw error;
}

export async function stopSimulation(simId) {
    const { error } = await supabase.rpc("stop_simulation", { p_sim_id: simId });
    if (error) throw error;
}

export async function checkInEncounter(encounterId) {
    const { error } = await supabase.rpc("check_in_encounter", { p_encounter_id: encounterId });
    if (error) throw error;
}

// ── Data queries ──────────────────────────────────────────────────────────────

export async function getSimulation(simId) {
    const { data, error } = await supabase
        .from("simulations")
        .select("*")
        .eq("id", simId)
        .single();
    if (error) throw error;
    return data;
}

export async function getSimulationsForCourse(courseId) {
    const { data, error } = await supabase
        .from("simulations")
        .select("id, title, status, mode, end_mode, duration_minutes, started_at, ended_at, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

// Returns the calling user's active simulation participation entries.
// Role is read from the database every time — never cached in session state.
export async function getMyActiveSimulations() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from("simulation_participants")
        .select("sim_role, simulation_id, simulations ( id, title, status, course_id )")
        .eq("user_id", user.id);
    if (error) throw error;
    return (data || []).filter(p => p.simulations?.status === "active");
}

// Returns the calling user's sim_role in this simulation, or null if not a participant.
// Always fetches from DB — do not cache in profile/auth state.
export async function getMySimRole(simId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
        .from("simulation_participants")
        .select("sim_role")
        .eq("simulation_id", simId)
        .eq("user_id", user.id)
        .maybeSingle();
    if (error) return null;
    return data?.sim_role ?? null;
}

export async function getSimParticipants(simId) {
    const { data, error } = await supabase
        .from("simulation_participants")
        .select(`
            id, sim_role, discipline, user_id,
            participant:profiles!simulation_participants_user_id_fkey ( user_id, first_name, last_name )
        `)
        .eq("simulation_id", simId);
    if (error) throw error;
    return data || [];
}

export async function getSimEncounters(simId) {
    const { data, error } = await supabase
        .from("simulation_encounters")
        .select(`
            id, simulation_id, template_id, status, arrival_type, scheduled_time,
            assigned_med_id, med_owner_id, assigned_case_id,
            arrived_at, checked_in_at, med_started_at, med_completed_at,
            discharged_at, checked_in_by,
            patient_templates!template_id ( id, patient_id, first_name, last_name, age, sex, chief_complaint, clinical_baseline ),
            actor:profiles!patient_actor_id ( user_id, first_name, last_name ),
            med_student:profiles!assigned_med_id ( user_id, first_name, last_name ),
            front_desk:profiles!checked_in_by ( user_id, first_name, last_name )
        `)
        .eq("simulation_id", simId)
        .order("scheduled_time", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
}

export async function openSimCase(encounterId) {
    const { data, error } = await supabase.rpc("open_sim_case", {
        p_encounter_id: encounterId,
    });
    if (error) throw error;
    return data; // uuid of the assigned_case
}

export async function getSimEvents(simId) {
    const { data, error } = await supabase
        .from("simulation_events")
        .select(`
            id, event_type, payload, actor_id, encounter_id, created_at,
            actor:profiles!actor_id ( first_name, last_name ),
            encounter:simulation_encounters!encounter_id ( patient_templates!template_id ( first_name, last_name ) )
        `)
        .eq("simulation_id", simId)
        .order("id", { ascending: true });
    if (error) throw error;
    return data || [];
}

// ── Realtime subscription ─────────────────────────────────────────────────────
// Opens one channel for simulations + simulation_encounters + simulation_events,
// all filtered by simulation_id. Returns an unsubscribe function; always call it
// in a useEffect cleanup.

export function subscribeToSimulation(simId, onChange) {
    const channel = supabase
        .channel(`sim:${simId}`)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "simulations",
            filter: `id=eq.${simId}`,
        }, onChange)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "simulation_encounters",
            filter: `simulation_id=eq.${simId}`,
        }, onChange)
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "simulation_events",
            filter: `simulation_id=eq.${simId}`,
        }, onChange)
        .subscribe();

    return () => supabase.removeChannel(channel);
}
