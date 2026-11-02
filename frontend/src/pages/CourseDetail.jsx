import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import {
    getCourseById,
    getCourseStudents,
    getCourseAssignedCases,
    getClinicalRoles,
    updateCourse,
    unenrollStudent,
    createAnnouncement,
    deleteAnnouncement,
} from "../services/instructorService.js";
import InstructorCases from "./InstructorCases.jsx";
import TemplateBuilder from "./TemplateBuilder.jsx";
import PatientManager from "./PatientManager.jsx";
import PatientDetail from "./PatientDetail.jsx";
import CaseAssign from "./CaseAssign.jsx";

const DISCIPLINE_BANNERS = {
    pharmacy:                  "linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
    nursing:                   "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    physical_therapy:          "linear-gradient(135deg, #047857 0%, #10b981 100%)",
    occupational_therapy:      "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
    psychology:                "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    psychiatry:                "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    speech_language_pathology: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
    social_work:               "linear-gradient(135deg, #065f46 0%, #059669 100%)",
    inpatient_physician:       "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)",
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


const TABS = [
    { id: "home",          label: "Home"          },
    { id: "cases",         label: "Cases"         },
    { id: "patients",      label: "Patients"      },
    { id: "roster",        label: "Roster"        },
    { id: "gradebook",     label: "Gradebook"     },
    { id: "announcements", label: "Announcements", disabled: true },
    { id: "settings",      label: "Settings"      },
];

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CourseDetail({ courseId, onNavigate }) {
    const [course, setCourse] = useState(null);
    const [students, setStudents] = useState([]);
    const [cases, setCases] = useState([]);
    const [roles, setRoles] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("home");
    // null = show cases list; { templateId } = show embedded builder/assign
    const [builderState, setBuilderState] = useState(null);
    const [assignState, setAssignState] = useState(null);

    // Settings / edit state
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ course_number: "", crn: "", discipline: "" });
    const [saving, setSaving] = useState(false);
    const [editError, setEditError] = useState("");

    // Roster state
    const [unenrollingId, setUnenrollingId] = useState(null);

    // Patient modal
    const [patientModalId, setPatientModalId] = useState(null);

    // Announcements state
    const [annForm, setAnnForm] = useState({ title: "", body: "" });
    const [annPosting, setAnnPosting] = useState(false);
    const [annError, setAnnError] = useState("");
    const [annComposing, setAnnComposing] = useState(false);
    const [deletingAnnId, setDeletingAnnId] = useState(null);

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

    // ── Settings ────────────────────────────────────────────────────────────
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
        if (!editForm.course_number.trim() || !editForm.crn.trim() || !editForm.discipline) {
            setEditError("Course number, CRN, and discipline are required.");
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

    // ── Roster ───────────────────────────────────────────────────────────────
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

    // ── Announcements ────────────────────────────────────────────────────────
    async function handlePostAnnouncement(e) {
        e.preventDefault();
        if (!annForm.title.trim() || !annForm.body.trim()) {
            setAnnError("Title and message are required.");
            return;
        }
        setAnnPosting(true);
        setAnnError("");
        try {
            const posted = await createAnnouncement(courseId, annForm);
            setAnnouncements((prev) => [posted, ...prev]);
            setAnnForm({ title: "", body: "" });
            setAnnComposing(false);
        } catch (err) {
            console.error(err);
            setAnnError("Failed to post announcement.");
        }
        setAnnPosting(false);
    }

    async function handleDeleteAnnouncement(id) {
        setDeletingAnnId(id);
        try {
            await deleteAnnouncement(id);
            setAnnouncements((prev) => prev.filter((a) => a.id !== id));
        } catch (err) {
            console.error(err);
        }
        setDeletingAnnId(null);
    }

    // ── Render ───────────────────────────────────────────────────────────────
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
        const sc = cases.filter((c) => c.profiles?.user_id === s.user_id);
        const scored = sc.filter((c) => c.score != null);
        const avg = scored.length
            ? (scored.reduce((sum, c) => sum + Number(c.score), 0) / scored.length).toFixed(1)
            : null;
        return { student: s, cases: sc, avg };
    });

    const banner = DISCIPLINE_BANNERS[course.discipline] ?? DEFAULT_BANNER;
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

            {/* ── Layout: side nav + content ───────────────────── */}
            <div className="course-layout">

                {/* ── Side Nav ──────────────────────────────────── */}
                <nav className="course-sidenav" aria-label="Course sections">
                    {/* Instructor card */}
                    <div className="course-sidenav-faculty">
                        <div className="course-detail-faculty-avatar" style={{ width: 36, height: 36, fontSize: "0.8rem" }}>
                            {initials}
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>
                                {instructor ? `${instructor.first_name} ${instructor.last_name}` : "—"}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                Instructor
                            </div>
                        </div>
                    </div>

                    <div className="course-sidenav-divider" />

                    {/* Tab links */}
                    {TABS.filter((tab) => tab.id !== "cases" || isOwner).map((tab) => (
                        <button
                            key={tab.id}
                            className={`course-sidenav-item ${activeTab === tab.id ? "active" : ""} ${tab.disabled ? "course-sidenav-item-disabled" : ""}`}
                            type="button"
                            disabled={tab.disabled}
                            title={tab.disabled ? "Coming soon" : undefined}
                            onClick={() => { if (!tab.disabled) { setActiveTab(tab.id); setBuilderState(null); setAssignState(null); } }}
                        >
                            {tab.label}
                            {tab.id === "cases" && cases.length > 0 && (
                                <span className="course-sidenav-badge">{cases.length}</span>
                            )}
                            {tab.id === "roster" && students.length > 0 && (
                                <span className="course-sidenav-badge">{students.length}</span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* ── Tab Content ───────────────────────────────── */}
                <div className="course-tab-content">

                    {/* ── HOME ── */}
                    {activeTab === "home" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Course Overview</h3>
                                    <p className="course-tab-subtitle">At-a-glance summary of your course</p>
                                </div>
                            </div>

                            {/* Quick stats row */}
                            <div className="course-home-stats">
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value">{students.length}</div>
                                    <div className="course-home-stat-label">Students Enrolled</div>
                                </div>
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value">{cases.length}</div>
                                    <div className="course-home-stat-label">Cases Assigned</div>
                                </div>
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value">{announcements.length}</div>
                                    <div className="course-home-stat-label">Announcements</div>
                                </div>
                            </div>

                            {/* Analytics placeholder */}
                            <div className="course-home-analytics-placeholder">
                                <p className="course-home-analytics-label">Analytics dashboard coming soon</p>
                            </div>
                        </div>
                    )}

                    {/* ── CASES ── */}
                    {activeTab === "cases" && (
                        assignState !== null ? (
                            <CaseAssign
                                embedded
                                templateId={assignState.templateId}
                                fromCourseId={courseId}
                                fromCourseName={course.course_number}
                                onNavigate={onNavigate}
                                onClose={() => setAssignState(null)}
                            />
                        ) : builderState !== null ? (
                            <TemplateBuilder
                                embedded
                                templateId={builderState.templateId}
                                fromCourseId={courseId}
                                fromCourseName={course.course_number}
                                onNavigate={onNavigate}
                                onClose={() => setBuilderState(null)}
                            />
                        ) : (
                            <InstructorCases
                                embedded
                                fromCourseId={courseId}
                                fromCourseName={course.course_number}
                                onNavigate={onNavigate}
                                onOpenBuilder={(templateId) => setBuilderState({ templateId })}
                                onOpenAssign={(templateId) => setAssignState({ templateId })}
                            />
                        )
                    )}

                    {/* ── PATIENTS ── */}
                    {activeTab === "patients" && (
                        <PatientManager
                            embedded
                            onNavigate={(page, id) => {
                                if (page === "patientDetail") {
                                    setPatientModalId(id);
                                } else {
                                    onNavigate(page, id);
                                }
                            }}
                        />
                    )}

                    {/* ── ROSTER ── */}
                    {activeTab === "roster" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Roster</h3>
                                    <p className="course-tab-subtitle">{students.length} student{students.length !== 1 ? "s" : ""} enrolled</p>
                                </div>
                            </div>

                            <div className="course-detail-section">
                                {students.length === 0 ? (
                                    <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                        <div className="patients-empty-icon" aria-hidden="true">👥</div>
                                        <strong>No students enrolled</strong>
                                        <p>Import a roster CSV from the Courses page to enroll students.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 100px", gap: "1rem", padding: "0.6rem 1.25rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                            <span>Student</span>
                                            <span>Cases Assigned</span>
                                            {isOwner && <span />}
                                        </div>
                                        {students.map((s) => {
                                            const studentCases = cases.filter((c) => c.profiles?.user_id === s.user_id);
                                            return (
                                                <div key={s.user_id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 100px", gap: "1rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem", alignItems: "center" }}>
                                                    <span style={{ fontWeight: 500, color: "var(--text)" }}>
                                                        {s.last_name}, {s.first_name}
                                                    </span>
                                                    <span style={{ color: "var(--text-muted)" }}>{studentCases.length}</span>
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
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── GRADEBOOK ── */}
                    {activeTab === "gradebook" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Gradebook</h3>
                                    <p className="course-tab-subtitle">
                                        {gradebook.filter((r) => r.avg !== null).length} of {gradebook.length} student{gradebook.length !== 1 ? "s" : ""} scored
                                    </p>
                                </div>
                            </div>

                            <div className="course-detail-section">
                                {gradebook.length === 0 ? (
                                    <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                        <div className="patients-empty-icon" aria-hidden="true">📊</div>
                                        <strong>No grades yet</strong>
                                        <p>Grades will appear here once students complete and you review their cases.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 100px", gap: "1rem", padding: "0.6rem 1.25rem", background: "#f8fafc", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                            <span>Student</span>
                                            <span>Cases</span>
                                            <span>Completed</span>
                                            <span>Avg Score</span>
                                        </div>
                                        {gradebook.map(({ student, cases: sc, avg }) => {
                                            const completed = sc.filter((c) => c.encounter_status === "completed").length;
                                            const pct = sc.length > 0 ? Math.round((completed / sc.length) * 100) : 0;
                                            return (
                                                <div key={student.user_id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 100px", gap: "1rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem", alignItems: "center" }}>
                                                    <span style={{ fontWeight: 500, color: "var(--text)" }}>
                                                        {student.last_name}, {student.first_name}
                                                    </span>
                                                    <span style={{ color: "var(--text-muted)" }}>{sc.length}</span>
                                                    <div>
                                                        <div style={{ fontSize: "0.8rem", color: completed === sc.length && sc.length > 0 ? "#047857" : "var(--text-muted)", marginBottom: "0.2rem" }}>
                                                            {completed}/{sc.length}
                                                        </div>
                                                        <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                                                            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#047857" : "#0284c7", borderRadius: 2, transition: "width 0.3s" }} />
                                                        </div>
                                                    </div>
                                                    <span style={{ fontWeight: avg !== null ? 600 : 400, color: avg !== null ? "var(--text)" : "var(--text-muted)" }}>
                                                        {avg !== null ? avg : "—"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── ANNOUNCEMENTS ── */}
                    {activeTab === "announcements" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Announcements</h3>
                                    <p className="course-tab-subtitle">Post updates visible to all enrolled students</p>
                                </div>
                                {isOwner && !annComposing && (
                                    <button
                                        className="primary-action-button"
                                        type="button"
                                        onClick={() => setAnnComposing(true)}
                                    >
                                        + New Announcement
                                    </button>
                                )}
                            </div>

                            {/* Compose form */}
                            {annComposing && (
                                <div className="course-detail-section" style={{ marginBottom: "1rem", padding: "1.25rem" }}>
                                    <h4 style={{ margin: "0 0 1rem", fontSize: "0.9rem", fontWeight: 600 }}>New Announcement</h4>
                                    <form onSubmit={handlePostAnnouncement} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                        <div className="student-form-field">
                                            <label>Title</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Midterm case due Friday"
                                                value={annForm.title}
                                                onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))}
                                                disabled={annPosting}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="student-form-field">
                                            <label>Message</label>
                                            <textarea
                                                rows={4}
                                                placeholder="Write your announcement here…"
                                                value={annForm.body}
                                                onChange={(e) => setAnnForm((p) => ({ ...p, body: e.target.value }))}
                                                disabled={annPosting}
                                                style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.875rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", width: "100%", boxSizing: "border-box" }}
                                            />
                                        </div>
                                        {annError && <p className="form-message form-message-error" style={{ margin: 0 }}>{annError}</p>}
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <button className="primary-action-button" type="submit" disabled={annPosting}>
                                                {annPosting ? "Posting…" : "Post"}
                                            </button>
                                            <button
                                                className="secondary-action-button"
                                                type="button"
                                                onClick={() => { setAnnComposing(false); setAnnForm({ title: "", body: "" }); setAnnError(""); }}
                                                disabled={annPosting}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Announcement list */}
                            {announcements.length === 0 && !annComposing ? (
                                <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                    <div className="patients-empty-icon" aria-hidden="true">📢</div>
                                    <strong>No announcements yet</strong>
                                    <p>Post an announcement to notify all students in this course.</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                    {announcements.map((a) => (
                                        <div key={a.id} className="course-detail-section" style={{ padding: "1.25rem" }}>
                                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)", marginBottom: "0.15rem" }}>{a.title}</div>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                        {a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : "Instructor"} · {formatDate(a.created_at)}
                                                    </div>
                                                </div>
                                                {isOwner && (
                                                    <button
                                                        className="secondary-action-button"
                                                        type="button"
                                                        onClick={() => handleDeleteAnnouncement(a.id)}
                                                        disabled={deletingAnnId === a.id}
                                                        style={{ fontSize: "0.75rem", flexShrink: 0, color: "#dc2626" }}
                                                    >
                                                        {deletingAnnId === a.id ? "Deleting…" : "Delete"}
                                                    </button>
                                                )}
                                            </div>
                                            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{a.body}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── SETTINGS ── */}
                    {activeTab === "settings" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Settings</h3>
                                    <p className="course-tab-subtitle">Manage course details and configuration</p>
                                </div>
                            </div>

                            {/* Course details card */}
                            <div className="course-detail-section" style={{ marginBottom: "1rem" }}>
                                <div className="course-detail-section-header">
                                    <h3>Course Details</h3>
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

                                <div style={{ padding: "1.25rem" }}>
                                    {editing ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 480 }}>
                                            <div className="student-form-field">
                                                <label>Course Number</label>
                                                <input
                                                    type="text"
                                                    value={editForm.course_number}
                                                    onChange={(e) => setEditForm((p) => ({ ...p, course_number: e.target.value }))}
                                                    disabled={saving}
                                                    autoFocus
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
                                                <label>Clinical Discipline</label>
                                                <select
                                                    value={editForm.discipline}
                                                    onChange={(e) => setEditForm((p) => ({ ...p, discipline: e.target.value }))}
                                                    disabled={saving}
                                                    className="instructor-search-input"
                                                >
                                                    <option value="">Choose a discipline</option>
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
                                                >
                                                    {saving ? "Saving…" : "Save Changes"}
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
                                        <div style={{ maxWidth: 480 }}>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">Course Number</span>
                                                <span className="course-detail-meta-value">{course.course_number}</span>
                                            </div>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">CRN</span>
                                                <span className="course-detail-meta-value">{course.crn}</span>
                                            </div>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">Discipline</span>
                                                <span className="course-detail-meta-value">{disciplineLabel || "—"}</span>
                                            </div>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">Instructor</span>
                                                <span className="course-detail-meta-value">
                                                    {instructor ? `${instructor.first_name} ${instructor.last_name}` : "—"}
                                                </span>
                                            </div>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">Students Enrolled</span>
                                                <span className="course-detail-meta-value">{students.length}</span>
                                            </div>
                                            <div className="course-detail-meta-row">
                                                <span className="course-detail-meta-label">Cases Assigned</span>
                                                <span className="course-detail-meta-value">{cases.length}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* ── PATIENT DETAIL MODAL ── */}
            {patientModalId && (
                <div className="patient-modal-overlay" onClick={() => setPatientModalId(null)}>
                    <div className="patient-modal-panel" onClick={(e) => e.stopPropagation()}>
                        <PatientDetail
                            id={patientModalId}
                            onNavigate={(page) => {
                                if (page === "patientManager") {
                                    setPatientModalId(null);
                                } else {
                                    onNavigate(page);
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </main>
    );
}
