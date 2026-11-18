import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase.js";
import {
    getSimulation,
    getSimEncounters,
    getSimEvents,
    stopSimulation,
    switchSimRound,
    updateScriptProgress,
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

function elapsed(from, end) {
    if (!from) return null;
    const endMs = end ? new Date(end).getTime() : Date.now();
    const secs = Math.floor((endMs - new Date(from).getTime()) / 1000);
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
    const [currentUserId, setCurrentUserId] = useState(null);
    const [scriptSaving, setScriptSaving] = useState({});
    const [confirmStop, setConfirmStop] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [switching, setSwitching] = useState(false);
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
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setCurrentUserId(user.id);
        });
        load();
        unsubRef.current = subscribeToSimulation(simId, load);
        const ticker = setInterval(() => {
            setSim(prev => {
                if (prev?.status === "ended") clearInterval(ticker);
                return prev;
            });
            setNow(Date.now());
        }, 1000);
        return () => {
            unsubRef.current?.();
            clearInterval(ticker);
        };
    }, [simId]);

    async function handleToggleCheck(encounterId, checkId, currentProgress) {
        const checked = Array.isArray(currentProgress) ? currentProgress : [];
        const next = checked.includes(checkId)
            ? checked.filter(id => id !== checkId)
            : [...checked, checkId];
        setScriptSaving(s => ({ ...s, [encounterId]: true }));
        try {
            await updateScriptProgress(encounterId, next);
            setEncounters(prev => prev.map(e =>
                e.id === encounterId ? { ...e, script_progress: next } : e
            ));
        } catch (e) {
            setError(e.message);
        } finally {
            setScriptSaving(s => ({ ...s, [encounterId]: false }));
        }
    }

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

    async function handleSwitchRound() {
        setSwitching(true);
        setError("");
        try {
            await switchSimRound(simId);
        } catch (e) {
            setError(e.message);
        } finally {
            setSwitching(false);
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

    const myActorEncounters = currentUserId
        ? encounters.filter(e => e.actor?.user_id === currentUserId)
        : [];

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                {/* ── Header ── */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("courseDetail", courseId)}>
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
                        {isActive && sim?.sim_type === "lobby" && sim?.current_round === 1 && (
                            <button type="button"
                                style={{
                                    background: "#2563eb", color: "#fff", border: "none",
                                    borderRadius: "6px", padding: "0.5rem 1rem", fontWeight: 600,
                                    cursor: "pointer", fontSize: "0.875rem"
                                }}
                                onClick={handleSwitchRound}
                                disabled={switching}>
                                {switching ? "Switching…" : "Switch Roles →"}
                            </button>
                        )}
                        {isActive && sim?.sim_type === "lobby" && sim?.current_round > 1 && (
                            <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "0.4rem 0.9rem", borderRadius: "6px", fontWeight: 600, fontSize: "0.875rem" }}>
                                Round {sim.current_round}
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

                {/* ── Main content + script sidebar ── */}
                <div style={{ display: "grid", gridTemplateColumns: myActorEncounters.length > 0 ? "1fr 280px" : "1fr", gap: "1.25rem", alignItems: "start" }}>
                <div>

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
                                {byStatus[status].map(enc => {
                                    const actor = enc.actor ? `${enc.actor.first_name} ${enc.actor.last_name}` : null;
                                    const frontDesk = enc.front_desk ? `${enc.front_desk.first_name} ${enc.front_desk.last_name}` : null;
                                    const medStudent = enc.med_student ? `${enc.med_student.first_name} ${enc.med_student.last_name}` : null;
                                    return (
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
                                                    +{elapsed(enc.checked_in_at, enc.discharged_at ?? sim?.ended_at)}
                                                </div>
                                            )}
                                            {actor && (
                                                <div style={{ marginTop: "0.3rem", fontSize: "0.72rem", color: "#0369a1" }}>
                                                    Actor: {actor}
                                                </div>
                                            )}
                                            {frontDesk && (
                                                <div style={{ fontSize: "0.72rem", color: "#15803d" }}>
                                                    Front desk: {frontDesk}
                                                </div>
                                            )}
                                            {medStudent && (
                                                <div style={{ fontSize: "0.72rem", color: "#7c3aed" }}>
                                                    Med: {medStudent}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
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
                        {[...events].reverse().map(evt => {
                            const pt = evt.encounter?.patient_templates;
                            const patName = pt ? `${pt.first_name} ${pt.last_name}` : null;
                            return (
                                <div key={evt.id} style={{
                                    padding: "0.5rem 0.75rem",
                                    borderBottom: "1px solid var(--border)",
                                    background: evt.event_type === "wrong_record_selected" ? "#fef9c3" : "#fff",
                                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem"
                                }}>
                                    <div>
                                        <span style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>
                                            {new Date(evt.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                        </span>
                                        <span style={{ fontWeight: 500 }}>{evt.event_type.replace(/_/g, " ")}</span>
                                        {patName && (
                                            <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)" }}>
                                                — {patName}
                                            </span>
                                        )}
                                    </div>
                                    {evt.actor && (
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                            {evt.actor.first_name} {evt.actor.last_name}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                </div>{/* end left column */}

                {/* ── Script sidebar (instructor as patient actor) ── */}
                {myActorEncounters.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <h4 style={{ margin: 0 }}>Your script</h4>
                        {myActorEncounters.map((enc, idx) => {
                            const script = enc.script ?? {};
                            const checks = script.checks ?? [];
                            const progress = Array.isArray(enc.script_progress) ? enc.script_progress : [];
                            const doneCount = checks.filter(c => progress.includes(c.id)).length;
                            const pt = enc.patient_templates;
                            return (
                                <section key={enc.id} className="course-detail-section">
                                    <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                {myActorEncounters.length > 1 ? `Patient ${idx + 1}` : "Your patient"}
                                            </p>
                                            <strong style={{ fontSize: "0.9rem" }}>{pt ? `${pt.first_name} ${pt.last_name}` : "—"}</strong>
                                        </div>
                                        {checks.length > 0 && (
                                            <span style={{
                                                fontSize: "0.75rem", fontWeight: 600,
                                                padding: "0.15rem 0.5rem", borderRadius: "999px",
                                                background: doneCount === checks.length ? "#dcfce7" : "#fef9c3",
                                                color: doneCount === checks.length ? "#15803d" : "#854d0e",
                                            }}>
                                                {doneCount}/{checks.length}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ padding: "0.75rem 1rem" }}>
                                        {script.narrative?.trim() && (
                                            <p style={{
                                                margin: "0 0 0.75rem", fontSize: "0.8rem", lineHeight: 1.5,
                                                whiteSpace: "pre-wrap", color: "var(--text)"
                                            }}>
                                                {script.narrative}
                                            </p>
                                        )}
                                        {checks.length > 0 && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                                {checks.map(check => {
                                                    const checked = progress.includes(check.id);
                                                    return (
                                                        <label key={check.id} style={{
                                                            display: "flex", alignItems: "center", gap: "0.6rem",
                                                            padding: "0.4rem 0.5rem", borderRadius: "6px",
                                                            background: checked ? "#f0fdf4" : "#fff",
                                                            border: `1px solid ${checked ? "#bbf7d0" : "var(--border)"}`,
                                                            cursor: isEnded ? "default" : "pointer",
                                                            opacity: scriptSaving[enc.id] ? 0.6 : 1,
                                                            fontSize: "0.8rem",
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={isEnded || scriptSaving[enc.id]}
                                                                onChange={() => handleToggleCheck(enc.id, check.id, progress)}
                                                                style={{ width: "0.875rem", height: "0.875rem", accentColor: "#16a34a", flexShrink: 0 }}
                                                            />
                                                            <span style={{
                                                                textDecoration: checked ? "line-through" : "none",
                                                                color: checked ? "var(--text-muted)" : "var(--text)",
                                                            }}>
                                                                {check.text}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {!script.narrative?.trim() && checks.length === 0 && (
                                            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>No script provided.</p>
                                        )}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

                </div>{/* end grid */}
            </main>
        </div>
    );
}
