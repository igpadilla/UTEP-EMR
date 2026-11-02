import { useState } from "react";
import { saveDiagnoses } from "../../services/patientChartService.js";
import Icd10Search from "./Icd10Search.jsx";

export default function PatientDiagnoses({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const [entries, setEntries] = useState(Array.isArray(patient?.diagnoses) ? patient.diagnoses : []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setEntries(Array.isArray(patient?.diagnoses) ? patient.diagnoses : []);
        setError("");
        onEdit();
    }

    function addEntry(diagnosis) {
        setEntries((current) => {
            if (current.some((entry) => entry.code === diagnosis.code)) {
                return current;
            }
            return [...current, { ...diagnosis, status: "active", onset_date: "" }];
        });
    }

    function updateEntry(index, field, value) {
        setEntries((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    }

    function removeEntry(index) {
        setEntries((current) => current.filter((_, i) => i !== index));
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError("");
        try {
            const saved = await saveDiagnoses(patient, entries);
            onSaved(saved, "Diagnoses saved.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return (
            <section className="chart-card" aria-labelledby="diagnoses-edit-heading">
                <h2 id="diagnoses-edit-heading">Edit diagnoses</h2>
                <p className="chart-muted">Students see these diagnoses when the patient is assigned to a case.</p>
                <form onSubmit={save}>
                    <Icd10Search onChange={addEntry} aria-label="Search ICD-10 diagnoses" />
                    <div className="chart-diagnoses-list">
                        {entries.map((entry, index) => (
                            <div key={index} className="chart-diagnosis-row">
                                <span className="chart-diagnosis-label"><strong>{entry.code}</strong> — {entry.description}</span>
                                <select
                                    value={entry.status || "active"}
                                    onChange={(e) => updateEntry(index, "status", e.target.value)}
                                >
                                    <option value="active">active</option>
                                    <option value="resolved">resolved</option>
                                </select>
                                <input
                                    type="date"
                                    value={entry.onset_date || ""}
                                    onChange={(e) => updateEntry(index, "onset_date", e.target.value)}
                                />
                                <button type="button" className="secondary-action-button" onClick={() => removeEntry(index)}>Remove</button>
                            </div>
                        ))}
                    </div>
                    {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                    <div className="chart-actions">
                        <button className="primary-action-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save diagnoses"}</button>
                        <button className="secondary-action-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
                    </div>
                </form>
            </section>
        );
    }

    const diagnoses = Array.isArray(patient?.diagnoses) ? patient.diagnoses : [];

    return (
        <section aria-labelledby="chart-diagnoses-heading">
            <div className="chart-section-heading">
                <div>
                    <h2 id="chart-diagnoses-heading">Diagnoses</h2>
                    <p className="chart-muted">Students see these diagnoses when the patient is assigned to a case.</p>
                </div>
                {canEdit && <button type="button" className="secondary-action-button" onClick={beginEdit}>Edit diagnoses</button>}
            </div>
            <article className="chart-card">
                {diagnoses.length > 0 ? (
                    <ul className="chart-saved-list">
                        {diagnoses.map((d, index) => (
                            <li key={index}>
                                {d.code} — {d.description} ({d.status || "active"})
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="chart-muted">No diagnoses recorded.</p>
                )}
            </article>
        </section>
    );
}

