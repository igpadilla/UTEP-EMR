import { useEffect, useState } from "react";
import {
    getMyCourses,
    createCourse,
    updateCourse,
    deleteCourse,
    getClinicalRoles,
} from "../services/instructorService.js";

const EMPTY_FORM = { course_number: "", crn: "", discipline: "" };

export default function CourseForm({ onNavigate }) {
    const [courses, setCourses]         = useState([]);
    const [roles, setRoles]             = useState([]);
    const [form, setForm]               = useState(EMPTY_FORM);
    const [editingId, setEditingId]     = useState(null);
    const [loading, setLoading]         = useState(true);
    const [submitting, setSubmitting]   = useState(false);
    const [deletingId, setDeletingId]   = useState(null);
    const [error, setError]             = useState("");
    const [success, setSuccess]         = useState("");

    useEffect(() => {
        async function load() {
            try {
                const [c, r] = await Promise.all([getMyCourses(), getClinicalRoles()]);
                setCourses(c);
                setRoles(r);
            } catch (err) {
                console.error(err);
                setError("Failed to load courses.");
            }
            setLoading(false);
        }
        load();
    }, []);

    function handleChange(e) {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setError("");
        setSuccess("");
    }

    function startEdit(course) {
        setEditingId(course.id);
        setForm({
            course_number: course.course_number,
            crn: course.crn,
            discipline: course.discipline ?? "",
        });
        setError("");
        setSuccess("");
    }

    function cancelEdit() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError("");
        setSuccess("");
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.course_number.trim()) { setError("Course number is required."); return; }
        if (!form.crn.trim())           { setError("CRN is required."); return; }

        setSubmitting(true);
        setError("");
        setSuccess("");
        try {
            if (editingId) {
                const updated = await updateCourse(editingId, form);
                setCourses((prev) =>
                    prev.map((c) => (c.id === editingId ? updated : c))
                );
                setSuccess("Course updated.");
            } else {
                const created = await createCourse(form);
                setCourses((prev) => [...prev, created]);
                setSuccess("Course created.");
            }
            setEditingId(null);
            setForm(EMPTY_FORM);
        } catch (err) {
            console.error(err);
            setError(
                err.code === "23505"
                    ? "A course with that CRN already exists."
                    : "Failed to save course. Please try again."
            );
        }
        setSubmitting(false);
    }

    async function handleDelete(courseId) {
        setDeletingId(courseId);
        setError("");
        setSuccess("");
        try {
            await deleteCourse(courseId);
            setCourses((prev) => prev.filter((c) => c.id !== courseId));
            if (editingId === courseId) cancelEdit();
            setSuccess("Course deleted.");
        } catch (err) {
            console.error(err);
            setError("Cannot delete a course that has enrolled students.");
        }
        setDeletingId(null);
    }

    const disciplineLabel = (role_name) =>
        roles.find((r) => r.role_name === role_name)?.display_name ?? role_name;

    if (loading) {
        return (
            <main className="instructor-main">
                <p className="instructor-loading">Loading…</p>
            </main>
        );
    }

    return (
        <main className="instructor-main">
            <div className="instructor-page-header">
                <div>
                    <p className="section-title">Instructor</p>
                    <h2>Courses</h2>
                    <p>Manage your courses and their clinical disciplines.</p>
                </div>
                <button
                    className="secondary-action-button"
                    type="button"
                    onClick={() => onNavigate("dashboard")}
                >
                    ← Back
                </button>
            </div>

            {/* ── Create / Edit Form ─────────────────────────── */}
            <div className="instructor-form-panel">
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">
                        {editingId ? "Edit Course" : "New Course"}
                    </h3>

                    <form onSubmit={handleSubmit}>
                        <div className="instructor-form-grid">
                            <div className="student-form-field">
                                <label htmlFor="course_number">Course Number</label>
                                <input
                                    id="course_number"
                                    name="course_number"
                                    type="text"
                                    placeholder="e.g. PHR 3310"
                                    value={form.course_number}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="crn">CRN</label>
                                <input
                                    id="crn"
                                    name="crn"
                                    type="text"
                                    placeholder="e.g. 12345"
                                    value={form.crn}
                                    onChange={handleChange}
                                    disabled={submitting}
                                />
                            </div>

                            <div className="student-form-field instructor-form-wide">
                                <label htmlFor="discipline">Clinical Discipline</label>
                                <select
                                    id="discipline"
                                    name="discipline"
                                    value={form.discipline}
                                    onChange={handleChange}
                                    disabled={submitting}
                                    className="instructor-search-input"
                                >
                                    <option value="">— None —</option>
                                    {roles.map((r) => (
                                        <option key={r.role_name} value={r.role_name}>
                                            {r.display_name}
                                        </option>
                                    ))}
                                </select>
                                <span className="instructor-baseline-hint">
                                    Sets the discipline students practice in when enrolled in this course.
                                </span>
                            </div>
                        </div>

                        {error   && <p className="form-message form-message-error"   role="alert">{error}</p>}
                        {success && <p className="form-message form-message-success" role="status">{success}</p>}

                        <div className="student-form-actions">
                            {editingId && (
                                <button
                                    className="secondary-action-button"
                                    type="button"
                                    onClick={cancelEdit}
                                    disabled={submitting}
                                    style={{ marginRight: "0.75rem" }}
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                className="primary-action-button"
                                type="submit"
                                disabled={submitting}
                            >
                                {submitting
                                    ? editingId ? "Saving…" : "Creating…"
                                    : editingId ? "Save Changes" : "Create Course"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* ── Course List ────────────────────────────────── */}
            <div className="instructor-form-panel" style={{ marginTop: "1.5rem" }}>
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Your Courses</h3>

                    {courses.length === 0 ? (
                        <div className="patients-empty-state">
                            <div className="patients-empty-icon" aria-hidden="true">📚</div>
                            <strong>No courses yet</strong>
                            <p>Create your first course above.</p>
                        </div>
                    ) : (
                        <ul className="instructor-student-list">
                            {courses.map((c) => (
                                <li key={c.id} className="instructor-student-item">
                                    <div className="instructor-student-label" style={{ flex: 1 }}>
                                        <span className="instructor-student-name">
                                            {c.course_number}
                                        </span>
                                        <span style={{ color: "var(--text-muted, #6b7280)", fontSize: "0.875rem", marginLeft: "0.5rem" }}>
                                            CRN {c.crn}
                                        </span>
                                        {c.discipline && (
                                            <span
                                                className="case-status-badge"
                                                style={{ marginLeft: "0.75rem" }}
                                            >
                                                {disciplineLabel(c.discipline)}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <button
                                            className="secondary-action-button"
                                            type="button"
                                            onClick={() => startEdit(c)}
                                            disabled={deletingId === c.id}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="secondary-action-button"
                                            type="button"
                                            onClick={() => handleDelete(c.id)}
                                            disabled={deletingId === c.id}
                                            style={{ color: "var(--color-error, #dc2626)" }}
                                        >
                                            {deletingId === c.id ? "Deleting…" : "Delete"}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </main>
    );
}
