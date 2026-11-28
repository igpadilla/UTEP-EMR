import { useState } from "react";
import { medicationName } from "./medicationDisplay.js";
import { notifyPatientPrescription } from "../services/patientPortalService.js";

export default function PrescriptionAlertForm({ patient }) {
    const names = [...new Set((Array.isArray(patient.current_medications) ? patient.current_medications : [])
        .filter(Boolean).map(medicationName).filter((name) => name !== "Medication name not recorded"))];
    const [medication, setMedication] = useState("");
    const [pharmacy, setPharmacy] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    async function submit(event) {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError(""); setNotice("");
        try {
            await notifyPatientPrescription(patient.id, medication, pharmacy);
            setNotice("Prescription alert sent to the patient portal.");
            setMedication(""); setPharmacy("");
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }
    return <section className="chart-card portal-prescription-form" aria-label="Send a prescription alert">
        <h3>Prescription alert</h3>
        <p>Record a prescription sent to a demo pharmacy. This only adds an alert in the patient portal.</p>
        {!names.length ? <p>Save a medication before sending an alert.</p> : <form onSubmit={submit}>
            <label htmlFor="prescription-alert-medication">Saved medication</label>
            <select id="prescription-alert-medication" required disabled={busy} value={medication} onChange={(event) => setMedication(event.target.value)}>
                <option value="">Choose a medication</option>
                {names.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <label htmlFor="prescription-alert-pharmacy">Demo pharmacy</label>
            <input id="prescription-alert-pharmacy" required maxLength={200} disabled={busy} value={pharmacy} onChange={(event) => setPharmacy(event.target.value)} />
            <button type="submit" className="secondary-action-button" disabled={busy || !medication || !pharmacy.trim()}>{busy ? "Sending…" : "Send prescription alert"}</button>
        </form>}
        {error && <p className="form-message form-message-error" role="alert">{error}</p>}
        {notice && <p className="form-message" role="status">{notice}</p>}
    </section>;
}
