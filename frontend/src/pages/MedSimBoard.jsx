import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase.js";
import {
    getSimulation,
    getSimEncounters,
    openSimCase,
    subscribeToSimulation,
} from "../services/simulationService.js";

function patientName(enc) {
    const t = enc.patient_templates;
    return t ? `${t.first_name} ${t.last_name}` : "Patient";
}

function elapsed(iso) {
    if (!iso) return null;
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MedSimBoard({ simId, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [encounters, setEncounters] = useState([]);
    const [userId, setUserId] = useState(null);
    const [toast, setToast] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [error, setError] = useState("");
    const [opening, setOpening] = useState(null); // encounterId being opened
    const prevRef = useRef([]);
    const toastTimer = useRef(null);
    const unsubRef = useRef(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id);
        });
    }, []);

    async function loadEncounters() {
        try {
            const encData = await getSimEncounters(simId);
            setEncounters(encData);
        } catch (e) {
            setError(e.message);
        }
    }

    async function handleSeePatient(enc) {
        setOpening(enc.id);
        try {
            const caseId = await openSimCase(enc.id);
            // Pass simId as id so PatientChart's back button resolves to "medSim" with the right id.
            // caseId drives chart loading so patientId is not needed.
            onNavigate("patientChart", simId, { caseId, backTo: "medSim" });
        } catch (e) {
            setError(e.message);
        } finally {
            setOpening(null);
        }
    }

    async function load() {
        try {
            const [simData, encData] = await Promise.all([
                getSimulation(simId),
                getSimEncounters(simId),
            ]);
            setSim(simData);
            setEncounters(encData);
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
        unsubRef.current = subscribeToSimulation(simId, loadEncounters);
        const ticker = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            unsubRef.current?.();
            clearInterval(ticker);
        };
    }, [simId]);

    // Detect when my assigned patient transitions to checked_in → show toast
    useEffect(() => {
        if (!userId || encounters.length === 0) return;
        const prevById = Object.fromEntries(prevRef.current.map(e => [e.id, e]));
        for (const enc of encounters) {
            const prev = prevById[enc.id];
            if (
                enc.assigned_med_id === userId &&
                enc.status === "checked_in" &&
                prev && prev.status !== "checked_in"
            ) {
                const msg = `${patientName(enc)} is ready`;
                setToast(msg);
                clearTimeout(toastTimer.current);
                toastTimer.current = setTimeout(() => setToast(null), 6000);
            }
        }
        prevRef.current = encounters;
    }, [encounters, userId]);

    const isEnded = sim?.status === "ended";

    // Encounters visible to this board: checked_in and beyond (not expected, not cancelled)
    const visible = encounters.filter(e =>
        ["checked_in", "in_progress", "med_complete"].includes(e.status)
    );

    // My assigned ones first, then others
    const mine = visible.filter(e => e.assigned_med_id === userId);
    const others = visible.filter(e => e.assigned_med_id !== userId);
    const sorted = [...mine, ...others];

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationLobby", simId)}>
                        ← Lobby
                    </button>
                    <div>
                        <p className="section-title">Med Board</p>
                        <h2 style={{ margin: 0 }}>{sim?.title ?? "…"}</h2>
                    </div>
                    {isEnded && (
                        <span style={{
                            marginLeft: "auto", background: "#f1f5f9", color: "#64748b",
                            padding: "0.4rem 0.9rem", borderRadius: "6px", fontWeight: 600,
                            fontSize: "0.875rem"
                        }}>
                            Simulation ended — read only
                        </span>
                    )}
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {/* Toast */}
                {toast && (
                    <div role="status" aria-live="polite"
                        style={{
                            position: "fixed", top: "1.25rem", right: "1.25rem", zIndex: 999,
                            background: "#15803d", color: "#fff", padding: "0.75rem 1.25rem",
                            borderRadius: "8px", fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                            display: "flex", alignItems: "center", gap: "0.75rem"
                        }}>
                        <span>🔔 {toast}</span>
                        <button type="button" onClick={() => setToast(null)}
                            style={{
                                background: "none", border: "none", color: "#fff",
                                cursor: "pointer", fontSize: "1rem", lineHeight: 1
                            }}>✕</button>
                    </div>
                )}

                {/* Board */}
                <section className="course-detail-section">
                    <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                        <h4 style={{ margin: 0 }}>Patients in progress</h4>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            Patients waiting for or currently with a provider.
                        </p>
                    </div>

                    {sorted.length === 0 ? (
                        <p style={{
                            padding: "2rem 1.25rem", color: "var(--text-muted)",
                            margin: 0, textAlign: "center"
                        }}>
                            No patients checked in yet. You'll see a notification when yours arrives.
                        </p>
                    ) : (
                        <>
                            {/* Header row */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 90px 90px 120px 140px",
                                padding: "0.5rem 1.25rem",
                                background: "#f8fafc",
                                fontSize: "0.72rem", fontWeight: 600,
                                textTransform: "uppercase", letterSpacing: "0.04em",
                                color: "var(--text-muted)",
                                borderBottom: "1px solid var(--border)"
                            }}>
                                <span>Patient</span>
                                <span>Room</span>
                                <span>Wait</span>
                                <span>Status</span>
                                <span />
                            </div>

                            {sorted.map(enc => {
                                const isMyPatient = enc.assigned_med_id === userId;
                                const needsAttention = isMyPatient && enc.status === "checked_in";

                                return (
                                    <div key={enc.id}
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 90px 90px 120px 140px",
                                            padding: "0.9rem 1.25rem",
                                            borderBottom: "1px solid var(--border)",
                                            alignItems: "center",
                                            background: needsAttention ? "#f0fdf4" : "#fff",
                                            borderLeft: needsAttention ? "3px solid #15803d" : "3px solid transparent",
                                        }}>
                                        <span>
                                            <strong style={{ display: "block" }}>{patientName(enc)}</strong>
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                {enc.patient_templates?.chief_complaint}
                                            </span>
                                            {needsAttention && (
                                                <span style={{
                                                    display: "inline-block", marginTop: "0.25rem",
                                                    fontSize: "0.72rem", fontWeight: 700,
                                                    background: "#15803d", color: "#fff",
                                                    padding: "0.1rem 0.5rem", borderRadius: "999px"
                                                }}>
                                                    Needs attention
                                                </span>
                                            )}
                                        </span>

                                        {/* Room placeholder */}
                                        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>—</span>

                                        <span style={{
                                            fontVariantNumeric: "tabular-nums",
                                            color: "var(--text-muted)", fontSize: "0.875rem"
                                        }}>
                                            {enc.checked_in_at ? elapsed(enc.checked_in_at) : "—"}
                                        </span>

                                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                            {enc.status.replace(/_/g, " ")}
                                        </span>

                                        <span>
                                            {isMyPatient ? (
                                                <button type="button"
                                                    className="primary-button"
                                                    style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                                                    disabled={opening === enc.id}
                                                    onClick={() => handleSeePatient(enc)}>
                                                    {opening === enc.id ? "Opening…" : "See patient →"}
                                                </button>
                                            ) : (
                                                <span style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--text-muted)"
                                                }}>
                                                    Another student's patient
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}
