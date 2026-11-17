import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase.js";
import { getSimulation, getSimEncounters, updateScriptProgress, subscribeToSimulation } from "../services/simulationService.js";

export default function PatientActorSim({ simId, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [encounters, setEncounters] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [saving, setSaving] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id ?? null);
        const [simData, encs] = await Promise.all([
            getSimulation(simId),
            getSimEncounters(simId),
        ]);
        setSim(simData);
        // show only encounters this user is acting in
        setEncounters(encs.filter(e => e.actor?.user_id === user?.id));
    }, [simId]);

    useEffect(() => {
        loadData().catch(e => setError(e.message)).finally(() => setLoading(false));
        const unsub = subscribeToSimulation(simId, () => {
            getSimEncounters(simId).then(encs => {
                setEncounters(prev => {
                    const uid = prev.length > 0 ? prev[0].actor?.user_id : null;
                    return encs.filter(e => e.actor?.user_id === (uid ?? currentUserId));
                });
            }).catch(() => {});
        });
        return unsub;
    }, [simId, loadData, currentUserId]);

    async function toggleCheck(encounterId, checkId, currentProgress) {
        const checked = Array.isArray(currentProgress) ? currentProgress : [];
        const next = checked.includes(checkId)
            ? checked.filter(id => id !== checkId)
            : [...checked, checkId];

        setSaving(s => ({ ...s, [encounterId]: true }));
        try {
            await updateScriptProgress(encounterId, next);
            setEncounters(prev => prev.map(e =>
                e.id === encounterId ? { ...e, script_progress: next } : e
            ));
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(s => ({ ...s, [encounterId]: false }));
        }
    }

    if (loading) return <div className="emr-app"><main className="dashboard-main"><p className="form-message">Loading…</p></main></div>;

    const isEnded = sim?.status === "ended";

    return (
        <div className="emr-app">
            <main className="dashboard-main" style={{ maxWidth: "600px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationLobby", simId)}>
                        ← Lobby
                    </button>
                    <div>
                        <p className="section-title">Active Simulation</p>
                        <h2 style={{ margin: 0 }}>{sim?.title ?? "Simulation"}</h2>
                    </div>
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {isEnded && (
                    <div style={{
                        background: "#f1f5f9", border: "1px solid var(--border)",
                        borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem",
                        color: "#64748b", fontWeight: 500, textAlign: "center",
                    }}>
                        This simulation has ended.
                    </div>
                )}

                {encounters.length === 0 ? (
                    <div style={{
                        background: "#fff", border: "1px solid var(--border)", borderRadius: "12px",
                        padding: "2rem", textAlign: "center", color: "var(--text-muted)",
                    }}>
                        <p>You have no patient encounters assigned in this simulation.</p>
                        <button type="button" className="secondary-button" style={{ marginTop: "1rem" }}
                            onClick={() => onNavigate("simulationLobby", simId)}>
                            Back to lobby
                        </button>
                    </div>
                ) : (
                    encounters.map((enc, idx) => {
                        const script = enc.script ?? {};
                        const checks = script.checks ?? [];
                        const progress = Array.isArray(enc.script_progress) ? enc.script_progress : [];
                        const doneCount = checks.filter(c => progress.includes(c.id)).length;
                        const pt = enc.patient_templates;

                        return (
                            <section key={enc.id} className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                                {/* Header */}
                                <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                            {encounters.length > 1 ? `Patient ${idx + 1}` : "Your Patient"}
                                        </p>
                                        <h3 style={{ margin: "0.1rem 0 0" }}>
                                            {pt ? `${pt.first_name} ${pt.last_name}` : "—"}
                                        </h3>
                                    </div>
                                    {checks.length > 0 && (
                                        <span style={{
                                            fontSize: "0.8rem", fontWeight: 600, padding: "0.2rem 0.6rem",
                                            borderRadius: "999px",
                                            background: doneCount === checks.length ? "#dcfce7" : "#fef9c3",
                                            color: doneCount === checks.length ? "#15803d" : "#854d0e",
                                        }}>
                                            {doneCount}/{checks.length} done
                                        </span>
                                    )}
                                </div>

                                <div style={{ padding: "0.75rem 1.25rem" }}>
                                    {/* Patient info */}
                                    {pt && (
                                        <div style={{ marginBottom: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                                            {pt.age != null && <span>Age: <strong style={{ color: "var(--text)" }}>{pt.age}</strong></span>}
                                            {pt.sex && <span>Sex: <strong style={{ color: "var(--text)" }}>{pt.sex}</strong></span>}
                                            {pt.chief_complaint && <span>CC: <strong style={{ color: "var(--text)" }}>{pt.chief_complaint}</strong></span>}
                                            <span>Arrival: <strong style={{ color: "var(--text)" }}>{enc.arrival_type?.replace(/_/g, " ")}</strong></span>
                                        </div>
                                    )}

                                    {/* Narrative */}
                                    {script.narrative?.trim() && (
                                        <div style={{ marginBottom: "1rem" }}>
                                            <p style={{ margin: "0 0 0.4rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Script</p>
                                            <div style={{
                                                background: "#f8fafc", border: "1px solid var(--border)",
                                                borderRadius: "8px", padding: "0.875rem 1rem",
                                                fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-wrap",
                                            }}>
                                                {script.narrative}
                                            </div>
                                        </div>
                                    )}

                                    {/* Checklist */}
                                    {checks.length > 0 && (
                                        <div>
                                            <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Checklist</p>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                                {checks.map(check => {
                                                    const checked = progress.includes(check.id);
                                                    return (
                                                        <label
                                                            key={check.id}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: "0.75rem",
                                                                padding: "0.6rem 0.75rem",
                                                                borderRadius: "8px", cursor: isEnded ? "default" : "pointer",
                                                                background: checked ? "#f0fdf4" : "#fff",
                                                                border: `1px solid ${checked ? "#bbf7d0" : "var(--border)"}`,
                                                                opacity: saving[enc.id] ? 0.6 : 1,
                                                                transition: "background 0.15s, border-color 0.15s",
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={isEnded || saving[enc.id]}
                                                                onChange={() => toggleCheck(enc.id, check.id, progress)}
                                                                style={{ width: "1rem", height: "1rem", accentColor: "#16a34a", flexShrink: 0 }}
                                                            />
                                                            <span style={{
                                                                fontSize: "0.9rem",
                                                                textDecoration: checked ? "line-through" : "none",
                                                                color: checked ? "var(--text-muted)" : "var(--text)",
                                                            }}>
                                                                {check.text}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {!script.narrative?.trim() && checks.length === 0 && (
                                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0 }}>
                                            No script provided for this encounter.
                                        </p>
                                    )}
                                </div>
                            </section>
                        );
                    })
                )}
            </main>
        </div>
    );
}
