import { useEffect, useState } from "react";
import { getSimulation, getMySimRole } from "../services/simulationService.js";

const ROLE_INFO = {
    front_desk:    { label: "Front Desk",    desc: "Find and check in patients. Use the front desk board to manage arrivals." },
    med:           { label: "Med Student",   desc: "Wait for your assigned patient to be checked in, then open their case." },
    patient_actor: { label: "Patient Actor", desc: "Walk up to the front desk and play your assigned patient." },
    observer:      { label: "Observer",      desc: "Watch the simulation in progress from the monitor view." },
};

export default function SimulationLobby({ simId, onNavigate, isStaff = false }) {
    const [sim, setSim] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        Promise.all([getSimulation(simId), getMySimRole(simId)])
            .then(([simData, myRole]) => { setSim(simData); setRole(myRole); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [simId]);

    function handleJoin() {
        if (role === "front_desk") onNavigate("frontDeskSim", simId);
        else if (role === "med") onNavigate("medSim", simId);
        else if (role === "observer") onNavigate("simulationMonitor", simId);
        else onNavigate("patientActorSim", simId);
    }

    if (loading) return <p className="form-message">Loading simulation…</p>;
    if (error) return <p className="form-message form-message--error">{error}</p>;

    const info = ROLE_INFO[role] ?? { label: role ?? "Participant", desc: "You are assigned to this simulation." };
    const isEnded = sim?.status === "ended";

    return (
        <div className="emr-app">
            <main className="dashboard-main" style={{ maxWidth: "520px" }}>
                <section className="welcome-section">
                    <p className="section-title">Active Simulation</p>
                    <h2>{sim?.title}</h2>
                </section>

                {isEnded && (
                    <div style={{
                        background: "#f1f5f9", border: "1px solid var(--border)",
                        borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem",
                        color: "#64748b", fontWeight: 500, textAlign: "center"
                    }}>
                        This simulation has ended.
                    </div>
                )}

                <div style={{
                    background: "#fff", border: "1px solid var(--border)", borderRadius: "12px",
                    padding: "1.5rem", marginBottom: "1.5rem", textAlign: "center"
                }}>
                    <h3 style={{ margin: "0 0 0.5rem" }}>Your role: {info.label}</h3>
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>{info.desc}</p>
                </div>

                {!isEnded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <button type="button" className="primary-button" style={{ width: "100%" }}
                            onClick={handleJoin}>
                            Join as {info.label} →
                        </button>
                        {isStaff && (
                            <button type="button" className="secondary-button" style={{ width: "100%" }}
                                onClick={() => onNavigate("simulationMonitor", simId)}>
                                Open simulation monitor
                            </button>
                        )}
                    </div>
                )}
                {isEnded && isStaff && (
                    <button type="button" className="secondary-button" style={{ width: "100%", marginTop: "0.75rem" }}
                        onClick={() => onNavigate("simulationMonitor", simId)}>
                        View simulation log
                    </button>
                )}
            </main>
        </div>
    );
}
