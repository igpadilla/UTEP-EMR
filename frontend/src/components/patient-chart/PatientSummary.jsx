import { useState } from "react";
import { saveDemographics } from "../../services/patientChartService.js";
import { demographicsToForm, localToday } from "./patientChartForm.js";

const FIELDS = [
    { key: "first_name", label: "First name", required: true },
    { key: "last_name", label: "Last name", required: true },
    { key: "age", label: "Age", type: "number", required: true },
    { key: "date_of_birth", label: "Date of birth", type: "date" },
    { key: "occupation", label: "Occupation" },
    { key: "phone_number", label: "Phone", type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact_name", label: "Primary emergency contact name" },
    { key: "contact_phone", label: "Primary emergency contact phone", type: "tel" },
];


function Detail({ label, value }) {
    return <div><dt>{label}</dt><dd>{value == null || value === "" ? "Not recorded" : value}</dd></div>;
}


export default function PatientSummary({ patient, canEdit, editing, onEdit, onCancel, onSaved }) {
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function beginEdit() {
        setForm(demographicsToForm(patient));
        setError("");
        onEdit();
    }

    function changeField(event) {
        setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    }

    async function save(event) {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError("");
        try {
            const saved = await saveDemographics(patient, form);
            onSaved(saved, "Patient demographics saved.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    }

    if (editing && canEdit) {
        return <section className="chart-card" aria-labelledby="demographics-edit-heading">
            <h2 id="demographics-edit-heading">Edit demographics</h2>
            <p>Change the patient details below. Other chart sections will stay the same.</p>
            <form onSubmit={save}>
                <fieldset className="chart-form-grid" disabled={saving}>
                    <legend className="chart-sr-only">Patient demographics</legend>
                    {FIELDS.map((field) => <div className="chart-field" key={field.key}>
                        <label htmlFor={`chart-${field.key}`}>{field.label}{field.required ? " *" : ""}</label>
                        <input id={`chart-${field.key}`} name={field.key} type={field.type || "text"}
                            value={form[field.key] ?? ""} onChange={changeField} required={field.required}
                            min={field.type === "number" ? 0 : undefined}
                            max={field.type === "number" ? 150 : field.type === "date" ? localToday() : undefined}
                            step={field.type === "number" ? 1 : undefined} />
                    </div>)}
                    <div className="chart-field">
                        <label htmlFor="chart-sex">Sex</label>
                        <select id="chart-sex" name="sex" value={form.sex} onChange={changeField}>
                            <option value="">Not recorded</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            {form.sex && !["Male", "Female"].includes(form.sex) && <option value={form.sex}>{form.sex}</option>}
                        </select>
                    </div>
                    <div className="chart-field chart-field-wide">
                        <label htmlFor="chart-address">Address</label>
                        <textarea id="chart-address" name="address" rows={3} value={form.address} onChange={changeField} />
                    </div>
                </fieldset>
                {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                <div className="chart-actions">
                    <button className="primary-action-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save demographics"}</button>
                    <button className="secondary-action-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </section>;
    }

    const contacts = Array.isArray(patient.emergency_contacts) ? patient.emergency_contacts.filter(Boolean) : [];
    return <section aria-labelledby="chart-summary-heading">
        <div className="chart-section-heading">
            <h2 id="chart-summary-heading">Patient summary</h2>
            {canEdit && <button type="button" className="secondary-action-button" onClick={beginEdit}>Edit demographics</button>}
        </div>
        <div className="chart-card-grid chart-summary-grid">
            <article className="chart-card">
                <h3>Demographics</h3>
                <dl className="chart-details">
                    <Detail label="First name" value={patient.first_name} />
                    <Detail label="Last name" value={patient.last_name} />
                    <Detail label="Age" value={patient.age} />
                    <Detail label="Date of birth" value={patient.date_of_birth} />
                    <Detail label="Sex" value={patient.sex} />
                    <Detail label="Occupation" value={patient.occupation} />
                </dl>
            </article>
            <article className="chart-card">
                <h3>Contact details</h3>
                <dl className="chart-details">
                    <Detail label="Phone" value={patient.phone_number} />
                    <Detail label="Email" value={patient.email} />
                    <Detail label="Address" value={patient.address} />
                </dl>
            </article>
            <article className="chart-card">
                <h3>Emergency contacts</h3>
                {contacts.length ? contacts.map((contact, index) => <dl className="chart-details chart-contact" key={index}>
                    <Detail label={index === 0 ? "Primary contact" : `Contact ${index + 1}`} value={contact.name} />
                    <Detail label="Phone" value={contact.phone} />
                </dl>) : <p className="chart-muted">No emergency contacts recorded.</p>}
            </article>
        </div>
    </section>;
}
