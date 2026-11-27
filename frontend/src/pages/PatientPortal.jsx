import { useEffect, useState } from "react";
import { loadMyPatientPortal } from "../services/patientPortalService.js";
import { logout } from "../services/auth.js";
import "./PatientPortal.css";
import PrescriptionAlerts from "../components/PrescriptionAlerts.jsx";

const PAGES = ["My Health", "Medications & Prescriptions", "Lab Results", "Visits", "My Profile"];
const FLAG_LABELS = { normal: "Normal", low: "Low", high: "High", abnormal: "Abnormal", critical: "Critical", critical_low: "Critical low", critical_high: "Critical high" };

export function portalDate(value) {
    if (!value) return "Not recorded";
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function MedicationList({ medications }) {
    if (!medications.length) return <p className="portal-empty">No medications yet</p>;
    return <>
        {medications.map((med, index) => <article className="portal-record" key={index}>
            <div className="portal-record-heading"><h3>{med.name || "Medication name not recorded"}</h3>
                {med.status && <span className="portal-badge">{med.status}</span>}</div>
            <dl className="portal-details">
                <div><dt>Dosage</dt><dd>{[med.dosage, med.unit].filter((value) => value != null && value !== "").join(" ") || "Not recorded"}</dd></div>
                <div><dt>Instructions</dt><dd>{med.instructions
                    || (med.frequency != null ? (/^\d+(\.\d+)?$/.test(String(med.frequency)) ? `${med.frequency} times per day` : med.frequency) : "Not recorded")}</dd></div>
                <div><dt>Doctor</dt><dd>{med.prescriber || "Not recorded"}</dd></div>
            </dl>
        </article>)}
    </>;
}

function LabResults({ labs }) {
    if (!labs.length) return <p className="portal-empty">No lab results yet</p>;
    return labs.map((lab) => <article className="portal-record" key={lab.id}>
        <div className="portal-record-heading"><h3>{lab.test_name}</h3>
            <span>{portalDate(lab.resulted_at || lab.collected_at)}</span></div>
        {lab.overall_flag && <p className="portal-result-flag">Reported flag: {FLAG_LABELS[lab.overall_flag] || lab.overall_flag}</p>}
        {Array.isArray(lab.values) && lab.values.length > 0 ? <div className="portal-table-wrapper">
            <table className="portal-results-table">
                <caption className="portal-sr-only">{lab.test_name} results</caption>
                <thead><tr><th>Test</th><th>Result</th><th>Reference range</th><th>Reported flag</th></tr></thead>
                <tbody>{lab.values.map((value, index) => <tr key={`${value.code}-${index}`}>
                    <th scope="row">{value.name || value.code || "Test"}</th>
                    <td>{[value.value, value.unit].filter((part) => part != null && part !== "").join(" ") || "Not recorded"}</td>
                    <td>{value.reference_range || "Not recorded"}</td>
                    <td>{FLAG_LABELS[value.flag] || value.flag || "Not recorded"}</td>
                </tr>)}</tbody>
            </table>
        </div> : lab.result_value != null && <dl className="portal-details">
            <div><dt>Result</dt><dd>{[lab.result_value, lab.unit].filter((part) => part != null && part !== "").join(" ")}</dd></div>
            <div><dt>Reference range</dt><dd>{lab.reference_range || "Not recorded"}</dd></div>
        </dl>}
        {lab.result_note && <p className="portal-text">{lab.result_note}</p>}
    </article>);
}

export default function PatientPortal({ user, accountWarning, idleWarning }) {
    const [page, setPage] = useState(PAGES[0]);
    const [records, setRecords] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        // Clear old records first, including when a different patient signs in
        setRecords(null);
        loadMyPatientPortal().then((data) => { if (!cancelled) setRecords(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user.id, reload]);

    async function signOut() {
        setSigningOut(true);
        try { await logout(); }
        catch { setError("Unable to sign out. Please try again."); }
        finally { setSigningOut(false); }
    }

    const patient = records?.patient;
    const firstName = patient?.first_name || user.profile.first_name || "there";
    const name = [patient?.first_name || user.profile.first_name, patient?.last_name || user.profile.last_name].filter(Boolean).join(" ") || "Patient";
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const medications = Array.isArray(records?.medications) ? records.medications : [];
    const labs = Array.isArray(records?.labs) ? records.labs : [];
    const visits = Array.isArray(records?.visits) ? records.visits : records?.last_visit ? [records.last_visit] : [];
    const list = (name) => Array.isArray(records?.[name]) ? records[name] : [];
    const lastVisit = visits[0] || records?.last_visit;

    return <div className="patient-portal">
        <header className="portal-header">
            <div className="portal-brand"><span aria-hidden="true">EMR</span><div><strong>UTEP EMR</strong><span>Patient Portal</span></div></div>
            <div className="portal-account"><span className="portal-avatar" aria-hidden="true">{initials}</span>
                <div><strong>{name}</strong><span>Patient</span></div>
                <button type="button" className="secondary-action-button" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button></div>
        </header>

        <div className="portal-layout">
            <aside className="portal-sidebar"><p className="portal-sidebar-label">Navigation</p><nav aria-label="Patient portal">
                {PAGES.map((item) => <button key={item} type="button" aria-current={page === item ? "page" : undefined}
                    className={page === item ? "portal-nav-active" : ""} onClick={() => setPage(item)}>{item}</button>)}
            </nav></aside>

            <main className="portal-main" id="portal-content">
                <div className="portal-page-heading"><div><p className="portal-eyebrow">Patient records</p><h1>{page === "My Health" ? `${greeting}, ${firstName}` : page}</h1>
                    <p>View health records shared by your care team.</p></div>
                    <button type="button" className="secondary-action-button" disabled={loading} onClick={() => setReload((value) => value + 1)}>Refresh records</button></div>
                {accountWarning && <p className="form-message" role="status">{accountWarning}</p>}
                {error && <div className="form-message form-message-error" role="alert">{error}
                    <button type="button" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
                {loading && <p role="status">Loading your records…</p>}
                {!loading && records && <>
                    {page === "My Health" && <>
                        <div className="portal-stats">
                            <button onClick={() => setPage(PAGES[1])}><span>Medications</span><strong>{medications.length}</strong><span>View medications →</span></button>
                            <button onClick={() => setPage(PAGES[2])}><span>Lab results</span><strong>{labs.length}</strong><span>View results →</span></button>
                            <button onClick={() => setPage(PAGES[3])}><span>Last visit</span><strong className="portal-stat-date">{lastVisit ? portalDate(lastVisit.date) : "Not available"}</strong><span>View visits →</span></button>
                        </div>
                        <PrescriptionAlerts key={user.id} userId={user.id} refresh={reload} />
                        <section className="portal-card"><h2>Medications & prescriptions</h2><MedicationList medications={medications} /></section>
                        <div className="portal-health-history">
                            {['allergies', 'medical_history'].map((key) => <section className="portal-card" key={key}>
                                <h2>{key === 'allergies' ? 'Allergies' : 'Medical history'}</h2>
                                {list(key).length ? <ul>{list(key).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="portal-empty">None recorded.</p>}
                            </section>)}
                            <section className="portal-card"><h2>Diagnoses</h2>
                                {list('diagnoses').length ? <ul>{list('diagnoses').map((item, index) => <li key={index}>{[item.code, item.description, item.status].filter(Boolean).join(' · ')}</li>)}</ul> : <p className="portal-empty">None recorded.</p>}
                            </section>
                            <section className="portal-card"><h2>Immunizations</h2>
                                {list('immunizations').length ? <ul>{list('immunizations').map((item, index) => <li key={index}>{[item.vaccine, item.date && portalDate(item.date), item.dose, item.notes].filter(Boolean).join(' · ')}</li>)}</ul> : <p className="portal-empty">None recorded.</p>}
                            </section>
                        </div>
                    </>}
                    {page === PAGES[1] && <section className="portal-card"><h2>Medication list</h2><MedicationList medications={medications} /></section>}
                    {page === PAGES[2] && <section className="portal-card"><h2>Lab results</h2>
                        <LabResults labs={labs} />
                    </section>}
                    {page === PAGES[3] && <section className="portal-card"><h2>Visit history</h2>
                        {!visits.length && <p className="portal-empty">No visits recorded.</p>}
                        {visits.map((visit, index) => <article className="portal-record" key={visit.id || index}>
                            <h3>{visit.visit_type || "Visit"} · {portalDate(visit.date)}</h3>
                            {visit.medications && <p>Medications: {visit.medications}</p>}
                            <p className="portal-text">{visit.summary || "No summary has been shared for this visit."}</p>
                        </article>)}
                    </section>}
                    {page === PAGES[4] && <section className="portal-card"><h2>My details</h2>
                        <dl className="portal-details"><div><dt>Name</dt><dd>{name}</dd></div><div><dt>Date of birth</dt><dd>{portalDate(patient?.date_of_birth)}</dd></div>
                            {['age', 'sex', 'occupation', 'phone_number', 'email', 'address'].map((key) => <div key={key}><dt>{({age:'Age',sex:'Sex',occupation:'Occupation',phone_number:'Phone',email:'Contact email',address:'Address'})[key]}</dt><dd>{patient?.[key] ?? 'Not recorded'}</dd></div>)}
                            <div><dt>Sign-in email</dt><dd>{user.email}</dd></div><div><dt>Account role</dt><dd>Patient</dd></div></dl>
                        </section>}
                </>}
                <p className="portal-readonly">View only - records are added by the care team</p>
            </main>
        </div>
        <footer className="emr-footer"><span>Educational EMR Prototype</span><a href="#/about">About us</a><span>For educational use only</span></footer>
        {idleWarning}
    </div>;
}
