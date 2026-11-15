import { useState } from "react";
import MedicationSelector from "../MedicationSelector.jsx";
import { saveMedications } from "../../services/patientChartService.js";


export default function PatientMedications({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const [medications, setMedications] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setMedications(Array.isArray(patient.current_medications) ? patient.current_medications : []);
        setError("");
        onEdit();
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError("");
        try {
            const saved = await saveMedications(patient, medications);
            onSaved(saved, "Medications saved.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return (
            <section className="chart-card" aria-labelledby="medications-edit-heading">
                <h2 id="medications-edit-heading">Edit medications</h2>
                <form onSubmit={save}>
                    <fieldset disabled={saving}>
                        <legend className="chart-sr-only">Current medications</legend>
                        <MedicationSelector value={medications} onChange={setMedications} />
                    </fieldset>
                    {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                    <div className="chart-actions">
                        <button className="primary-action-button" type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save medications"}
                        </button>
                        <button className="secondary-action-button" type="button" disabled={saving} onClick={onCancel}>
                            Cancel
                        </button>
                    </div>
                </form>
            </section>
        );
    }

    const current = Array.isArray(patient.current_medications) ? patient.current_medications : [];

    return (
        <section aria-labelledby="chart-medications-heading">
            <div className="chart-section-heading">
                <h2 id="chart-medications-heading">Medications</h2>
                {canEdit && (
                    <button type="button" className="secondary-action-button" onClick={beginEdit}>
                        Edit medications
                    </button>
                )}
            </div>
            <div className="chart-card">
                {current.length ? (
                    <ul className="chart-saved-list">
                        {current.map((entry) => (
                            <li key={entry.medicine.id}>
                                <strong>{entry.medicine.name}</strong>
                                {" — "}{entry.dosage} {entry.medicine.unit}, {entry.frequency}x/day
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="chart-muted">No medications recorded.</p>
                )}
            </div>
        </section>
    );
}
