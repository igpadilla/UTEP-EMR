import { useState } from "react";
import { saveImmunizations } from "../../services/patientChartService.js";
import ChartEntryList from "./ChartEntryList.jsx";

const FIELDS = [{ key: 'vaccine', label: 'Vaccine' }, { key: 'date', label: 'Date given', type: 'date' },
    { key: 'dose', label: 'Dose' }, { key: 'notes', label: 'Notes' }];

export default function PatientImmunizations({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const immunizations = Array.isArray(patient?.immunizations) ? patient.immunizations : [];
    const [entries, setEntries] = useState(immunizations);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setEntries(immunizations);
        setError("");
        onEdit();
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;

        const hasInvalidEntry = entries.some(
            (entry) => !(entry?.vaccine ?? "").trim() && (entry?.date || (entry?.dose ?? "").trim() || (entry?.notes ?? "").trim())
        );
        if (hasInvalidEntry) {
            setError("Vaccine name is required for each immunization entry.");
            return;
        }

        const validEntries = entries
            .map((entry) => ({
                vaccine: (entry?.vaccine ?? "").trim(),
                date: entry?.date || "",
                dose: (entry?.dose ?? "").trim(),
                notes: (entry?.notes ?? "").trim(),
            }))
            .filter((entry) => entry.vaccine);

        setSaving(true);
        setError("");
        try {
            const saved = await saveImmunizations(patient, validEntries);
            onSaved(saved, "Immunizations saved.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return (
            <section className="chart-card" aria-labelledby="immunizations-edit-heading">
                <h2 id="immunizations-edit-heading">Edit immunizations</h2>
                <p>Add or remove items, then save your changes.</p>
                <form onSubmit={save}>
                    <ChartEntryList name="Immunization" entries={entries} fields={FIELDS} onChange={setEntries}
                        addLabel="Add immunization" disabled={saving} />
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
