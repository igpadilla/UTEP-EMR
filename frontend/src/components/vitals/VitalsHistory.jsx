// Values shown in the history list: [label, how to show it from a set]
const SUMMARY_FIELDS = [
    ["BP", (set) => (set.systolic_bp === null ? null : `${set.systolic_bp}/${set.diastolic_bp ?? "—"}`)],
    ["HR", (set) => set.heart_rate],
    ["RR", (set) => set.resp_rate],
    ["Temp", (set) => (set.temperature_f === null ? null : `${set.temperature_f}°F`)],
    ["SpO₂", (set) => (set.spo2 === null ? null : `${set.spo2}%`)],
    ["O₂", (set) => set.oxygen],
    ["Weight", (set) => (set.weight_lb === null ? null : `${set.weight_lb} lb`)],
    ["Height", (set) => (set.height_in === null ? null : `${set.height_in} in`)],
    ["Pain", (set) => (set.pain_score === null ? null : `${set.pain_score}/10`)],
];

// Corrections and entered-in-error sets, newest first. `rows` is every set (getVitalsHistory).
export default function VitalsHistory({ rows, formatTime }) {
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    const events = [];
    for (const row of rows) {
        if (row.supersedes_id && byId[row.supersedes_id]) {
            events.push({ key: `c-${row.id}`, type: "Correction", set: row, text: changes(byId[row.supersedes_id], row), reason: row.correction_reason });
        }
        if (row.status === "entered_in_error") {
            events.push({ key: `e-${row.id}`, type: "Entered in error", set: row, text: `Removed: ${summarize(row)}`, reason: row.correction_reason });
        }
    }

    return (
        <div className="vitals-card vitals-history">
            <div className="vitals-card-header">
                <h3>Corrections &amp; entered in error</h3>
                <span>Nothing is deleted. The original values are kept with the reason.</span>
            </div>

            {events.length === 0 ? (
                <p className="vitals-empty vitals-history-empty">No corrections or entered-in-error sets.</p>
            ) : (
                events.map((event) => (
                    <div key={event.key} className="vitals-history-item">
                        <div>
                            <strong>{event.type}</strong> · set from {formatTime(event.set.measured_at)}
                            <div>{event.text}</div>
                            <div className="vitals-history-reason">Reason: {event.reason}</div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

// "BP 120/80, HR 72, ..." — only the values that were taken.
function summarize(set) {
    return SUMMARY_FIELDS.map(([label, show]) => (show(set) === null || show(set) === undefined ? null : `${label} ${show(set)}`))
        .filter(Boolean)
        .join(", ");
}

// "BP 148/92 → 138/88" — only the values that changed.
function changes(oldSet, newSet) {
    const changed = SUMMARY_FIELDS.map(([label, show]) => {
        const before = show(oldSet) ?? "—";
        const after = show(newSet) ?? "—";
        return before === after ? null : `${label} ${before} → ${after}`;
    }).filter(Boolean);

    return changed.length > 0 ? changed.join(", ") : "No values changed";
}
