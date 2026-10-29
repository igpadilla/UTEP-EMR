import { useState } from "react";
import { saveDemographics } from "../../services/patientChartService.js";
import { demographicsToForm, localToday } from "./patientChartForm.js";


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
            <h2 id="demographics-edit-heading" style={{ fontSize: "1.15rem", margin: "0 0 0.25rem" }}>Edit demographics</h2>
            <form onSubmit={save}>
                <fieldset className="chart-form-grid chart-demographics-grid" disabled={saving}>
                    <legend className="chart-sr-only">Patient demographics</legend>
                    <div className="chart-field">
                        <label htmlFor="chart-first_name">First name *</label>
                        <input id="chart-first_name" name="first_name" type="text"
                            value={form.first_name ?? ""} onChange={changeField} required />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-last_name">Last name *</label>
                        <input id="chart-last_name" name="last_name" type="text"
                            value={form.last_name ?? ""} onChange={changeField} required />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-sex">Sex</label>
                        <select id="chart-sex" name="sex" value={form.sex ?? ""} onChange={changeField}>
                            <option value="">Not recorded</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            {form.sex && !["Male", "Female"].includes(form.sex) && <option value={form.sex}>{form.sex}</option>}
                        </select>
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-age">Age *</label>
                        <input id="chart-age" name="age" type="number" min={0} max={150} step={1}
                            value={form.age ?? ""} onChange={changeField} required />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-date_of_birth">Date of birth</label>
                        <input id="chart-date_of_birth" name="date_of_birth" type="date" max={localToday()}
                            value={form.date_of_birth ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-occupation">Occupation</label>
                        <input id="chart-occupation" name="occupation" type="text"
                            value={form.occupation ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-phone_number">Phone</label>
                        <input id="chart-phone_number" name="phone_number" type="tel"
                            value={form.phone_number ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field">
                        <label htmlFor="chart-email">Email</label>
                        <input id="chart-email" name="email" type="email"
                            value={form.email ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field chart-field-half">
                        <label htmlFor="chart-contact_name">Primary emergency contact name</label>
                        <input id="chart-contact_name" name="contact_name" type="text"
                            value={form.contact_name ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field chart-field-half">
                        <label htmlFor="chart-contact_phone">Primary emergency contact phone</label>
                        <input id="chart-contact_phone" name="contact_phone" type="tel"
                            value={form.contact_phone ?? ""} onChange={changeField} />
                    </div>
                    <div className="chart-field chart-field-wide">
                        <label htmlFor="chart-address">Address</label>
                        <textarea id="chart-address" name="address" rows={2} value={form.address ?? ""} onChange={changeField} />
                    </div>
                </fieldset>
                {error && <p className="form-message form-message-error" role="alert">{error}</p>}
                <div className="chart-actions" style={{ marginTop: "0.75rem" }}>
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
