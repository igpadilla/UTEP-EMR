import { useState } from "react";
import { createStudent, enrollStudent } from "../services/students.js";
import { parseStudentImport, importStudentRows } from "../lib/studentImport.js";

export default function BulkStudentImport({ onImported }) {
    const [bulkData, setBulkData] = useState("");
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState([]);
    const [results, setResults] = useState(null);

    async function run(rows) {
        setBusy(true);
        setErrors([]);
        let latest = rows;
        try {
            const next = await importStudentRows(rows, {
                createStudent, enrollStudent,
                onProgress: (progress) => { latest = progress; setResults(progress); },
            });
            setResults(next);
        } catch {
            setErrors(["Import stopped unexpectedly. Review the results before retrying unfinished rows."]);
        } finally {
            setBusy(false);
            // Accounts can exist even if enrollment failed; refresh the directory.
            if (latest.some((row) => row.studentId)) onImported?.();
        }
    }

    function handleSubmit(event) {
        event.preventDefault();
        const parsed = parseStudentImport(bulkData);
        setErrors(parsed.errors);
        // Validate the entire roster before creating the first account.
        if (parsed.errors.length) return;
        setResults(parsed.rows);
        run(parsed.rows);
    }

    const created = results?.filter((row) => row.studentId) ?? [];
    const completed = results?.filter((row) => row.status === "completed").length ?? 0;
    const unfinished = results?.filter((row) => row.status !== "completed").length ?? 0;

    return (
        <section className="student-form-panel student-bulk-import" aria-labelledby="bulk-import-heading" aria-busy={busy}>
            <div className="student-form-heading">
                <h3 id="bulk-import-heading">Bulk Import Students</h3>
                <p>Paste CSV in this order: <code>Full Name, Email, Course Number, CRN</code>.</p>
                <p>Use First Last order for names. The header is optional. All rows are checked before accounts are created.</p>
            </div>

            {errors.length > 0 && <div className="form-message form-message-error" role="alert">
                <p>{results ? "Import needs attention:" : "No accounts were created. Fix these rows and try again:"}</p>
                <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
            </div>}

            {!results && <form className="student-form" onSubmit={handleSubmit}>
                <div className="student-form-field student-form-field-wide">
                    <label htmlFor="bulk-data">CSV Data</label>
                    <textarea id="bulk-data" rows={8} value={bulkData}
                        onChange={(event) => setBulkData(event.target.value)} disabled={busy}
                        placeholder={"Full Name, Email, Course Number, CRN\nJohn Doe, jdoe@miners.utep.edu, PHARM 4301, 11234"}
                        required />
                </div>
                <div className="student-form-actions">
                    <button className="primary-action-button" type="submit" disabled={busy}>Run Bulk Import</button>
                </div>
            </form>}

            {results && <>
                <p role="status" className="student-directory-feedback">
                    {busy ? "Importing students… " : "Import finished. "}
                    {created.length} account(s) created; {completed} of {results.length} student(s) enrolled.
                </p>
                <div className="student-directory-scroll">
                    <table className="student-directory-table student-import-table">
                        <thead><tr><th scope="col">Row / Email</th><th scope="col">Result</th></tr></thead>
                        <tbody>{results.map((row) => <tr key={row.rowNumber}>
                            <td>Row {row.rowNumber}<br />{row.email}</td>
                            <td>{row.status === "completed" ? "Account created and enrolled"
                                : row.status === "enrollment_failed" ? "Account created; enrollment failed"
                                : row.status === "creation_failed" ? "Account not created"
                                : row.status === "creating" ? "Creating account…"
                                : row.status === "enrolling" ? "Account created; enrolling…" : "Waiting"}
                                {row.error && <p className="student-row-error">{row.error}</p>}
                            </td>
                        </tr>)}</tbody>
                    </table>
                </div>

                {created.length > 0 && <div className="form-message form-message-success">
                    <p>Copy these temporary passwords before leaving this page or starting a new import.
                        Credentials are shown for every created account, including students whose enrollment failed.</p>
                    <ul className="student-import-credentials">{created.map((row) => (
                        <li key={row.studentId}><span>{row.email}</span><code>{row.password}</code></li>
                    ))}</ul>
                </div>}

                {unfinished > 0 && <p>Retry unfinished rows to try again. Existing accounts are reused for failed enrollments; completed rows are skipped.</p>}
                <div className="student-form-actions">
                    {unfinished > 0 && <button className="primary-action-button" type="button" disabled={busy}
                        onClick={() => run(results)}>Retry unfinished rows</button>}
                    <button className="secondary-action-button" type="button" disabled={busy} onClick={() => {
                        setResults(null); setErrors([]); setBulkData("");
                    }}>Start a new import</button>
                </div>
            </>}
        </section>
    );
}
