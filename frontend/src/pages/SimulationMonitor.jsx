import { useEffect, useRef, useState } from "react";
import {
    getSimulation,
    getSimEncounters,
    getSimEvents,
    stopSimulation,
    subscribeToSimulation,
} from "../services/simulationService.js";

const STATUS_COLS = ["expected", "checked_in", "in_progress", "med_complete", "discharged", "cancelled"];
const STATUS_LABEL = {
    expected: "Expected",
    checked_in: "Checked In",
    in_progress: "In Progress",
    med_complete: "Med Complete",
    discharged: "Discharged",
    cancelled: "Cancelled",
};
const STATUS_COLOR = {
    expected: "#e0f2fe",
    checked_in: "#dcfce7",
    in_progress: "#fef3c7",
    med_complete: "#ddd6fe",
    discharged: "#f1f5f9",
    cancelled: "#fee2e2",
};

function elapsed(from) {
    if (!from) return null;
    const secs = Math.floor((Date.now() - new Date(from).getTime()) / 1000);
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function patientName(enc) {
    const t = enc.patient_templates;
    if (!t) return "Patient";
    return `${t.first_name} ${t.last_name}`;
}

export default function SimulationMonitor({ simId, courseId, courseName, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [encounters, setEncounters] = useState([]);
    const [events, setEvents] = useState([]);
    const [now, setNow] = useState(Date.now());
    const [confirmStop, setConfirmStop] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState("");
    const unsubRef = useRef(null);

    async function load() {
        try {
            const [simData, encData, evtData] = await Promise.all([
                getSimulation(simId),
                getSimEncounters(simId),
                getSimEvents(simId),
            ]);
            setSim(simData);
            setEncounters(encData);
            setEvents(evtData);
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
        unsubRef.current = subscribeToSimulation(simId, load);
        const ticker = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            unsubRef.current?.();
            clearInterval(ticker);
        };
    }, [simId]);

    async function handleStop() {
        setStopping(true);
        try {
            await stopSimulation(simId);
            setConfirmStop(false);
        } catch (e) {
            setError(e.message);
        } finally {
            setStopping(false);
        }
    }

    const isEnded = sim?.status === "ended";
    const isActive = sim?.status === "active";
    const endsAt = sim?.ends_at ? new Date(sim.ends_at) : null;
    const timeLeft = endsAt ? Math.max(0, Math.floor((endsAt - now) / 1000)) : null;
    const timeLeftLabel = timeLeft !== null
        ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
        : null;

    const byStatus = STATUS_COLS.reduce((acc, s) => {
        acc[s] = encounters.filter(e => e.status === s);
        return acc;
    }, {});

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                {/* ── Header ── */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationList", null, { courseId, courseName })}>
                        ← Back
                    </button>
                    <div style={{ flex: 1 }}>
                        <p className="section-title">Simulation Monitor</p>
                        <h2 style={{ margin: 0 }}>{sim?.title ?? "…"}</h2>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {isActive && timeLeftLabel && (
                            <span style={{
                                fontVariantNumeric: "tabular-nums", fontWeight: 700,
                                color: timeLeft < 300 ? "#dc2626" : "#15803d",
                                fontSize: "1.25rem"
                            }}>
                                ⏱ {timeLeftLabel}
                            </span>
                        )}
                        {isActive && (
                            <button type="button"
                                style={{
                                    background: "#dc2626", color: "#fff", border: "none",
                                    borderRadius: "6px", padding: "0.5rem 1rem", fontWeight: 600,
                                    cursor: "pointer", fontSize: "0.875rem"
                                }}
                                onClick={() => setConfirmStop(true)}>
                                Stop simulation
                            </button>
                        )}
                        {isEnded && (
                            <span style={{
                                background: "#f1f5f9", color: "#64748b", padding: "0.4rem 0.9rem",
                                borderRadius: "6px", fontWeight: 600, fontSize: "0.875rem"
                            }}>
                                Simulation ended
                            </span>
                        )}
                    </div>
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {/* ── Confirm stop modal ── */}
                {confirmStop && (
                    <div style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999
                    }}>
                        <div style={{
                            background: "#fff", borderRadius: "12px", padding: "2rem",
                            maxWidth: "360px", width: "90%", textAlign: "center"
                        }}>
                            <h3 style={{ marginTop: 0 }}>Stop simulation?</h3>
                            <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                                This ends the session for all participants immediately. This cannot be undone.
                            </p>
                            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                                <button type="button" className="secondary-button"
                                    onClick={() => setConfirmStop(false)} disabled={stopping}>
                                    Cancel
                                </button>
                                <button type="button"
                                    style={{
                                        background: "#dc2626", color: "#fff", border: "none",
                                        borderRadius: "6px", padding: "0.5rem 1.25rem", fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                    onClick={handleStop} disabled={stopping}>
                                    {stopping ? "Stopping…" : "Yes, stop it"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Kanban board ── */}
                <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                    {STATUS_COLS.filter(s => s !== "cancelled" || byStatus.cancelled.length > 0).map(status => (
                        <div key={status} style={{ minWidth: "180px", flex: 1 }}>
                            <div style={{
                                background: STATUS_COLOR[status], borderRadius: "8px 8px 0 0",
                                padding: "0.5rem 0.75rem", fontWeight: 600, fontSize: "0.8rem",
                                display: "flex", justifyContent: "space-between"
                            }}>
                                <span>{STATUS_LABEL[status]}</span>
                                <span style={{ opacity: 0.7 }}>{byStatus[status].length}</span>
                            </div>
                            <div style={{
                                background: "#f8fafc", borderRadius: "0 0 8px 8px",
                                padding: "0.5rem", minHeight: "120px", border: "1px solid var(--border)",
                                borderTop: "none"
                            }}>
                                {byStatus[status].map(enc => (
                                    <div key={enc.id} style={{
                                        background: "#fff", borderRadius: "6px",
                                        padding: "0.6rem 0.75rem", marginBottom: "0.5rem",
                                        border: "1px solid var(--border)", fontSize: "0.8rem"
                                    }}>
                                        <div style={{ fontWeight: 600 }}>{patientName(enc)}</div>
                                        {enc.scheduled_time && (
                                            <div style={{ color: "var(--text-muted)" }}>
                                                {enc.scheduled_time.slice(0, 5)}
                                            </div>
                                        )}
                                        {enc.checked_in_at && status !== "expected" && (
                                            <div style={{ color: "var(--text-muted)" }}>
                                                +{elapsed(enc.checked_in_at)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Event feed ── */}
                <section style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ marginBottom: "0.5rem" }}>Event log</h4>
                    <div style={{
                        maxHeight: "220px", overflowY: "auto", border: "1px solid var(--border)",
                        borderRadius: "8px", fontSize: "0.8rem"
                    }}>
                        {events.length === 0 && (
                            <p style={{ padding: "1rem", color: "var(--text-muted)", margin: 0 }}>No events yet.</p>
                        )}
                        {[...events].reverse().map(evt => (
                            <div key={evt.id} style={{
                                padding: "0.5rem 0.75rem",
                                borderBottom: "1px solid var(--border)",
                                background: evt.event_type === "wrong_record_selected" ? "#fef9c3" : "#fff"
                            }}>
                                <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>
                                    {new Date(evt.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                                <span style={{ fontWeight: 500 }}>{evt.event_type.replace(/_/g, " ")}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
