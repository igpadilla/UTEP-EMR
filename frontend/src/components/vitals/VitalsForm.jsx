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

// Words shown in the "Check before saving" list.
const CHECK_WORDS = { high: "High", low: "Low", critical: "Critical" };

// Fields grouped like the paper vitals sheet.
const GROUPS = [
    { title: "Blood pressure & pulse", fields: ["systolic_bp", "diastolic_bp", "heart_rate"] },
    { title: "Breathing & temperature", fields: ["resp_rate", "spo2", "temperature_f"], oxygen: true },
    { title: "Body measurements & pain", fields: ["weight_lb", "height_in", "pain_score"], bmi: true },
];

// `correcting` is optional: pass an existing set to correct it instead of recording a new one.
export default function VitalsForm({ owner, correcting, onSaved, onCancel }) {
    const [form, setForm] = useState(correcting ? valuesFrom(correcting) : {});
    const [measuredAt, setMeasuredAt] = useState(toLocalInput(correcting ? new Date(correcting.measured_at) : new Date()));
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    // Check every number field once; used by the inputs and the "Check before saving" panel.
    const checks = FIELDS.map(([name, label, min, max]) => {
        const value = form[name] ?? "";
        const impossible = value !== "" && (Number(value) < min || Number(value) > max);
        const flag = impossible ? "" : getFlag(name, value);
        let message = "";
        if (impossible) message = `Not a possible value (${min}-${max})`;
        else if (flag) message = FLAG_MESSAGES[flag];
        else if (value !== "") message = "Within range";
        return { name, label, min, max, value, impossible, flag, message };
    });
    const checkFor = Object.fromEntries(checks.map((c) => [c.name, c]));
    const problems = checks.filter((c) => c.impossible || c.flag);
    const hasImpossible = checks.some((c) => c.impossible);
    const bmi = calculateBmi(form.weight_lb, form.height_in);

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

        vitals.measured_at = new Date(measuredAt).toISOString();

        setSaving(true);
        try {
            if (correcting) {
                await correctVitals(correcting, vitals, reason.trim());
            } else {
                await recordVitals(owner, vitals);
            }
            onSaved();
        } catch (err) {
            console.error(err);
            setError("Could not save vitals. Check that every value is realistic.");
            setSaving(false);
        }
    }

    return (
        <form className="vitals-entry" onSubmit={handleSubmit}>
            <div className="vitals-card vitals-entry-main">
                <div className="vitals-entry-top">
                    <div>
                        <h2>{correcting ? "Correct vitals" : "Record vitals"}</h2>
                        <p className="vitals-subtitle">
                            {correcting
                                ? `Correcting the set from ${new Date(correcting.measured_at).toLocaleString()}`
                                : "Checks update as you type."}
                        </p>
                    </div>
                    <div className="vitals-field vitals-measured-at">
                        <label htmlFor="vitals-measured-at">Measured at</label>
                        <input
                            id="vitals-measured-at"
                            type="datetime-local"
                            value={measuredAt}
                            max={toLocalInput(new Date())}
                            onChange={(e) => setMeasuredAt(e.target.value)}
                            disabled={saving}
                            required
                        />
                    </div>
                </div>

                {GROUPS.map((group) => (
                    <fieldset key={group.title} className="vitals-group">
                        <legend>{group.title}</legend>

                        {group.fields.map((name) => {
                            const check = checkFor[name];
                            const state = check.impossible ? "impossible" : check.flag;
                            return (
                                <div key={name} className="vitals-field">
                                    <label htmlFor={`vitals-${name}`}>{check.label}</label>
                                    <input
                                        id={`vitals-${name}`}
                                        name={name}
                                        type="number"
                                        step="any"
                                        min={check.min}
                                        max={check.max}
                                        value={check.value}
                                        onChange={handleChange}
                                        disabled={saving}
                                        className={state ? `vitals-input-${state}` : ""}
                                        aria-describedby={`vitals-${name}-message`}
                                    />
                                    <span id={`vitals-${name}-message`} className={`vitals-message ${state ? `vitals-message-${state}` : ""}`} aria-live="polite">
                                        {check.message}
                                    </span>
                                </div>
                            );
                        })}

                        {group.oxygen && (
                            <div className="vitals-field">
                                <label htmlFor="vitals-oxygen">Oxygen</label>
                                <select id="vitals-oxygen" name="oxygen" value={form.oxygen ?? ""} onChange={handleChange} disabled={saving}>
                                    <option value="">Not recorded</option>
                                    <option>Room air</option>
                                    <option>Nasal cannula</option>
                                    <option>Face mask</option>
                                </select>
                            </div>
                        )}

                        {group.bmi && (
                            <div className="vitals-field">
                                <span className="vitals-field-label">BMI (calculated)</span>
                                <span className="vitals-bmi">{bmi ?? "—"} <small>kg/m²</small></span>
                                <span className={`vitals-message ${getFlag("bmi", bmi) ? "vitals-message-high" : ""}`}>
                                    {bmi === null ? "Needs weight and height" : getFlag("bmi", bmi) ? "Outside 18.5-24.9" : "Within range"}
                                </span>
                            </div>
                        )}
                    </fieldset>
                ))}

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
            </div>

            <aside className="vitals-card vitals-entry-check" aria-labelledby="vitals-check-title">
                <h3 id="vitals-check-title">Check before saving</h3>

                {hasImpossible && (
                    <p role="alert" className="vitals-impossible-alert">Some values are not physically possible. Fix them to save.</p>
                )}

                {problems.length > 0 ? (
                    <ul className="vitals-check-list">
                        {problems.map((c) => (
                            <li key={c.name}>
                                <span>{c.label}: {c.value}</span>
                                <span className={`vitals-message-${c.impossible ? "impossible" : c.flag}`}>
                                    {c.impossible ? "Fix" : CHECK_WORDS[c.flag]}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="vitals-subtitle">No flagged values.</p>
                )}

                <p className="vitals-check-note">
                    Saves as a new set. Once saved it can be corrected with a reason, never edited or deleted.
                </p>

                {error && <p role="alert" className="vitals-error">{error}</p>}

                <div className="vitals-actions">
                    <button type="button" className="secondary-action-button" onClick={onCancel} disabled={saving}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-action-button" disabled={saving || hasImpossible}>
                        {saving ? "Saving..." : correcting ? "Save correction" : "Save vitals"}
                    </button>
                </div>
            </aside>
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

// BMI from pounds and inches, or null if either is missing.
function calculateBmi(weightLb, heightIn) {
    if (!weightLb || !heightIn) return null;
    return Math.round((703 * weightLb / (heightIn * heightIn)) * 10) / 10;
}

// A Date as "YYYY-MM-DDTHH:MM" in local time, the format datetime-local inputs use.
function toLocalInput(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}
