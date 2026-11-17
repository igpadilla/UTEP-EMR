import { useEffect, useState } from "react";
import { getSimEncounters } from "../services/simulationService.js";

function row(label, value) {
    if (!value) return null;
    return (
        <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: "160px", flexShrink: 0, fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
            <span style={{ fontSize: "0.9rem" }}>{value}</span>
        </div>
    );
}

function listBlock(label, items) {
    if (!items?.length) return null;
    return (
        <div style={{ marginBottom: "0.75rem" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {items.map((item, i) => <li key={i} style={{ fontSize: "0.875rem" }}>{item}</li>)}
            </ul>
        </div>
    );
}

export default function SimulationPatientView({ encounterId, simId, onNavigate }) {
    const [encounter, setEncounter] = useState(null);
    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const encs = await getSimEncounters(simId);
                const enc = encs.find(e => e.id === encounterId);
                if (!enc) throw new Error("Encounter not found.");
                setEncounter(enc);
                setTemplate(enc.patient_templates ?? null);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [encounterId, simId]);

    if (loading) return <div className="emr-app"><main className="dashboard-main"><p className="form-message">Loading patient…</p></main></div>;

    const baseline = template?.clinical_baseline ?? {};
    const pt = template;

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("medSim", simId)}>
                        ← Med Board
                    </button>
                    <div>
                        <p className="section-title">Simulation — Patient Chart</p>
                        <h2 style={{ margin: 0 }}>{pt ? `${pt.first_name} ${pt.last_name}` : "Patient"}</h2>
                    </div>
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {pt && (
                    <>
                        {/* Demographics */}
                        <section className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                            <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                <h4 style={{ margin: 0 }}>Demographics</h4>
                            </div>
                            <div style={{ padding: "0.75rem 1.25rem" }}>
                                {row("Name", `${pt.first_name} ${pt.last_name}`)}
                                {row("Age", pt.age != null ? `${pt.age} years` : null)}
                                {row("Sex", pt.sex)}
                                {row("Chief complaint", pt.chief_complaint)}
                                {row("Arrival", encounter?.arrival_type?.replace(/_/g, " "))}
                            </div>
                        </section>

                        {/* Medical History */}
                        {(baseline.allergies?.length || baseline.medical_history?.length || baseline.surgical_history?.length || baseline.medications?.length) ? (
                            <section className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                                <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                    <h4 style={{ margin: 0 }}>Medical History</h4>
                                </div>
                                <div style={{ padding: "0.75rem 1.25rem" }}>
                                    {listBlock("Allergies", baseline.allergies)}
                                    {listBlock("Medical history", baseline.medical_history)}
                                    {listBlock("Surgical history", baseline.surgical_history)}
                                    {listBlock("Current medications", baseline.medications?.map(m =>
                                        typeof m === "string" ? m : `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.route ? ` ${m.route}` : ""}`
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {/* Vitals baseline */}
                        {baseline.vitals && (
                            <section className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                                <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                    <h4 style={{ margin: 0 }}>Baseline Vitals</h4>
                                </div>
                                <div style={{ padding: "0.75rem 1.25rem" }}>
                                    {row("BP", baseline.vitals.bp || (baseline.vitals.systolic_bp ? `${baseline.vitals.systolic_bp}/${baseline.vitals.diastolic_bp}` : null))}
                                    {row("Heart rate", baseline.vitals.heart_rate ? `${baseline.vitals.heart_rate} bpm` : null)}
                                    {row("Resp rate", baseline.vitals.resp_rate ? `${baseline.vitals.resp_rate} /min` : null)}
                                    {row("SpO2", baseline.vitals.spo2 ? `${baseline.vitals.spo2}%` : null)}
                                    {row("Temperature", baseline.vitals.temperature_f ? `${baseline.vitals.temperature_f} °F` : null)}
                                    {row("Pain score", baseline.vitals.pain_score != null ? `${baseline.vitals.pain_score}/10` : null)}
                                </div>
                            </section>
                        )}

                        {/* Additional notes */}
                        {baseline.notes && (
                            <section className="course-detail-section" style={{ marginBottom: "1.5rem" }}>
                                <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                    <h4 style={{ margin: 0 }}>Notes</h4>
                                </div>
                                <div style={{ padding: "0.75rem 1.25rem", fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                                    {baseline.notes}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
