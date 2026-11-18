import { useEffect, useRef, useState } from "react";
import {
    getSimulation,
    getLobbyMembers,
    getMySimRole,
    getMyLobbyMembership,
    leaveSimLobby,
    subscribeToSimulation,
} from "../services/simulationService.js";
import RoleReveal, { ROLE_INFO } from "../components/simulation/RoleReveal.jsx";

function memberName(m) {
    const p = m.profile;
    return p ? `${p.first_name} ${p.last_name}` : "Unknown";
}

export default function SimulationLobbyWaiting({ simId, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [members, setMembers] = useState([]);
    const [myMembership, setMyMembership] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState("");
    const [revealRole, setRevealRole] = useState(null); // role string while reveal is showing
    const unsubRef = useRef(null);
    const navigatedRef = useRef(false);

    function navigateToRole(role) {
        if (role === "front_desk") onNavigate("frontDeskSim", simId);
        else if (role === "med") onNavigate("medSim", simId);
        else if (role === "observer") onNavigate("simulationMonitor", simId);
        else if (role === "patient_actor") onNavigate("patientActorSim", simId);
        else onNavigate("simulationLobby", simId);
    }

    async function load() {
        try {
            const [simData, membersData, myData] = await Promise.all([
                getSimulation(simId),
                getLobbyMembers(simId),
                getMyLobbyMembership(simId),
            ]);
            setSim(simData);
            setMembers(membersData);
            setMyMembership(myData);

            // Show role reveal screen — only trigger once
            if (simData?.status === "active" && !navigatedRef.current) {
                navigatedRef.current = true;
                const role = await getMySimRole(simId);
                setRevealRole(role);
            }
            // Lobby was cancelled by instructor
            if (simData?.status === "ended" && !navigatedRef.current) {
                navigatedRef.current = true;
                onNavigate("studentCourses");
            }
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
        unsubRef.current = subscribeToSimulation(simId, load);
        return () => unsubRef.current?.();
    }, [simId]);

    async function handleLeave() {
        setLeaving(true);
        setError("");
        try {
            await leaveSimLobby(simId);
            onNavigate("studentCourses");
        } catch (e) {
            setError(e.message);
            setLeaving(false);
        }
    }

    const myRole = myMembership?.assigned_role;
    const roleInfo = myRole ? ROLE_INFO[myRole] : null;

    if (revealRole) {
        return <RoleReveal role={revealRole} onDone={() => navigateToRole(revealRole)} />;
    }

    return (
        <div className="emr-app">
            <main className="dashboard-main" style={{ maxWidth: "560px" }}>
                <section className="welcome-section">
                    <p className="section-title">Simulation Lobby</p>
                    <h2>{sim?.title ?? "…"}</h2>
                </section>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {/* Role assignment card */}
                <div style={{
                    background: "#fff", border: "1px solid var(--border)", borderRadius: "12px",
                    padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center"
                }}>
                    {roleInfo ? (
                        <>
                            <h3 style={{ margin: "0 0 0.5rem" }}>Your role: {roleInfo.label}</h3>
                            <p style={{ color: "var(--text-muted)", margin: 0 }}>{roleInfo.desc}</p>
                        </>
                    ) : (
                        <>
                            <h3 style={{ margin: "0 0 0.5rem" }}>Waiting for role assignment</h3>
                            <p style={{ color: "var(--text-muted)", margin: 0 }}>
                                Your instructor will assign roles shortly.
                            </p>
                        </>
                    )}
                </div>

                {/* Waiting room list */}
                <section className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                    <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                        <h4 style={{ margin: 0 }}>In the lobby ({members.length})</h4>
                    </div>
                    {members.map(m => {
                        const badge = m.assigned_role ? ROLE_INFO[m.assigned_role] : null;
                        return (
                            <div key={m.id} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "0.65rem 1.25rem", borderBottom: "1px solid var(--border)",
                                fontSize: "0.875rem"
                            }}>
                                <span style={{ fontWeight: 500 }}>{memberName(m)}</span>
                                {badge ? (
                                    <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                                        {badge.label}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Waiting…</span>
                                )}
                            </div>
                        );
                    })}
                </section>

                <button
                    type="button"
                    className="secondary-button"
                    style={{ width: "100%" }}
                    onClick={handleLeave}
                    disabled={leaving}
                >
                    {leaving ? "Leaving…" : "Leave lobby"}
                </button>
            </main>
        </div>
    );
}
