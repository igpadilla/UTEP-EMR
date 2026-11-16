import { useEffect, useState } from "react";
import { getSimulationsForCourse } from "../services/simulationService.js";

const STATUS_BADGE = {
    draft:  { label: "Draft",  background: "#e0f2fe", color: "#0369a1" },
    active: { label: "Active", background: "#dcfce7", color: "#15803d" },
    ended:  { label: "Ended",  background: "#f1f5f9", color: "#64748b" },
};

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SimulationList({ courseId, courseName, onNavigate }) {
    const [sims, setSims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        getSimulationsForCourse(courseId)
            .then(setSims)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [courseId]);

    function openSim(sim) {
        if (sim.status === "draft") {
            onNavigate("simulationBuilder", sim.id, { courseId, courseName });
        } else {
            onNavigate("simulationMonitor", sim.id, { courseId, courseName });
        }
    }

    if (loading) return <p className="form-message">Loading simulations…</p>;

    return (
        <div>
            <div className="course-tab-header">
                <div>
                    <h3 className="course-tab-title">Simulations</h3>
                    <p className="course-tab-subtitle">Live in-class simulation sessions for this course</p>
                </div>
                <button
                    type="button"
                    className="primary-button"
                    style={{ width: "auto" }}
                    onClick={() => onNavigate("simulationBuilder", null, { courseId, courseName })}
                >
                    + New simulation
                </button>
            </div>

            {error && <p className="form-message form-message--error" role="alert">{error}</p>}

            {sims.length === 0 ? (
                <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                    <div className="patients-empty-icon" aria-hidden="true">🎬</div>
                    <strong>No simulations yet</strong>
                    <p>Create a simulation to run a live front-desk workflow exercise in class.</p>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => onNavigate("simulationBuilder", null, { courseId, courseName })}
                    >
                        Create first simulation
                    </button>
                </div>
            ) : (
                <div className="course-detail-section">
                    {sims.map(sim => {
                        const badge = STATUS_BADGE[sim.status] ?? STATUS_BADGE.ended;
                        return (
                            <button
                                key={sim.id}
                                type="button"
                                className="quick-access-card"
                                onClick={() => openSim(sim)}
                                style={{ textAlign: "left" }}
                            >
                                <span className="quick-content">
                                    <strong>{sim.title}</strong>
                                    <small style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.25rem" }}>
                                        <span
                                            style={{
                                                ...badge,
                                                padding: "0.1rem 0.5rem",
                                                borderRadius: "999px",
                                                fontSize: "0.7rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {badge.label}
                                        </span>
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {sim.end_mode === "timer" ? `${sim.duration_minutes} min` : "Workflow end"}
                                            {" · "}Created {formatDate(sim.created_at)}
                                        </span>
                                    </small>
                                </span>
                                <span className="quick-arrow" aria-hidden="true">→</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
