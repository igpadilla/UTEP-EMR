import { supabase } from "../supabase.js";


export async function createSimulation({ courseId, title, mode = "standard", endMode = "workflow", durationMinutes = null, simType = "assigned", lobbyTemplateIds = null }) {
    const { data, error } = await supabase.rpc("create_simulation", {
        p_course_id: courseId,
        p_title: title,
        p_mode: mode,
        p_end_mode: endMode,
        p_duration_minutes: durationMinutes,
        p_sim_type: simType,
        p_lobby_template_ids: lobbyTemplateIds,
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
        .select("id, title, status, sim_type, current_round, mode, end_mode, duration_minutes, started_at, ended_at, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

// Returns the calling user's active simulation participation entries.
// Role is read from the database every time — never cached in session state.
// Deduplicates by simulation_id (a user can have multiple round rows after a switch).
export async function getMyActiveSimulations() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from("simulation_participants")
        .select("sim_role, simulation_id, simulations ( id, title, status, course_id )")
        .eq("user_id", user.id);
    if (error) throw error;
    const seen = new Set();
    return (data || []).filter(p => {
        if (p.simulations?.status !== "active") return false;
        if (seen.has(p.simulation_id)) return false;
        seen.add(p.simulation_id);
        return true;
    });
}

// Returns simulations the calling student participated in for a given course.
export async function getMySimsForCourse(courseId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
        .from("simulation_participants")
        .select("sim_role, round, simulation_id, simulations ( id, title, status, sim_type, current_round, started_at, ended_at, created_at )")
        .eq("user_id", user.id)
        .eq("simulations.course_id", courseId);
    if (error) throw error;
    // Deduplicate by simulation_id (round switch creates 2 rows)
    const seen = new Set();
    return (data || [])
        .filter(p => p.simulations?.course_id === courseId || true) // course_id filter applied above
        .filter(p => {
            if (!p.simulations) return false;
            if (seen.has(p.simulation_id)) return false;
            seen.add(p.simulation_id);
            return true;
        })
        .map(p => p.simulations)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Returns the calling student's roles and encounter activity for a single simulation.
export async function getMySimSummary(simId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [partsRes, medRes, fdRes, actorRes] = await Promise.allSettled([
        supabase
            .from("simulation_participants")
            .select("sim_role, round")
            .eq("simulation_id", simId)
            .eq("user_id", user.id)
            .order("round"),
        supabase
            .from("simulation_encounters")
            .select("id, round, status, med_started_at, med_completed_at, assigned_case_id, patient_templates!template_id(first_name, last_name, chief_complaint)")
            .eq("simulation_id", simId)
            .eq("assigned_med_id", user.id),
        supabase
            .from("simulation_encounters")
            .select("id, round, status, checked_in_at, patient_templates!template_id(first_name, last_name, chief_complaint)")
            .eq("simulation_id", simId)
            .eq("checked_in_by", user.id),
        supabase
            .from("simulation_encounters")
            .select("id, round, status, patient_templates!template_id(first_name, last_name, chief_complaint)")
            .eq("simulation_id", simId)
            .eq("patient_actor_id", user.id),
    ]);

    return {
        participants:        partsRes.status === "fulfilled" ? (partsRes.value.data  || []) : [],
        medEncounters:       medRes.status   === "fulfilled" ? (medRes.value.data    || []) : [],
        frontDeskEncounters: fdRes.status    === "fulfilled" ? (fdRes.value.data     || []) : [],
        actorEncounters:     actorRes.status === "fulfilled" ? (actorRes.value.data  || []) : [],
    };
}

// Returns lobby-status simulations for a course that the student can join.
export async function getOpenLobbiesForCourse(courseId) {
    const { data, error } = await supabase
        .from("simulations")
        .select("id, title, status, sim_type, created_at")
        .eq("course_id", courseId)
        .eq("status", "lobby")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

// Returns lobby members for a simulation (instructor view).
export async function getLobbyMembers(simId) {
    const { data, error } = await supabase
        .from("simulation_lobby_members")
        .select(`
            id, user_id, assigned_role, assigned_template_id, discipline, joined_at,
            profile:profiles!simulation_lobby_members_user_id_fkey ( first_name, last_name )
        `)
        .eq("simulation_id", simId)
        .order("joined_at", { ascending: true });
    if (error) throw error;
    return data || [];
}

// Returns whether the calling user is in the lobby for a simulation.
export async function getMyLobbyMembership(simId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
        .from("simulation_lobby_members")
        .select("id, assigned_role, assigned_template_id")
        .eq("simulation_id", simId)
        .eq("user_id", user.id)
        .maybeSingle();
    if (error) return null;
    return data ?? null;
}

export async function joinSimLobby(simId) {
    const { error } = await supabase.rpc("join_sim_lobby", { p_sim_id: simId });
    if (error) throw error;
}

export async function leaveSimLobby(simId) {
    const { error } = await supabase.rpc("leave_sim_lobby", { p_sim_id: simId });
    if (error) throw error;
}

export async function autoAssignLobbyRoles(simId) {
    const { error } = await supabase.rpc("auto_assign_lobby_roles", { p_sim_id: simId });
    if (error) throw error;
}

export async function overrideLobbyAssignment(simId, userId, newRole, templateId = null) {
    const { error } = await supabase.rpc("override_lobby_assignment", {
        p_sim_id: simId,
        p_user_id: userId,
        p_new_role: newRole,
        p_template_id: templateId,
    });
    if (error) throw error;
}

export async function startLobbySimulation(simId) {
    const { error } = await supabase.rpc("start_lobby_simulation", { p_sim_id: simId });
    if (error) throw error;
}

export async function switchSimRound(simId) {
    const { error } = await supabase.rpc("switch_sim_round", { p_sim_id: simId });
    if (error) throw error;
}

// Returns the calling user's sim_role in the CURRENT ROUND, or null if not a participant.
// Uses the get_my_sim_role RPC which is round-aware. Do not cache.
export async function getMySimRole(simId) {
    const { data, error } = await supabase.rpc("get_my_sim_role", { p_sim_id: simId });
    if (error) return null;
    return data ?? null;
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
            assigned_med_id, med_owner_id, assigned_case_id, round,
            arrived_at, checked_in_at, med_started_at, med_completed_at,
            discharged_at, checked_in_by, script, script_progress,
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

export async function dischargeEncounter(encounterId) {
    const { error } = await supabase.rpc("discharge_encounter", { p_encounter_id: encounterId });
    if (error) throw error;
}

export async function completeMedEncounter(encounterId) {
    const { error } = await supabase.rpc("complete_med_encounter", { p_encounter_id: encounterId });
    if (error) throw error;
}

export async function updateScriptProgress(encounterId, checkedIds) {
    const { error } = await supabase.rpc("update_script_progress", {
        p_encounter_id: encounterId,
        p_checked_ids: checkedIds,
    });
    if (error) throw error;
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
        .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "simulation_lobby_members",
            filter: `simulation_id=eq.${simId}`,
        }, onChange)
        .subscribe();

    return () => supabase.removeChannel(channel);
}
