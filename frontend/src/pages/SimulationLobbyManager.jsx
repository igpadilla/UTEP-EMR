import { useEffect, useRef, useState } from "react";
import {
    getSimulation,
    getLobbyMembers,
    autoAssignLobbyRoles,
    overrideLobbyAssignment,
    startLobbySimulation,
    switchSimRound,
    cancelSimLobby,
    subscribeToSimulation,
} from "../services/simulationService.js";
import { getMyTemplates } from "../services/instructorService.js";

const ROLE_LABELS = {
    med: { label: "Med Student", color: "#0369a1", bg: "#e0f2fe" },
    front_desk: { label: "Front Desk", color: "#7c3aed", bg: "#ede9fe" },
    patient_actor: { label: "Patient Actor", color: "#0f766e", bg: "#ccfbf1" },
    observer: { label: "Observer", color: "#64748b", bg: "#f1f5f9" },
};

function memberName(m) {
    const p = m.profile;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
}

export default function SimulationLobbyManager({ simId, courseId, courseName, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [members, setMembers] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [assigning, setAssigning] = useState(false);
    const [starting, setStarting] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState("");
    const unsubRef = useRef(null);

    async function load() {
        try {
            const [simData, membersData] = await Promise.all([
                getSimulation(simId),
                getLobbyMembers(simId),
            ]);
            setSim(simData);
            setMembers(membersData);
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
        // Load templates for override dropdowns
        if (courseId) {
            getMyTemplates(courseId).then(setTemplates).catch(() => { });
        }
        unsubRef.current = subscribeToSimulation(simId, load);
        return () => unsubRef.current?.();
    }, [simId]);

    async function handleAutoAssign() {
        setAssigning(true);
        setError("");
        try {
            await autoAssignLobbyRoles(simId);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setAssigning(false);
        }
    }

    async function handleOverrideRole(userId, newRole) {
        setError("");
        try {
            await overrideLobbyAssignment(simId, userId, newRole);
            await load();
        } catch (e) {
            setError(e.message);
        }
    }

    async function handleOverrideTemplate(userId, templateId) {
        setError("");
        const member = members.find(m => m.user_id === userId);
        try {
            await overrideLobbyAssignment(simId, userId, member.assigned_role, templateId || null);
            await load();
        } catch (e) {
            setError(e.message);
        }
    }

    async function handleStart() {
        setStarting(true);
        setError("");
        try {
            await startLobbySimulation(simId);
            onNavigate("simulationMonitor", simId, { courseId, courseName });
        } catch (e) {
            setError(e.message);
            setStarting(false);
        }
    }

    async function handleCancel() {
        if (!window.confirm("Cancel this lobby? All waiting students will be notified and removed.")) return;
        setCancelling(true);
        setError("");
        try {
            await cancelSimLobby(simId);
            onNavigate("simulationList", null, { courseId, courseName });
        } catch (e) {
            setError(e.message);
            setCancelling(false);
        }
    }

    async function handleSwitchRound() {
        setSwitching(true);
        setError("");
        try {
            await switchSimRound(simId);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setSwitching(false);
        }
    }

    const isActive = sim?.status === "active";
    const isLobby = sim?.status === "lobby";
    const isEnded = sim?.status === "ended";
    const allRolesAssigned = members.length > 0 && members.every(m => m.assigned_role);
    const canStart = isLobby && allRolesAssigned;
    const canSwitch = isActive && sim?.sim_type === "lobby" && sim?.current_round === 1;

    const templateById = Object.fromEntries(templates.map(t => [t.id, t]));
    // Templates available from lobby_template_ids
    const lobbyTids = sim?.lobby_template_ids
        ? (Array.isArray(sim.lobby_template_ids) ? sim.lobby_template_ids : JSON.parse(sim.lobby_template_ids))
        : [];

    const medCount = members.filter(m => m.assigned_role === "med").length;
    const frontDeskCount = members.filter(m => m.assigned_role === "front_desk").length;
    const unassigned = members.filter(m => !m.assigned_role).length;

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationList", null, { courseId, courseName })}>
                        ← Simulations
                    </button>
                    <div>
                        <p className="section-title">Simulation Lobby</p>
                        <h2 style={{ margin: 0 }}>{sim?.title ?? "…"}</h2>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        {isLobby && (
                            <span style={{ background: "#fef9c3", color: "#854d0e", padding: "0.4rem 0.9rem", borderRadius: "6px", fontWeight: 600, fontSize: "0.8rem" }}>
                                Lobby open — waiting for students
                            </span>
                        )}
                        {isActive && (
                            <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.4rem 0.9rem", borderRadius: "6px", fontWeight: 600, fontSize: "0.8rem" }}>
                                Round {sim?.current_round ?? 1} active
                            </span>
                        )}
                        {isActive && (
                            <button type="button" className="secondary-button"
                                onClick={() => onNavigate("simulationMonitor", simId, { courseId, courseName })}>
                                Open Monitor →
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {/* Stats bar */}
                {members.length > 0 && (
                    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                        {[
                            { label: "In lobby", value: members.length, color: "#2563eb", bg: "#eff6ff" },
                            { label: "Med", value: medCount, color: "#0369a1", bg: "#e0f2fe" },
                            { label: "Front Desk", value: frontDeskCount, color: "#7c3aed", bg: "#ede9fe" },
                            { label: "Unassigned", value: unassigned, color: unassigned > 0 ? "#dc2626" : "#15803d", bg: unassigned > 0 ? "#fef2f2" : "#f0fdf4" },
                        ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "80px" }}>
                                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.25rem" }}>
                    {/* Member list */}
                    <section className="course-detail-section">
                        <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h4 style={{ margin: 0 }}>Waiting Room ({members.length})</h4>
                            {isLobby && (
                                <button type="button" className="secondary-button"
                                    onClick={handleAutoAssign} disabled={assigning || members.length < 2}>
                                    {assigning ? "Assigning…" : "Auto-Assign Roles"}
                                </button>
                            )}
                        </div>

                        {members.length === 0 ? (
                            <p style={{ padding: "2rem 1.25rem", color: "var(--text-muted)", margin: 0, textAlign: "center", fontSize: "0.875rem" }}>
                                No students have joined yet. Share the simulation link or tell students to join from their course page.
                            </p>
                        ) : (
                            <>
                                <div style={{
                                    display: "grid", gridTemplateColumns: "1fr 150px 200px",
                                    padding: "0.5rem 1.25rem", background: "#f8fafc",
                                    fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
                                    letterSpacing: "0.04em", color: "var(--text-muted)",
                                    borderBottom: "1px solid var(--border)"
                                }}>
                                    <span>Name</span>
                                    <span>Role</span>
                                    <span>Patient Template</span>
                                </div>
                                {members.map(m => {
                                    const badge = m.assigned_role ? ROLE_LABELS[m.assigned_role] : null;
                                    const tpl = m.assigned_template_id ? templateById[m.assigned_template_id] : null;
                                    return (
                                        <div key={m.id} style={{
                                            display: "grid", gridTemplateColumns: "1fr 150px 200px",
                                            padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)",
                                            alignItems: "center", fontSize: "0.875rem"
                                        }}>
                                            <strong>{memberName(m)}</strong>

                                            {/* Role selector */}
                                            {isLobby ? (
                                                <select
                                                    className="form-input"
                                                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                                                    value={m.assigned_role ?? ""}
                                                    onChange={e => handleOverrideRole(m.user_id, e.target.value || null)}
                                                >
                                                    <option value="">— unassigned —</option>
                                                    <option value="med">Med Student</option>
                                                    <option value="front_desk">Front Desk</option>
                                                    <option value="patient_actor">Patient Actor</option>
                                                    <option value="observer">Observer</option>
                                                </select>
                                            ) : badge ? (
                                                <span style={{ ...badge, padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, display: "inline-block" }}>
                                                    {badge.label}
                                                </span>
                                            ) : (
                                                <span style={{ color: "var(--text-muted)" }}>—</span>
                                            )}

                                            {/* Template selector (for med role) */}
                                            {m.assigned_role === "med" && isLobby ? (
                                                <select
                                                    className="form-input"
                                                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                                                    value={m.assigned_template_id ?? ""}
                                                    onChange={e => handleOverrideTemplate(m.user_id, e.target.value)}
                                                >
                                                    <option value="">— select template —</option>
                                                    {lobbyTids.map(tid => {
                                                        const t = templateById[tid];
                                                        return t ? (
                                                            <option key={tid} value={tid}>
                                                                {t.last_name}, {t.first_name}
                                                            </option>
                                                        ) : null;
                                                    })}
                                                </select>
                                            ) : m.assigned_role === "med" && tpl ? (
                                                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                    {tpl.last_name}, {tpl.first_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>—</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </section>

                    {/* Action panel */}
                    <aside style={{ alignSelf: "start" }}>
                        {isLobby && (
                            <section className="course-detail-section" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
                                <h4 style={{ margin: "0 0 0.75rem" }}>Start Simulation</h4>
                                {!allRolesAssigned && members.length > 0 && (
                                    <p style={{ fontSize: "0.8rem", color: "#dc2626", marginBottom: "0.75rem" }}>
                                        {unassigned} member{unassigned > 1 ? "s" : ""} still unassigned.
                                    </p>
                                )}
                                {members.length === 0 && (
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                                        Waiting for students to join.
                                    </p>
                                )}
                                <button
                                    type="button"
                                    className="primary-button"
                                    style={{ width: "100%" }}
                                    onClick={handleStart}
                                    disabled={!canStart || starting}
                                >
                                    {starting ? "Starting…" : "Start Simulation →"}
                                </button>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    style={{ width: "100%", marginTop: "0.5rem", color: "#dc2626", borderColor: "#fca5a5" }}
                                    onClick={handleCancel}
                                    disabled={cancelling}
                                >
                                    {cancelling ? "Cancelling…" : "Cancel lobby"}
                                </button>
                            </section>
                        )}

                        {canSwitch && (
                            <section className="course-detail-section" style={{ padding: "1.25rem", marginBottom: "1rem", background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                                <h4 style={{ margin: "0 0 0.5rem", color: "#1d4ed8" }}>Switch Roles — Round 2</h4>
                                <p style={{ fontSize: "0.8rem", color: "#1e40af", marginBottom: "1rem" }}>
                                    Med ↔ Front Desk. Each student gets a fresh patient template.
                                    Requires {medCount} unused template{medCount !== 1 ? "s" : ""} in the lobby pool.
                                </p>
                                <button
                                    type="button"
                                    className="primary-button"
                                    style={{ width: "100%", background: "#2563eb" }}
                                    onClick={handleSwitchRound}
                                    disabled={switching}
                                >
                                    {switching ? "Switching…" : "Switch Roles →"}
                                </button>
                            </section>
                        )}

                        {isActive && sim?.current_round === 2 && (
                            <section className="course-detail-section" style={{ padding: "1.25rem", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                                <h4 style={{ margin: "0 0 0.25rem", color: "#15803d" }}>Round 2 Active</h4>
                                <p style={{ fontSize: "0.8rem", color: "#166534", margin: 0 }}>
                                    Roles have been switched. Students are working their second patient.
                                </p>
                            </section>
                        )}

                        {/* Templates info */}
                        {lobbyTids.length > 0 && (
                            <section className="course-detail-section" style={{ padding: "1.25rem" }}>
                                <h4 style={{ margin: "0 0 0.75rem" }}>Lobby Templates ({lobbyTids.length})</h4>
                                {lobbyTids.map((tid, i) => {
                                    const t = templateById[tid];
                                    return (
                                        <div key={tid} style={{ fontSize: "0.8rem", padding: "0.3rem 0", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                                            {i + 1}. {t ? `${t.last_name}, ${t.first_name} — ${t.chief_complaint}` : tid}
                                        </div>
                                    );
                                })}
                            </section>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    );
}
