import { useEffect, useState } from "react";
import { listStudents } from "../services/students.js";
import StudentRow from "./StudentRow.jsx";
export default function StudentDirectory({ refreshKey = 0 }) {
    const [filters, setFilters] = useState({ page: 1, search: "", status: "all" });
    const [searchDraft, setSearchDraft] = useState("");
    const [result, setResult] = useState({ students: [], total: 0, page: 1, pageSize: 25 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");
            try {
                const next = await listStudents(filters.page, filters);
                if (!cancelled) setResult(next);
            } catch (loadError) {
                if (!cancelled) setError(loadError.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [filters, refreshKey, reload]);

    const filtered = Boolean(filters.search || filters.status !== "all");

    return (
        <section className="student-directory" aria-labelledby="student-directory-heading" aria-busy={loading}>
            <div className="student-directory-toolbar">

                <h3 id="student-directory-heading">Student Accounts</h3>
                <button className="student-small-button" type="button" disabled={loading}
                    onClick={() => setReload((value) => value + 1)}>
                    Refresh
                </button>
            </div>

            <form className="student-directory-filters" onSubmit={(event) => {
                event.preventDefault();
                setMessage("");
                setFilters((current) => ({ ...current, page: 1, search: searchDraft.trim() }));
            }}>
                <label htmlFor="student-search">Search by name or email
                    <input id="student-search" type="search" maxLength={254}
                        placeholder="Name or email address" value={searchDraft}
                        onChange={(event) => setSearchDraft(event.target.value)} />
                </label>
                <div className="student-directory-filter">
                    <label htmlFor="student-status-filter">Account status</label>
                    <select id="student-status-filter" value={filters.status}
                        onChange={(event) => {
                            setMessage("");
                            setFilters((current) => ({ ...current, page: 1, status: event.target.value }));
                        }}>
                        <option value="all">All accounts</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <button className="student-small-button" type="submit">Search</button>
                {(filtered || searchDraft) && <button className="student-text-button" type="button" onClick={() => {
                    setSearchDraft("");
                    setMessage("");
                    setFilters({ page: 1, search: "", status: "all" });
                }}>Clear filters</button>}
            </form>

            {message && <p className="form-message form-message-success" role="status">{message}</p>}
            {loading ? <p className="student-directory-feedback" role="status">Loading students...</p> : error ? (
                <p className="form-message form-message-error" role="alert">{error}</p>) 
                : result.students.length === 0 ? (
                <p className="student-directory-feedback" role="status">
                    {filtered ? "No students match your search or status filter." : "No student accounts have been created yet."}
                </p>)
                : 
                (
                <div className="student-directory-scroll">
                    <table className="student-directory-table">
                        <thead><tr><th scope="col">Name</th><th scope="col">Email</th>
                            <th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
                        <tbody>
                            {result.students.map((student) => (
                                <StudentRow
                                    key={student.user_id}
                                    student={student}
                                    onChanged={(notice) => {
                                        setMessage(notice ?? "Student account updated.");
                                        setReload((value) => value + 1);
                                    }}/>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && !error && result.total > 0 && <div className="student-directory-pages">
                <span>{result.total} {filtered ? "matching " : ""}student{result.total === 1 ? "" : "s"}</span>
                <div>
                    <button className="student-small-button" type="button" disabled={result.page === 1}
                        onClick={() => setFilters((current) => ({ ...current, page: result.page - 1 }))}>Previous</button>
                    <span>Page {result.page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
                    <button className="student-small-button" type="button"
                        disabled={result.page * result.pageSize >= result.total}
                        onClick={() => setFilters((current) => ({ ...current, page: result.page + 1 }))}>Next</button>
                </div>
            </div>}
        </section>
    );
}
