import { useState } from "react";
import { saveAllergiesAndHistory } from "../../services/patientChartService.js";
import { historyToForm, patientList } from "./patientChartForm.js";


function SavedList({ values, emptyText }) {
    const items = patientList(values);
    return items.length ? <ul className="chart-saved-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : <p className="chart-muted">{emptyText}</p>;
}


export default function PatientAllergiesHistory({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const [form, setForm] = useState({ allergies: "", medical_history: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setForm(historyToForm(patient));
        setError("");
        onEdit();
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError("");
        try {
            const saved = await saveAllergiesAndHistory(patient, form);
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
            <p id="chart-list-help">Write one item per line. Leave a list blank to clear its recorded items.</p>
            <form onSubmit={save}>
                <fieldset className="chart-form-grid" disabled={saving}>
                    <legend className="chart-sr-only">Allergies and medical history</legend>
                    <div className="chart-field">
                        <label htmlFor="chart-allergies-input">Allergies</label>
                        <textarea id="chart-allergies-input" rows={7} value={form.allergies} aria-describedby="chart-list-help"
                            onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))} />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-history-input">Medical history</label>
                        <textarea id="chart-history-input" rows={7} value={form.medical_history} aria-describedby="chart-list-help"
                            onChange={(event) => setForm((current) => ({ ...current, medical_history: event.target.value }))} />
                    </div>
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
