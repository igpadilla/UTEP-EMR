import { useEffect, useState } from "react";
import { getVitals } from "../../services/vitalsService.js";
import { hasPermission } from "../../services/permissionService.js";
import { getFlag } from "./vitalRanges.js";
import VitalsForm from "./VitalsForm.jsx";
import "./vitals.css";

const FLAG_LABELS = { high: "▲ H", low: "▼ L", critical: "◆ Critical" };

export default function VitalsPanel({ patientId }) {
    const [vitals, setVitals] = useState([]);
    const [canRecord, setCanRecord] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        loadVitals();
        hasPermission("vitals.write").then(setCanRecord).catch(() => setCanRecord(false));
    }, [patientId]);

    async function loadVitals() {
        try {
            setVitals(await getVitals(patientId));
        } catch (err) {
            console.error(err);
            setError("Could not load vitals.");
        }
    }

    function handleSaved() {
        setShowForm(false);
        loadVitals();
    }

    return (
        <section className="vitals-panel">
            <div className="vitals-header">
                <h3>Vitals</h3>
                {canRecord && !showForm && (
                    <button className="primary-action-button" onClick={() => setShowForm(true)}>
                        + Record vitals
                    </button>
                )}
            </div>

            {error && <p role="alert" className="vitals-error">{error}</p>}

            {showForm && (
                <VitalsForm patientId={patientId} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
            )}

            {vitals.length === 0 ? (
                <p className="vitals-empty">No vitals recorded.</p>
            ) : (
                <div className="vitals-table-wrap">
                    <table className="vitals-table">
                        <thead>
                            <tr>
                                <th>Taken</th>
                                <th>BP</th>
                                <th>HR</th>
                                <th>RR</th>
                                <th>Temp °F</th>
                                <th>SpO₂ %</th>
                                <th>Weight lb</th>
                                <th>BMI</th>
                                <th>Pain</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vitals.map((set) => (
                                <tr key={set.id}>
                                    <td>{new Date(set.measured_at).toLocaleString()}</td>
                                    <Cell value={bpText(set)} flag={bpFlag(set)} />
                                    <Cell value={set.heart_rate} flag={getFlag("heart_rate", set.heart_rate)} />
                                    <Cell value={set.resp_rate} flag={getFlag("resp_rate", set.resp_rate)} />
                                    <Cell value={set.temperature_f} flag={getFlag("temperature_f", set.temperature_f)} />
                                    <Cell value={set.spo2} flag={getFlag("spo2", set.spo2)} />
                                    <Cell value={set.weight_lb} flag="" />
                                    <Cell value={set.bmi} flag={getFlag("bmi", set.bmi)} />
                                    <Cell value={set.pain_score} flag={getFlag("pain_score", set.pain_score)} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

// One table cell. Flagged values get a color and a text label (never color alone).
function Cell({ value, flag }) {
    if (value === null || value === undefined) {
        return <td className="vitals-none">—</td>;
    }
    return (
        <td className={flag ? `vitals-flag-${flag}` : ""}>
            {value}
            {flag && <span className="vitals-flag-label">{FLAG_LABELS[flag]}</span>}
        </td>
    );
}

function bpText(set) {
    if (set.systolic_bp === null && set.diastolic_bp === null) return null;
    return `${set.systolic_bp ?? "—"}/${set.diastolic_bp ?? "—"}`;
}

// BP uses the worse of the systolic and diastolic flags.
function bpFlag(set) {
    const systolic = getFlag("systolic_bp", set.systolic_bp);
    const diastolic = getFlag("diastolic_bp", set.diastolic_bp);
    if (systolic === "critical" || diastolic === "critical") return "critical";
    return systolic || diastolic;
}
