import { useEffect, useState } from "react";
import { createPatientPortalAccount, portalAccountStatus, releaseVisitSummary, setPortalAccess } from "../services/patientPortalService.js";
import "../pages/PatientPortal.css";

export default function PatientPortalManagement({ patient, visits, canManageAccounts }) {
    const [account, setAccount] = useState(null);
    const [checking, setChecking] = useState(canManageAccounts);
    const [email, setEmail] = useState(patient.email || "");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [visitId, setVisitId] = useState("");
    const [summary, setSummary] = useState("");
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        if (!canManageAccounts) return;
        let cancelled = false;
        setChecking(true);
        portalAccountStatus(patient.id).then((data) => { if (!cancelled) setAccount(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setChecking(false); });
        return () => { cancelled = true; };
    }, [patient.id, canManageAccounts, refresh]);

    async function perform(action) {
        setBusy(true); setError(""); setNotice("");
        try { await action(); }
        catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    function createAccount(event) {
        event.preventDefault();
        perform(async () => {
            const created = await createPatientPortalAccount({ patientId: patient.id, email, password });
            setAccount({ email: created.email, active: true });
            setPassword("");
            setNotice("Portal access created. Share the sign-in email and temporary password securely. The patient must change the password on first sign-in.");
        });
    }

    return <section className="portal-management" aria-label="Patient portal management">
        <h2>Patient portal</h2>
        <p>Patients can view their recorded medications and visit summaries.</p>
        {error && <p className="form-message form-message-error" role="alert">{error}</p>}
        {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
        {canManageAccounts && <>
            <h3>Account access</h3>
            {checking ? <p role="status">Checking portal access…</p> : account ? <div>
                <p>{account.email} · {account.active ? "Active" : "Inactive"}</p>
                <button type="button" disabled={busy} onClick={() => perform(async () => {
                    await setPortalAccess(patient.id, !account.active);
                    setAccount({ ...account, active: !account.active });
                    setNotice(account.active ? "Portal access deactivated. Patient records are kept." : "Portal access reactivated.");
                })}>{account.active ? "Deactivate portal access" : "Reactivate portal access"}</button>
            </div> : <form onSubmit={createAccount}>
                <label>Patient sign-in email<input type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Temporary password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <p>Use at least 8 characters with a letter and a number. Keep a secure copy before creating access.</p>
                <button type="submit" disabled={busy}>Create patient portal access</button>
            </form>}
            <button type="button" disabled={checking || busy} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Refresh portal status</button>
        </>}

        <details><summary>Share a visit summary</summary>
            <p>Only the summary entered here is shared. Internal visit notes stay private.</p>
            {!visits.length ? <p>No recorded visits are available to share yet.</p> : <form onSubmit={(event) => {
                event.preventDefault();
                perform(async () => { await releaseVisitSummary(visitId, summary); setSummary(""); setNotice("Visit summary released to the patient portal."); });
            }}>
                <label htmlFor="portal-recorded-visit">Recorded visit</label>
                <select id="portal-recorded-visit" required value={visitId} onChange={(event) => setVisitId(event.target.value)}>
                    <option value="">Choose a visit</option>
                    {visits.map((visit) => <option key={visit.id} value={visit.id}>{new Date(visit.created_at).toLocaleString()} · {visit.visit_type || "Visit"}</option>)}
                </select>
                <label>Summary for the patient<textarea required maxLength={10000} rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
                <button type="submit" disabled={busy}>Release visit summary to portal</button>
            </form>}
        </details>
    </section>;
}
