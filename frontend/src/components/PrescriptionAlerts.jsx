import { useEffect, useState } from "react";
import { loadPrescriptionAlerts, readPrescriptionAlert } from "../services/patientPortalService.js";

export default function PrescriptionAlerts({ userId, refresh }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setAlerts([]); setLoading(true); setError("");
        loadPrescriptionAlerts().then((data) => {
            if (!cancelled) { setAvailable(data !== null); setAlerts(data || []); }
        }).catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [userId, refresh, retry]);
    async function markRead(id) {
        if (busy) return;
        setBusy(id); setError("");
        try {
            await readPrescriptionAlert(id);
            setAlerts((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
        } catch (err) { setError(err.message); }
        finally { setBusy(null); }
    }
    const unread = alerts.filter((item) => !item.read_at).length;
    return <section className="portal-card portal-alerts" aria-label="Prescription alerts">
        <h2>Prescription alerts{unread > 0 ? ` (${unread} unread)` : ""}</h2>
        {loading && <p role="status">Loading prescription alerts…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry alerts</button></div>}
        {!loading && !error && !available && <p>Prescription alerts are not available yet.</p>}
        {!loading && !error && available && !alerts.length && <p className="portal-empty">No prescription alerts yet.</p>}
        {alerts.map((item) => <article className="portal-record" key={item.id}>
            <div className="portal-record-heading"><h3>{item.medication_name}</h3><span>{item.read_at ? "Read" : "New"}</span></div>
            <p>Your prescription was sent to {item.pharmacy_name} as part of this simulation.</p>
            <p className="portal-readonly">{new Date(item.created_at).toLocaleString()}</p>
            {!item.read_at && <button type="button" className="secondary-action-button" disabled={Boolean(busy)} onClick={() => markRead(item.id)}>{busy === item.id ? "Saving…" : "Mark as read"}</button>}
        </article>)}
    </section>;
}
