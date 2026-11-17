import { useState } from "react";
import { setLabResultPortalRelease } from "../../services/patientPortalService.js";

export default function DiagnosticPortalRelease({ result, onChanged }) {
    const [note, setNote] = useState(result.portal_note || "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const shared = Boolean(result.portal_released_at);

    async function save(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await setLabResultPortalRelease(result.id, !shared, note);
            await onChanged();
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    return <form className="diagnostics-portal-release" onSubmit={save}>
        <p className="diagnostics-meta">Result recorded: {new Date(result.resulted_at).toLocaleString()}</p>
        <p><strong>Patient portal:</strong> {shared ? "Shared with patient" : "Not shared"}</p>
        {!shared && <>
            <label htmlFor={`lab-portal-note-${result.id}`}>Patient summary (optional)</label>
            <textarea id={`lab-portal-note-${result.id}`} value={note} maxLength={10000} rows={2}
                disabled={busy} onChange={(event) => setNote(event.target.value)} />
            <p className="diagnostics-meta">Only the lab values and this summary are shared. Internal reports and attachments stay private.</p>
        </>}
        {error && <p className="form-message form-message-error" role="alert">{error}</p>}
        <button type="submit" className="secondary-action-button" disabled={busy}>
            {busy ? "Saving…" : shared ? "Stop sharing with patient" : "Share lab result with patient"}
        </button>
    </form>;
}
