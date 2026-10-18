import { useState } from "react";
import { recordVitals } from "../../services/vitalsService.js";
import { getFlag } from "./vitalRanges.js";

// Number inputs in the form: [database column, label]
const FIELDS = [
    ["systolic_bp", "Systolic BP (mmHg)"],
    ["diastolic_bp", "Diastolic BP (mmHg)"],
    ["heart_rate", "Heart rate (bpm)"],
    ["resp_rate", "Resp. rate (/min)"],
    ["temperature_f", "Temperature (°F)"],
    ["spo2", "SpO₂ (%)"],
    ["weight_lb", "Weight (lb)"],
    ["height_in", "Height (in)"],
    ["pain_score", "Pain (0-10)"],
];

const FLAG_MESSAGES = {
    high: "High - confirm value",
    low: "Low - confirm value",
    critical: "Critical - re-check, then notify",
};

export default function VitalsForm({ patientId, onSaved, onCancel }) {
    const [form, setForm] = useState({});
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

        setSaving(true);
        try {
            await recordVitals(patientId, vitals);
            onSaved();
        } catch (err) {
            console.error(err);
            setError("Could not save vitals. Check that every value is realistic.");
            setSaving(false);
        }
    }

    return (
        <form className="vitals-form" onSubmit={handleSubmit}>
            <div className="vitals-form-grid">
                {FIELDS.map(([name, label]) => {
                    const flag = getFlag(name, form[name]);
                    return (
                        <div key={name} className="vitals-field">
                            <label htmlFor={`vitals-${name}`}>{label}</label>
                            <input
                                id={`vitals-${name}`}
                                name={name}
                                type="number"
                                step="any"
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

            {error && <p role="alert" className="vitals-error">{error}</p>}

            <div className="vitals-actions">
                <button type="button" className="secondary-action-button" onClick={onCancel} disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="primary-action-button" disabled={saving}>
                    {saving ? "Saving..." : "Save vitals"}
                </button>
            </div>
        </form>
    );
}
