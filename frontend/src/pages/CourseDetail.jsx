import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import {
    getCourseById,
    getCourseStudents,
    getCourseAssignedCases,
    getClinicalRoles,
    updateCourse,
    unenrollStudent,
} from "../services/instructorService.js";

const DISCIPLINE_BANNERS = {
    pharmacy: "linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
    nursing: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    physical_therapy: "linear-gradient(135deg, #047857 0%, #10b981 100%)",
    occupational_therapy: "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
    psychology: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    psychiatry: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    speech_language_pathology: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
    social_work: "linear-gradient(135deg, #065f46 0%, #059669 100%)",
    inpatient_physician: "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)",
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

const STATUS_LABELS = {
    "not started": "Not Started",
    "in progress": "In Progress",
    "revision_requested": "Needs Revision",
    "pending review": "Pending Review",
    "completed": "Completed",
};

const STATUS_COLORS = {
    "not started": "#64748b",
    "in progress": "#0284c7",
    "revision_requested": "#d97706",
    "pending review": "#7c3aed",
    "completed": "#047857",
};

export default function CourseDetail({ courseId, onNavigate }) {
    const [course, setCourse] = useState(null);
    const [students, setStudents] = useState([]);
    const [cases, setCases] = useState([]);
    const [roles, setRoles] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Edit state
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ course_number: "", crn: "", discipline: "" });
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState("");

    // Unenroll state
    const [unenrollingId, setUnenrollingId] = useState(null);

    useEffect(() => {
        async function load() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                setCurrentUserId(user?.id ?? null);
                const [c, s, ca, r] = await Promise.all([
                    getCourseById(courseId),
                    getCourseStudents(courseId),
                    getCourseAssignedCases(courseId),
                    getClinicalRoles(),
                ]);
                setCourse(c);
                setStudents(s);
                setCases(ca);
                setRoles(r);
            } catch (err) {
                console.error(err);
                setError("Failed to load course.");
            }
            setLoading(false);
        }
        load();
    }, [courseId]);

    function startEdit() {
        setEditForm({
            course_number: course.course_number,
            crn: course.crn,
            discipline: course.discipline ?? "",
        });
        setEditError("");
        setEditing(true);
    }

    async function handleSave() {
        if (!editForm.course_number.trim() || !editForm.crn.trim()) {
            setEditError("Course number and CRN are required.");
            return;
        }
        setSaving(true);
        setEditError("");
        try {
            const updated = await updateCourse(courseId, editForm);
            setCourse((prev) => ({ ...prev, ...updated }));
            setEditing(false);
        } catch (err) {
            console.error(err);
            setEditError("Failed to save changes.");
        }
        setSaving(false);
    }

    async function handleUnenroll(studentId) {
        setUnenrollingId(studentId);
        try {
            await unenrollStudent(courseId, studentId);
            setStudents((prev) => prev.filter((s) => s.user_id !== studentId));
        } catch (err) {
            console.error(err);
            setError("Failed to unenroll student.");
        }
        setUnenrollingId(null);
    }

    if (loading) {
        return (
            <main className="instructor-main">
                <p className="instructor-loading">Loading…</p>
            </main>
        );
    }

    if (error || !course) {
        return (
            <main className="instructor-main">
                <p className="form-message form-message-error">{error || "Course not found."}</p>
            </main>
        );
    }

    const instructor = course.profiles;
    const isOwner = currentUserId && course.instructor_id === currentUserId;

    const gradebook = students.map((s) => {
        const studentCases = cases.filter((c) => c.profiles?.user_id === s.user_id);
        const scored = studentCases.filter((c) => c.score != null);
        const avg = scored.length
            ? (scored.reduce((sum, c) => sum + Number(c.score), 0) / scored.length).toFixed(1)
            : null;
        return { student: s, cases: studentCases, avg };
    });

    const activeDiscipline = editing ? editForm.discipline : course.discipline;
    const banner = DISCIPLINE_BANNERS[activeDiscipline] ?? DEFAULT_BANNER;
    const disciplineLabel = roles.find((r) => r.role_name === course.discipline)?.display_name ?? course.discipline;
    const initials = instructor
        ? `${instructor.first_name?.[0] ?? ""}${instructor.last_name?.[0] ?? ""}`.toUpperCase()
        : "?";

    return (
        <main style={{ paddingBottom: "2rem" }}>
            {/* ── Banner ──────────────────────────────────────── */}
            <div className="course-detail-banner" style={{ background: banner }}>
                <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
                    <button
                        className="secondary-action-button"
                        type="button"
                        onClick={() => onNavigate("courses")}
                        style={{ marginBottom: "1rem", background: "rgba(0,0,0,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
                    >
                        ← Courses
                    </button>
                    {course.discipline && (
                        <p className="course-detail-crn" style={{ opacity: 0.85 }}>
                            {DISCIPLINE_ABBR[course.discipline] ?? disciplineLabel}
                        </p>
                    )}
                    <p className="course-detail-crn">CRN {course.crn}</p>
                    <h2 className="course-detail-title">{course.course_number}</h2>
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────── */}
            <div className="course-detail-body">

                {/* ── Main ──────────────────────────────────────── */}
                <div className="course-detail-main">

                    {/* Assigned Cases */}
                    <div className="course-detail-section">
                        <div className="course-detail-section-header">
                            <h3>Assigned Cases</h3>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {cases.length} case{cases.length !== 1 ? "s" : ""}
                            </span>
                        </div>

                        {cases.length === 0 ? (
                            <p style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                No cases assigned to students in this course yet.
                            </p>
                        ) : (
                            <>
                                <div className="course-detail-case-row" style={{ background: "#f8fafc", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                                    <span>Patient / Case</span>
                                    <span>Student</span>
                                    <span>Status</span>
                                    <span>Score</span>
                                </div>
                                {cases.map((c) => (
                                    <div key={c.id} className="course-detail-case-row">
                                        <div>
                                            <div className="course-detail-case-patient">
                                                {c.patient_templates?.first_name} {c.patient_templates?.last_name}
                                            </div>
                                            <div className="course-detail-case-complaint">
                                                {c.patient_templates?.chief_complaint}
                                            </div>
                                        </div>
                                        <span className="course-detail-case-student">
                                            {c.profiles?.first_name} {c.profiles?.last_name}
                                        </span>
                                        <span style={{ color: STATUS_COLORS[c.encounter_status] ?? "#64748b", fontWeight: 500, fontSize: "0.8rem" }}>
                                            {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                        </span>
                                        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                            {c.score != null ? `${c.score}` : "—"}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Gradebook */}
                    <div className="course-detail-section">
                        <div className="course-detail-section-header">
                            <h3>Gradebook</h3>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {gradebook.filter((r) => r.avg !== null).length} of {gradebook.length} student{gradebook.length !== 1 ? "s" : ""} scored
                            </span>
                        </div>

                        {gradebook.length === 0 ? (
                            <p style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                No students enrolled yet.
                            </p>
                        ) : (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(3, 100px)", gap: "1rem", padding: "0.6rem 1.25rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                    <span>Student</span>
                                    <span>Cases</span>
                                    <span>Completed</span>
                                    <span>Avg Score</span>
                                </div>
                                {gradebook.map(({ student, cases: sc, avg }) => {
                                    const completed = sc.filter((c) => c.encounter_status === "completed").length;
                                    return (
                                        <div key={student.user_id} style={{ display: "grid", gridTemplateColumns: "1fr repeat(3, 100px)", gap: "1rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem", alignItems: "center" }}>
                                            <span style={{ fontWeight: 500, color: "var(--text)" }}>
                                                {student.last_name}, {student.first_name}
                                            </span>
                                            <span style={{ color: "var(--text-muted)" }}>{sc.length}</span>
                                            <span style={{ color: completed === sc.length && sc.length > 0 ? "#047857" : "var(--text-muted)" }}>
                                                {completed}/{sc.length}
                                            </span>
                                            <span style={{ fontWeight: avg !== null ? 600 : 400, color: avg !== null ? "var(--text)" : "var(--text-muted)" }}>
                                                {avg !== null ? avg : "—"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    {/* Roster */}
                    <div className="course-detail-section">
                        <div className="course-detail-section-header">
                            <h3>Roster</h3>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {students.length} student{students.length !== 1 ? "s" : ""}
                            </span>
                        </div>

                        {students.length === 0 ? (
                            <p style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                No students enrolled yet.
                            </p>
                        ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                                {students.map((s) => (
                                    <li key={s.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.65rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                                        <span>{s.last_name}, {s.first_name}</span>
                                        {isOwner && (
                                            <button
                                                className="secondary-action-button"
                                                type="button"
                                                onClick={() => handleUnenroll(s.user_id)}
                                                disabled={unenrollingId === s.user_id}
                                                style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", color: "#dc2626" }}
                                            >
                                                {unenrollingId === s.user_id ? "Removing…" : "Remove"}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* ── Sidebar ───────────────────────────────────── */}
                <div className="course-detail-sidebar">

                    {/* Faculty */}
                    <div className="course-detail-sidebar-card">
                        <p className="course-detail-sidebar-title">Course Faculty</p>
                        <div className="course-detail-faculty">
                            <div className="course-detail-faculty-avatar">{initials}</div>
                            <div>
                                <div className="course-detail-faculty-name">
                                    {instructor ? `${instructor.first_name} ${instructor.last_name}` : "—"}
                                </div>
                                <div className="course-detail-faculty-role">Instructor</div>
                            </div>
                        </div>
                    </div>

                    {/* Details / Edit */}
                    <div className="course-detail-sidebar-card">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                            <p className="course-detail-sidebar-title" style={{ margin: 0 }}>Details</p>
                            {isOwner && !editing && (
                                <button
                                    className="secondary-action-button"
                                    type="button"
                                    onClick={startEdit}
                                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}
                                >
                                    Edit
                                </button>
                            )}
                        </div>

                        {editing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                <div className="student-form-field">
                                    <label>Course Number</label>
                                    <input
                                        type="text"
                                        value={editForm.course_number}
                                        onChange={(e) => setEditForm((p) => ({ ...p, course_number: e.target.value }))}
                                        disabled={saving}
                                    />
                                </div>
                                <div className="student-form-field">
                                    <label>CRN</label>
                                    <input
                                        type="text"
                                        value={editForm.crn}
                                        onChange={(e) => setEditForm((p) => ({ ...p, crn: e.target.value }))}
                                        disabled={saving}
                                    />
                                </div>
                                <div className="student-form-field">
                                    <label>Discipline</label>
                                    <select
                                        value={editForm.discipline}
                                        onChange={(e) => setEditForm((p) => ({ ...p, discipline: e.target.value }))}
                                        disabled={saving}
                                        className="instructor-search-input"
                                    >
                                        <option value="">— None —</option>
                                        {roles.map((r) => (
                                            <option key={r.role_name} value={r.role_name}>{r.display_name}</option>
                                        ))}
                                    </select>
                                </div>
                                {editError && (
                                    <p className="form-message form-message-error" style={{ margin: 0 }}>{editError}</p>
                                )}
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <button
                                        className="primary-action-button"
                                        type="button"
                                        onClick={handleSave}
                                        disabled={saving}
                                        style={{ flex: 1 }}
                                    >
                                        {saving ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                        className="secondary-action-button"
                                        type="button"
                                        onClick={() => setEditing(false)}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="course-detail-meta-row">
                                    <span className="course-detail-meta-label">CRN</span>
                                    <span className="course-detail-meta-value">{course.crn}</span>
                                </div>
                                <div className="course-detail-meta-row">
                                    <span className="course-detail-meta-label">Discipline</span>
                                    <span className="course-detail-meta-value">{disciplineLabel || "—"}</span>
                                </div>
                                <div className="course-detail-meta-row">
                                    <span className="course-detail-meta-label">Students</span>
                                    <span className="course-detail-meta-value">{students.length}</span>
                                </div>
                                <div className="course-detail-meta-row">
                                    <span className="course-detail-meta-label">Cases</span>
                                    <span className="course-detail-meta-value">{cases.length}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="course-detail-sidebar-card">
                        <p className="course-detail-sidebar-title">Actions</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <button
                                className="secondary-action-button"
                                type="button"
                                onClick={() => onNavigate("courses")}
                                style={{ width: "100%", justifyContent: "flex-start" }}
                            >
                                Manage Courses
                            </button>
                            <button
                                className="secondary-action-button"
                                type="button"
                                onClick={() => onNavigate("instructorCases")}
                                style={{ width: "100%", justifyContent: "flex-start" }}
                            >
                                Assign Cases
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
