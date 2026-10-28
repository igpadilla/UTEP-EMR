import { useEffect, useState } from "react";
import { getVitals, getVitalsHistory, markVitalsInError, canRecordCaseVitals } from "../../services/vitalsService.js";
import { getCurrentUserWithProfile } from "../../services/profile.js";
import { getFlag, getBloodPressureFlag } from "./vitalRanges.js";
import VitalsForm from "./VitalsForm.jsx";
import VitalsTrends from "./VitalsTrends.jsx";
import VitalsHistory from "./VitalsHistory.jsx";
import "./vitals.css";

const FLAG_LABELS = { high: "▲ H", low: "▼ L", critical: "◆ Critical" };

// Rows of the vitals grid. Most rows read one column (`field`);
// blood pressure and oxygen need their own value/flag functions.
const ROWS = [
    { label: "Blood pressure", unit: "mmHg", value: bpText, flag: (set) => getBloodPressureFlag(set.systolic_bp, set.diastolic_bp) },
    { label: "Heart rate", unit: "bpm", field: "heart_rate" },
    { label: "Resp. rate", unit: "/min", field: "resp_rate" },
    { label: "Temperature", unit: "°F", field: "temperature_f" },
    { label: "SpO₂", unit: "%", field: "spo2" },
    { label: "Oxygen", unit: "", value: (set) => set.oxygen, flag: () => "" },
    { label: "Weight", unit: "lb", field: "weight_lb" },
    { label: "Height", unit: "in", field: "height_in" },
    { label: "BMI", unit: "kg/m²", field: "bmi" },
    { label: "Pain", unit: "/10", field: "pain_score" },
];

// Pass `patientId` for an instructor's patient, or `caseId` for a student's case copy.
// `locked` makes it read-only (a submitted case).
export default function VitalsPanel({ patientId, caseId, locked = false }) {
    const owner = { patientId, caseId };
    const [vitals, setVitals] = useState([]);
    const [history, setHistory] = useState([]); // every set, for the corrections list
    const [canRecord, setCanRecord] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [correcting, setCorrecting] = useState(null); // the set being corrected
    const [error, setError] = useState("");

    useEffect(() => {
        loadVitals();
        checkCanRecord().then(setCanRecord).catch(() => setCanRecord(false));
    }, [patientId, caseId, locked]);

    // Only roles with vital write permissions can modify vitals.
    async function checkCanRecord() {
        if (locked) return false;
        if (caseId) return canRecordCaseVitals(caseId);
        const user = await getCurrentUserWithProfile();
        return ["admin", "instructor"].includes(user?.profile?.account_type);
    }

    async function loadVitals() {
        try {
            setVitals(await getVitals(owner));
            setHistory(await getVitalsHistory(owner));
        } catch (err) {
            console.error(err);
            setError("Could not load vitals.");
        }
    }

    function closeForm() {
        setShowForm(false);
        setCorrecting(null);
    }

    function handleSaved() {
        closeForm();
        loadVitals();
    }

    async function handleMarkError(set) {
        const reason = prompt("Why should this set be removed from the chart? For example: charted on the wrong patient. (required)");
        if (!reason) return;

        try {
            await markVitalsInError(set.id, reason);
            setError("");
            loadVitals();
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    }

    // getVitals returns newest first; the grid reads oldest → newest.
    const columns = [...vitals].reverse();
    const lastIndex = columns.length - 1;

    // While recording or correcting, the tab shows only the form (its own screen).
    if (showForm || correcting) {
        return (
            <section className="vitals-panel">
                <VitalsForm owner={owner} correcting={correcting} onSaved={handleSaved} onCancel={closeForm} />
            </section>
        );
    }

    return (
        <section className="vitals-panel">
            <div className="vitals-header">
                <div>
                    <h2>Vitals flowsheet</h2>
                    <p className="vitals-subtitle">
                        {vitals.length} {vitals.length === 1 ? "set" : "sets"} on record
                    </p>
                </div>
                {canRecord && (
                    <button className="primary-action-button" onClick={() => setShowForm(true)}>
                        + Record vitals
                    </button>
                )}
            </div>

            {locked && (
                <p className="vitals-locked">This case has been submitted, so its vitals are read-only.</p>
            )}

            {error && <p role="alert" className="vitals-error">{error}</p>}


            {vitals.length === 0 ? (
                <p className="vitals-empty">No vitals recorded.</p>
            ) : (
                // Both cards share the same columns; they scroll sideways together.
                <div className="vitals-scroll">
                    <div className="vitals-columns" style={{ "--vitals-columns": columns.length }}>
                        <VitalsTrends columns={columns} formatTime={formatDate} />

                        <div className="vitals-card">
                            <div className="vitals-card-header">
                                <h3>Flowsheet grid</h3>
                                <span>Oldest → newest · newest is highlighted</span>
                            </div>
                            <table className="vitals-table">
                            <thead>
                                <tr>
                                    <th scope="col">Measure</th>
                                    {columns.map((set, i) => (
                                        <th scope="col" key={set.id} className={i === lastIndex ? "vitals-latest" : ""}>
                                            {formatDate(set.measured_at)}
                                            {set.supersedes_id && (
                                                <span className="vitals-corrected-tag" title={`Reason: ${set.correction_reason}`}>corrected</span>
                                            )}
                                            {canRecord && (
                                                <div className="vitals-column-actions">
                                                    <button type="button" className="vitals-link-button" title="Fix a wrong value, like a typo" onClick={() => setCorrecting(set)}>
                                                        Correct
                                                    </button>
                                                    <button type="button" className="vitals-link-button" title="Remove a set that should not be in this chart, like one charted on the wrong patient" onClick={() => handleMarkError(set)}>
                                                        Error
                                                    </button>
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ROWS.map((row) => (
                                    <tr key={row.label}>
                                        <th scope="row">
                                            {row.label} <span className="vitals-unit">{row.unit}</span>
                                        </th>
                                        {columns.map((set, i) => (
                                            <Cell key={set.id} value={rowValue(row, set)} flag={rowFlag(row, set)} latest={i === lastIndex} />
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <VitalsHistory rows={history} formatTime={formatDate} />
        </section>
    );
}

// One grid cell. Flagged values get a color and a text label (never color alone).
function Cell({ value, flag, latest }) {
    const classes = [flag && `vitals-flag-${flag}`, latest && "vitals-latest"].filter(Boolean).join(" ");

    if (value === null || value === undefined || value === "") {
        return <td className={`vitals-none ${latest ? "vitals-latest" : ""}`}>—</td>;
    }
    return (
        <td className={classes}>
            {value}
            {flag && <span className="vitals-flag-label">{FLAG_LABELS[flag]}</span>}
        </td>
    );
}

function rowValue(row, set) {
    return row.value ? row.value(set) : set[row.field];
}

function rowFlag(row, set) {
    return row.flag ? row.flag(set) : getFlag(row.field, set[row.field]);
}

function formatDate(isoDate) {
    return new Date(isoDate).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function bpText(set) {
    if (set.systolic_bp === null && set.diastolic_bp === null) return null;
    return `${set.systolic_bp ?? "—"}/${set.diastolic_bp ?? "—"}`;
}
