import { useEffect, useState } from "react";
import { getPatientVisits } from "../../services/patientChartService.js";
import PatientPortalManagement from "../PatientPortalManagement.jsx";

// Visit history for a live patient, plus patient portal controls (portal accounts are admin only).
export default function PatientVisits({ patient, caseId, canEdit, canManagePortal }) {
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        setVisits([]);
        setError("");
        setLoading(true);
        if (caseId || !patient?.id) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        getPatientVisits(patient.id)
            .then((data) => { if (!cancelled) setVisits(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [patient?.id, caseId, retry]);

    if (caseId) return <p className="chart-muted">Visits are kept on the patient record, not on case copies.</p>;

    return (
        <section aria-labelledby="chart-visits-heading">
            <div className="chart-section-heading">
                <h2 id="chart-visits-heading">Visits</h2>
            </div>
            {error && <div className="form-message form-message-error" role="alert"><p>{error}</p>
                <button type="button" className="secondary-action-button" onClick={() => setRetry((value) => value + 1)}>Retry visits</button></div>}
            {loading ? <p className="chart-muted">Loading visits…</p>
                : error ? null : visits.length === 0 ? <p className="chart-muted">No visits recorded.</p>
                : <div className="chart-card-grid">
                    {visits.map((visit) => (
                        <article key={visit.id} className="chart-card">
                            <h3>{visit.visit_type ?? "Visit"} · {new Date(visit.created_at).toLocaleDateString()}</h3>
                            {visit.medications && <p><strong>Medications:</strong> {visit.medications}</p>}
                            {visit.notes && <p><strong>Notes:</strong> {visit.notes}</p>}
                        </article>
                    ))}
                </div>}
            {canEdit && !loading && !error && <PatientPortalManagement key={patient.id} patient={patient} visits={visits} canManageAccounts={canManagePortal} />}
        </section>
    );
}
