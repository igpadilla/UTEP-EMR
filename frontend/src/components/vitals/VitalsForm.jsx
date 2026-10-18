import { useState } from "react";
import { recordVitals, correctVitals } from "../../services/vitalsService.js";
import { getFlag } from "./vitalRanges.js";

// Number inputs in the form: [database column, label, min, max]
// min/max match the database limits, so the browser stops impossible values first.
const FIELDS = [
    ["systolic_bp", "Systolic BP (mmHg)", 40, 300],
    ["diastolic_bp", "Diastolic BP (mmHg)", 20, 200],
    ["heart_rate", "Heart rate (bpm)", 20, 300],
    ["resp_rate", "Resp. rate (/min)", 4, 80],
    ["temperature_f", "Temperature (°F)", 86, 113],
    ["spo2", "SpO₂ (%)", 50, 100],
    ["weight_lb", "Weight (lb)", 1, 1100],
    ["height_in", "Height (in)", 8, 102],
    ["pain_score", "Pain (0-10)", 0, 10],
];

const FLAG_MESSAGES = {
    high: "High - confirm value",
    low: "Low - confirm value",
    critical: "Critical - re-check, then notify",
};

// `correcting` is optional: pass an existing set to correct it instead of recording a new one.
export default function VitalsForm({ patientId, correcting, onSaved, onCancel }) {
    const [form, setForm] = useState(correcting ? valuesFrom(correcting) : {});
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        // Only send the fields that were filled in.
        const vitals = {};
        for (const [name, value] of Object.entries(form)) {
            if (value !== "") vitals[name] = value;
        }

        if (Object.keys(vitals).length === 0) {
            setError("Enter at least one value.");
            return;
        }

        if (correcting && !reason.trim()) {
            setError("Enter a reason for the correction.");
            return;
        }

        setSaving(true);
        try {
            if (correcting) {
                await correctVitals(correcting, vitals, reason.trim());
            } else {
                await recordVitals(patientId, vitals);
            }
            onSaved();
        } catch (err) {
            console.error(err);
            setError("Could not save vitals. Check that every value is realistic.");
            setSaving(false);
        }
    }

    return (
        <form className="vitals-form" onSubmit={handleSubmit}>
            {correcting && (
                <p className="vitals-form-title">
                    Correcting the set from {new Date(correcting.measured_at).toLocaleString()}
                </p>
            )}

            <div className="vitals-form-grid">
                {FIELDS.map(([name, label, min, max]) => {
                    const flag = getFlag(name, form[name]);
                    return (
                        <div key={name} className="vitals-field">
                            <label htmlFor={`vitals-${name}`}>{label}</label>
                            <input
                                id={`vitals-${name}`}
                                name={name}
                                type="number"
                                step="any"
                                min={min}
                                max={max}
                                value={form[name] ?? ""}
                                onChange={handleChange}
                                disabled={saving}
                                className={flag ? `vitals-input-${flag}` : ""}
                            />
                            {flag && <span className={`vitals-message-${flag}`}>{FLAG_MESSAGES[flag]}</span>}
                        </div>
                    );
                })}

                <div className="vitals-field">
                    <label htmlFor="vitals-oxygen">Oxygen</label>
                    <select id="vitals-oxygen" name="oxygen" value={form.oxygen ?? ""} onChange={handleChange} disabled={saving}>
                        <option value="">Not recorded</option>
                        <option>Room air</option>
                        <option>Nasal cannula</option>
                        <option>Face mask</option>
                    </select>
                </div>
            </div>

            <div className="vitals-field">
                <label htmlFor="vitals-comment">Comment (optional)</label>
                <textarea id="vitals-comment" name="comment" rows={2} value={form.comment ?? ""} onChange={handleChange} disabled={saving} />
            </div>

            {correcting && (
                <div className="vitals-field">
                    <label htmlFor="vitals-reason">Reason for correction (required)</label>
                    <input id="vitals-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} />
                </div>
            )}

            {error && <p role="alert" className="vitals-error">{error}</p>}

            <div className="vitals-actions">
                <button type="button" className="secondary-action-button" onClick={onCancel} disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="primary-action-button" disabled={saving}>
                    {saving ? "Saving..." : correcting ? "Save correction" : "Save vitals"}
                </button>
            </div>
        </form>
    );
}

// Copy an existing set's values into the form (used for corrections).
function valuesFrom(set) {
    const values = {};
    for (const [name] of FIELDS) values[name] = set[name] ?? "";
    values.oxygen = set.oxygen ?? "";
    values.comment = set.comment ?? "";
    return values;
}
