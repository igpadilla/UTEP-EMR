import { useEffect, useState } from "react";
import {
    getAllCourses,
    createCourse,
    updateCourse,
    deleteCourse,
    getClinicalRoles,
    getCourseStudents,
} from "../services/instructorService.js";
import BulkStudentImport from "../components/BulkStudentImport.jsx";
import { supabase } from "../supabase.js";

const EMPTY_FORM = { course_number: "", crn: "", discipline: "" };

const DISCIPLINE_BANNERS = {
    pharmacy:               "linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
    nursing:                "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    physical_therapy:       "linear-gradient(135deg, #047857 0%, #10b981 100%)",
    occupational_therapy:   "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
    psychology:             "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    psychiatry:             "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    speech_language_pathology: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
    social_work:            "linear-gradient(135deg, #065f46 0%, #059669 100%)",
    inpatient_physician:    "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)",
    front_desk:             "linear-gradient(135deg, #374151 0%, #6b7280 100%)",
    biller:                 "linear-gradient(135deg, #92400e 0%, #d97706 100%)",
};
const DEFAULT_BANNER = "linear-gradient(135deg, #475569 0%, #94a3b8 100%)";

const DISCIPLINE_ABBR = {
    pharmacy:                  "PHARM",
    nursing:                   "NURS",
    physical_therapy:          "PT",
    occupational_therapy:      "OT",
    psychology:                "PSYC",
    psychiatry:                "PSYC",
    speech_language_pathology: "SLP",
    social_work:               "SW",
    inpatient_physician:       "MD",
};

export default function CourseForm({ onNavigate }) {
    const [courses, setCourses]       = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [roles, setRoles]           = useState([]);
    const [form, setForm]             = useState(EMPTY_FORM);
    const [editingId, setEditingId]   = useState(null);
    const [formOpen, setFormOpen]     = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [loading, setLoading]       = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [error, setError]           = useState("");
    const [success, setSuccess]       = useState("");

    useEffect(() => {
        async function load() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                setCurrentUserId(user?.id ?? null);
                const [c, r] = await Promise.all([getAllCourses(), getClinicalRoles()]);
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

    function openAdd() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError("");
        setSuccess("");
        setShowImport(false);
        setFormOpen(true);
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
        setShowImport(false);
        setFormOpen(true);
    }

    function cancelForm() {
        setFormOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError("");
        setSuccess("");
        setShowImport(false);
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
                setCourses((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
                setSuccess("Course updated.");
            } else {
                const created = await createCourse(form);
                setCourses((prev) => [...prev, created]);
                setSuccess("Course created.");
            }
            setFormOpen(false);
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
        const enrolled = await getCourseStudents(courseId).catch(() => []);
        if (enrolled.length > 0) {
            setError(`Cannot delete — ${enrolled.length} student${enrolled.length !== 1 ? "s" : ""} are still enrolled. Remove them from the roster first.`);
            return;
        }
        if (!window.confirm("Are you sure you want to delete this course? This cannot be undone.")) return;
        setDeletingId(courseId);
        setError("");
        setSuccess("");
        try {
            await deleteCourse(courseId);
            setCourses((prev) => prev.filter((c) => c.id !== courseId));
            if (editingId === courseId) cancelForm();
        } catch (err) {
            console.error(err);
            setError("Failed to delete course.");
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
                {!formOpen && (
                    <button
                        className="primary-action-button"
                        type="button"
                        onClick={openAdd}
                    >
                        + Add Course
                    </button>
                )}
            </div>

            {error   && <p className="form-message form-message-error"   role="alert">{error}</p>}
            {success && <p className="form-message form-message-success" role="status">{success}</p>}

            {/* ── Add / Edit Form ────────────────────────────── */}
            {formOpen && (
                <div className="instructor-form-panel" style={{ marginBottom: "1.5rem" }}>
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
                                        autoFocus
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

                            {error && <p className="form-message form-message-error" role="alert">{error}</p>}

                            <div className="student-form-actions">
                                <button
                                    className="secondary-action-button"
                                    type="button"
                                    onClick={cancelForm}
                                    disabled={submitting}
                                    style={{ marginRight: "0.75rem" }}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="primary-action-button"
                                    type="submit"
                                    disabled={submitting}
                                >
                                    {submitting
                                        ? editingId ? "Saving…" : "Creating…"
                                        : editingId ? "Save Changes" : "Create Course"}
                                </button>
                                <button
                                    className="secondary-action-button"
                                    type="button"
                                    onClick={() => setShowImport((v) => !v)}
                                    disabled={submitting}
                                    style={{ marginLeft: "auto" }}
                                >
                                    {showImport ? "Hide Roster Import" : "Import Roster as CSV"}
                                </button>
                            </div>
                        </form>

                        {showImport && (
                            <BulkStudentImport onImported={() => setShowImport(false)} />
                        )}
                    </div>
                </div>
            )}

            {/* ── Course Cards ───────────────────────────────── */}
            {courses.length === 0 ? (
                <div className="patients-empty-state">
                    <strong>No courses yet</strong>
                    <p>Click "+ Add Course" to create your first course.</p>
                </div>
            ) : (
                <div className="course-grid">
                    {courses.map((c) => {
                        const isOwner = c.instructor_id === currentUserId;
                        const instructor = c.profiles;
                        const banner = DISCIPLINE_BANNERS[c.discipline] ?? DEFAULT_BANNER;
                        return (
                            <div key={c.id} className="course-card" onClick={() => onNavigate("courseDetail", c.id)} style={{ cursor: "pointer" }}>
                                <div
                                    className="course-card-banner"
                                    style={{ background: banner }}
                                />

                                <div className="course-card-body">
                                    <span className="course-card-id">CRN {c.crn}</span>
                                    <span className="course-card-name">
                                        {c.discipline ? `${DISCIPLINE_ABBR[c.discipline] ?? disciplineLabel(c.discipline)} ` : ""}
                                        {c.course_number}
                                    </span>
                                </div>

                                <div className="course-card-footer">
                                    <span className="course-card-instructor">
                                        {instructor
                                            ? `${instructor.first_name} ${instructor.last_name}`
                                            : "—"}
                                    </span>
                                    {isOwner && (
                                        <div className="course-card-actions">
                                            <button
                                                className="secondary-action-button"
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                                                disabled={!!deletingId}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="secondary-action-button"
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                                                disabled={!!deletingId}
                                                style={{ color: "var(--color-error, #dc2626)" }}
                                            >
                                                {deletingId === c.id ? "Deleting…" : "Delete"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
