import { useEffect, useState } from "react";
import { getPhiAuditLog } from "../services/auditService.js";
import "./AuditLog.css";

const ACTIONS = ["VIEW", "INSERT", "UPDATE", "DELETE", "ACCOUNT_CREATED", "ACCOUNT_DEACTIVATED", "ACCOUNT_ACTIVATED",
    "ACCOUNT_RENAMED", "EMAIL_CHANGED", "ACCOUNT_DELETED", "PORTAL_ACCOUNT_CREATED"];
const PAGE_SIZE = 50;
const EMPTY_FILTERS = { search: "", action: "", from: "", to: "" };

export default function AuditLog() {
    const [form, setForm] = useState(EMPTY_FILTERS);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [result, setResult] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        getPhiAuditLog({ ...filters, page })
            .then((data) => { if (!cancelled) setResult(data); })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filters, page]);

    function update(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    function apply(e) {
        e.preventDefault();
        setFilters(form);
        setPage(1);
    }

    function clear() {
        setForm(EMPTY_FILTERS);
        setFilters(EMPTY_FILTERS);
        setPage(1);
    }

    const first = (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(page * PAGE_SIZE, result.total);

    return (
        <main className="audit-log">
            <h1>Audit Log</h1>
            <p className="audit-muted">Who viewed or changed patient records and accounts. Entries cannot be edited or removed.</p>

            <form className="audit-filters" onSubmit={apply}>
                <input name="search" type="search" value={form.search} onChange={update}
                    placeholder="Search person, patient, or account" aria-label="Search names" />
                <select name="action" value={form.action} onChange={update} aria-label="Action">
                    <option value="">All actions</option>
                    {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
                </select>
                <label>From <input name="from" type="date" value={form.from} onChange={update} /></label>
                <label>To <input name="to" type="date" value={form.to} onChange={update} /></label>
                <button type="submit" className="primary-action-button">Apply</button>
                <button type="button" className="secondary-action-button" onClick={clear}>Clear</button>
            </form>

            {error && <p role="alert" className="form-message form-message-error">{error}</p>}

            <div className="audit-table-wrap">
                <table className="audit-table">
                    <thead>
                        <tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Patient</th><th>Account</th><th>Case student</th><th>Changed</th></tr>
                    </thead>
                    <tbody>
                        {result.rows.map((row) => (
                            <tr key={row.id}>
                                <td>{new Date(row.occurred_at).toLocaleString()}</td>
                                <td>{row.who ?? "System"}</td>
                                <td>{row.action}</td>
                                <td>{row.record}</td>
                                <td>{row.patient ?? "—"}</td>
                                <td>{row.account ?? "—"}</td>
                                <td>{row.case_student ?? "—"}</td>
                                <td>{row.changed_fields?.join(", ") ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loading && result.rows.length === 0 && !error && <p className="audit-muted">No entries match these filters.</p>}
                {loading && <p className="audit-muted">Loading…</p>}
            </div>

            <div className="audit-paging">
                <span>{result.total ? `${first}–${last} of ${result.total}` : ""}</span>
                <button type="button" className="secondary-action-button" disabled={page === 1 || loading}
                    onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="secondary-action-button" disabled={last >= result.total || loading}
                    onClick={() => setPage(page + 1)}>Next</button>
            </div>
        </main>
    );
}
