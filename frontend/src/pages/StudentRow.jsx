import { useState } from "react";
import { deleteStudent, updateStudent } from "../services/students.js";

export default function StudentRow({ student, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [firstName, setFirstName] = useState(student.first_name ?? "");
    const [lastName, setLastName] = useState(student.last_name ?? "");
    const [email, setEmail] = useState(student.email ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [confirming, setConfirming] = useState("");

    function beginEdit() {
        setFirstName(student.first_name ?? "");
        setLastName(student.last_name ?? "");
        setEmail(student.email ?? "");
        setError("");
        setConfirming("");
        setEditing(true);
    }



    async function saveNames(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await updateStudent(student.user_id, {
                firstName: firstName.trim(), lastName: lastName.trim(),
            });
            setEditing(false);
            onChanged("Student name updated.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setBusy(false);
        }}

    async function saveEmail(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await updateStudent(student.user_id, { email: email.trim() });
            setEditing(false);
            onChanged("Student email updated.");
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setBusy(false);
        }
    }

    async function changeStatus() {
        setBusy(true);
        setError("");
        try {
            await updateStudent(student.user_id, { active: !student.active });
            setConfirming("");
            onChanged(student.active
                ? "Student deactivated. Their existing work has been kept."
                : "Student reactivated. They can sign in again.");
        } catch (statusError) {
            setError(statusError.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setBusy(true);
        setError("");
        try {
            await deleteStudent(student.user_id);
            onChanged("Student account deleted.");
        } catch (deleteError) {
            setError(deleteError.message);
            setConfirming("");
        } finally {
            setBusy(false);
        }
    }

    if (editing) {
        return (
            <tr className="student-edit-row">
                <td colSpan={4}>
                    <div className="student-edit-heading">
                        <strong>Edit student</strong>
                        <button type="button" className="student-text-button" disabled={busy}
                            onClick={() => { setEditing(false); setError(""); }}>Close</button>
                    </div>


                    <form className="student-edit-form" onSubmit={saveNames}>
                        <label>First name
                            <input value={firstName} onChange={(event) => setFirstName(event.target.value)}
                                maxLength={100} disabled={busy} required />
                        </label>
                        <label>Last name
                            <input value={lastName} onChange={(event) => setLastName(event.target.value)}
                                maxLength={100} disabled={busy} required />
                        </label>
                        <button type="submit" className="student-small-button" disabled={busy}>Save name</button>
                    </form>
                    
                    <form className="student-edit-form student-email-form" onSubmit={saveEmail}>
                        <label>Email
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                                maxLength={254} disabled={busy} required />
                        </label>
                        <button type="submit" className="student-small-button" disabled={busy}>Save email</button>
                    </form>
                    {error && <p className="student-row-error" role="alert">{error}</p>}
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td className="student-name-cell">{`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "Name not set"}</td>
            <td className="student-email-cell">{student.email}</td>
            <td><span className={`student-status ${student.active ? "is-active" : "is-inactive"}`}>
                {student.active ? "Active" : "Inactive"}
            </span></td>

            <td>
                <div className="student-row-actions">
                    {confirming ? (
                        <>
                            <span className="student-confirm-label">
                                {confirming === "delete" ? "Delete permanently?" : "Deactivate login and keep their work?"}
                            </span>
                            <button type="button" className="student-small-button student-danger-button" disabled={busy}
                                onClick={confirming === "delete" ? remove : changeStatus}>Confirm</button>
                            <button type="button" className="student-small-button" disabled={busy}
                                onClick={() => setConfirming("")}>Cancel</button>
                        </>
                    ) : 
                    
                    (
                        <>
                            <button type="button" className="student-small-button" disabled={busy} onClick={beginEdit}>Edit</button>
                            <button type="button" className="student-small-button" disabled={busy}
                                onClick={() => student.active ? setConfirming("deactivate") : changeStatus()}>
                                {student.active ? "Deactivate" : "Reactivate"}
                            </button>
                            {!student.active && <button type="button" className="student-small-button student-danger-button"
                                disabled={busy} onClick={() => setConfirming("delete")}>Delete</button>}
                        </>
                    )}
                </div>
                {error && <p className="student-row-error" role="alert">{error}</p>}
            </td>
        </tr>
        
    
    );}
