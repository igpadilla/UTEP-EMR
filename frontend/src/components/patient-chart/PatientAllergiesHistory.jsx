import { useState } from "react";
import { saveAllergiesAndHistory } from "../../services/patientChartService.js";
import { patientList } from "./patientChartForm.js";
import ChartEntryList from "./ChartEntryList.jsx";


function SavedList({ values, emptyText }) {
    const items = patientList(values);
    return items.length ? <ul className="chart-saved-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : <p className="chart-muted">{emptyText}</p>;
}


export default function PatientAllergiesHistory({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const [form, setForm] = useState({ allergies: [], medical_history: [] });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setForm({ allergies: patientList(patient.allergies).map((value) => ({ value })),
            medical_history: patientList(patient.medical_history).map((value) => ({ value })) });
        setError("");
        onEdit();
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError("");
        try {
            const saved = await saveAllergiesAndHistory(patient, {
                allergies: form.allergies.map((entry) => entry.value).join("\n"),
                medical_history: form.medical_history.map((entry) => entry.value).join("\n"),
            });
            onSaved(saved, "Allergies and medical history saved.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return <section className="chart-card" aria-labelledby="history-edit-heading">
            <h2 id="history-edit-heading">Edit allergies and history</h2>
            <p>Add or remove items, then save your changes.</p>
            <form onSubmit={save}>
                <fieldset className="chart-form-grid" disabled={saving}>
                    <legend className="chart-sr-only">Allergies and medical history</legend>
                    <section><h3>Allergies</h3>
                        <ChartEntryList name="Allergy" entries={form.allergies} fields={[{ key: 'value', label: 'Allergy' }]}
                            addLabel="Add allergy" disabled={saving} onChange={(entries) => setForm((current) => ({ ...current, allergies: entries }))} />
                    </section>
                    <section><h3>Medical history</h3>
                        <ChartEntryList name="History item" entries={form.medical_history} fields={[{ key: 'value', label: 'History item' }]}
                            addLabel="Add history item" disabled={saving} onChange={(entries) => setForm((current) => ({ ...current, medical_history: entries }))} />
                    </section>
                </fieldset>
                {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                <div className="chart-actions">
                    <button className="primary-action-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save allergies and history"}</button>
                    <button className="secondary-action-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </section>;
    }

    return <section aria-labelledby="chart-history-heading">
        <div className="chart-section-heading">
            <h2 id="chart-history-heading">Allergies &amp; History</h2>
            {canEdit && <button type="button" className="secondary-action-button" onClick={beginEdit}>Edit allergies and history</button>}
        </div>
        <div className="chart-card-grid">
            <article className="chart-card"><h3>Allergies</h3>
                <SavedList values={patient.allergies} emptyText="No allergies recorded." />
            </article>
            <article className="chart-card"><h3>Medical history</h3>
                <SavedList values={patient.medical_history} emptyText="No medical history recorded." />
            </article>
        </div>
    </section>;
}
