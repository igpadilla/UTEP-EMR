import { useEffect, useRef, useState } from "react";
import { saveImmunizations } from "../../services/patientChartService.js";

const EMPTY_ENTRY = { vaccine: "", date: "", dose: "", notes: "" };

export default function PatientImmunizations({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const immunizations = Array.isArray(patient?.immunizations) ? patient.immunizations : [];
    const [entries, setEntries] = useState(immunizations);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const errorTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        };
    }, []);

    function triggerError(message) {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        setError(message);
        if (message) {
            errorTimerRef.current = setTimeout(() => {
                setError("");
                errorTimerRef.current = null;
            }, 4000);
        }
    }

    function beginEdit() {
        setEntries(immunizations);
        if (errorTimerRef.current) {
            clearTimeout(errorTimerRef.current);
            errorTimerRef.current = null;
        }
        setError("");
        onEdit();
    }

    function updateEntry(index, field, value) {
        setEntries((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;

        const hasInvalidEntry = entries.some(
            (entry) => !entry.vaccine.trim() && (entry.date || entry.dose.trim() || entry.notes.trim())
        );
        if (hasInvalidEntry) {
            triggerError("Vaccine name is required for each immunization entry.");
            return;
        }

        const validEntries = entries
            .map((entry) => ({
                vaccine: entry.vaccine.trim(),
                date: entry.date || "",
                dose: entry.dose.trim(),
                notes: entry.notes.trim(),
            }))
            .filter((entry) => entry.vaccine);

        setSaving(true);
        if (errorTimerRef.current) {
            clearTimeout(errorTimerRef.current);
            errorTimerRef.current = null;
        }
        setError("");
        try {
            const saved = await saveImmunizations(patient, validEntries);
            onSaved(saved, "Immunizations saved.");
        } catch (saveError) {
            triggerError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return (
            <section className="chart-card" aria-labelledby="immunizations-edit-heading">
                <h2 id="immunizations-edit-heading">Edit immunizations</h2>
                <form onSubmit={save}>
                    {entries.map((entry, index) => (
                        <div key={index} className="chart-diagnosis-row">
                            <input aria-label="Vaccine" placeholder="Vaccine" value={entry.vaccine}
                                onChange={(e) => updateEntry(index, "vaccine", e.target.value)} />
                            <input aria-label="Date given" type="date" value={entry.date}
                                onChange={(e) => updateEntry(index, "date", e.target.value)} />
                            <input aria-label="Dose" placeholder="Dose" value={entry.dose}
                                onChange={(e) => updateEntry(index, "dose", e.target.value)} />
                            <input aria-label="Notes" placeholder="Notes" value={entry.notes}
                                onChange={(e) => updateEntry(index, "notes", e.target.value)} />
                            <button type="button" className="secondary-action-button"
                                onClick={() => setEntries((current) => current.filter((_, i) => i !== index))}>Remove</button>
                        </div>
                    ))}
                    <button type="button" className="secondary-action-button"
                        onClick={() => setEntries((current) => [...current, EMPTY_ENTRY])}>Add immunization</button>
                    {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                    <div className="chart-actions">
                        <button className="primary-action-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save immunizations"}</button>
                        <button className="secondary-action-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
                    </div>
                </form>
            </section>
        );
    }

    return (
        <article className="chart-card">
            <div className="chart-section-heading">
                <h3>Immunizations</h3>
                {canEdit && <button type="button" className="secondary-action-button" onClick={beginEdit}>Edit immunizations</button>}
            </div>
            {immunizations.length > 0 ? (
                <ul className="chart-saved-list">
                    {immunizations.map((item, index) => (
                        <li key={index}>
                            {item.vaccine}{item.date && ` — ${item.date}`}{item.dose && ` · ${item.dose}`}{item.notes && ` (${item.notes})`}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="chart-muted">No immunizations recorded.</p>
            )}
        </article>
    );
}
