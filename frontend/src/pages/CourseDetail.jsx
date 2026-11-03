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
    gradeCase,
} from "../services/instructorService.js";
import { getCaseCriteria, previewGrade } from "../lib/grading.js";
import PTSoapNote from "../components/PTSoapNote.jsx";
import DynamicClinicalNoteForm from "../components/DynamicClinicalNoteForm.jsx";
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

    // Gradebook drill-down
    const [gradebookStudent, setGradebookStudent] = useState(null);

    // Grading modal (launched from gradebook)
    const [reviewCase, setReviewCase] = useState(null);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewEditing, setReviewEditing] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [feedback, setFeedback] = useState("");
    const [rubricScores, setRubricScores] = useState({});
    const [annotations, setAnnotations] = useState([]);
    const [annotationDraft, setAnnotationDraft] = useState("");
    const [annotationTarget, setAnnotationTarget] = useState("General");

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

    // ── Grading ──────────────────────────────────────────────────────────────
    function openReview(c) {
        setReviewCase(c);
        setReviewError("");
        setFeedback(c.instructor_feedback ?? "");
        setAnnotations(c.chart_annotations ?? []);
        const criteria = getCaseCriteria(c);
        const saved = c.rubric_scores ?? {};
        const initial = {};
        criteria.forEach((crit) => { initial[crit.key] = saved[crit.key] ?? ""; });
        setRubricScores(initial);
        setAnnotationDraft("");
        setAnnotationTarget("General");
    }

    function closeReview() {
        setReviewCase(null);
        setReviewError("");
        setFeedback("");
        setRubricScores({});
        setAnnotations([]);
        setReviewEditing(false);
    }

    function totalScore() {
        return reviewCase ? previewGrade(getCaseCriteria(reviewCase), rubricScores) : 0;
    }

    function maxScore() {
        if (!reviewCase) return 100;
        return getCaseCriteria(reviewCase).reduce((sum, c) => sum + Number(c.maxPoints), 0);
    }

    function addAnnotation() {
        if (!annotationDraft.trim()) return;
        setAnnotations((prev) => [...prev, { section: annotationTarget, comment: annotationDraft.trim(), at: new Date().toISOString() }]);
        setAnnotationDraft("");
    }

    function removeAnnotation(index) {
        setAnnotations((prev) => prev.filter((_, i) => i !== index));
    }

    function parseEncounterNotes(notes) {
        if (!notes) return null;
        if (typeof notes === "object") return notes;
        try { return JSON.parse(notes); } catch { return null; }
    }

    async function handleGradeSubmit(decision) {
        setReviewSubmitting(true);
        setReviewError("");
        const criteria = getCaseCriteria(reviewCase);
        try {
            const updated = await gradeCase(reviewCase.id, { criteria, rubricScores, chartAnnotations: annotations, feedback, decision });
            setCases((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
            closeReview();
        } catch (err) {
            console.error(err);
            setReviewError(err.message || "Failed to save grade. Please try again.");
        }
        setReviewSubmitting(false);
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

    const uniqueCaseGroups = new Set(cases.map((c) => c.template_id ?? c.id)).size;

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
                            {tab.id === "cases" && uniqueCaseGroups > 0 && (
                                <span className="course-sidenav-badge">{uniqueCaseGroups}</span>
                            )}
                            {tab.id === "roster" && students.length > 0 && (
                                <span className="course-sidenav-badge">{students.length}</span>
                            )}
                            {tab.id === "gradebook" && cases.some((c) => c.encounter_status === "pending review") && (
                                <span className="course-sidenav-badge" style={{ background: "#b45309", color: "#fff" }}>!</span>
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
                                                <div
                                                    key={student.user_id}
                                                    style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 100px", gap: "1rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem", alignItems: "center", cursor: "pointer" }}
                                                    onClick={() => setGradebookStudent(student)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => e.key === "Enter" && setGradebookStudent(student)}
                                                >
                                                    <span style={{ fontWeight: 500, color: "#0284c7", textDecoration: "underline" }}>
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

            {/* ── GRADEBOOK STUDENT MODAL ── */}
            {gradebookStudent && (() => {
                const studentCases = cases.filter((c) => c.profiles?.user_id === gradebookStudent.user_id);
                const scored = studentCases.filter((c) => c.score != null);
                const avg = scored.length
                    ? (scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1)
                    : null;

                const STATUS_STYLES = {
                    "not started":        { background: "#ede9fe", color: "#6d28d9" },
                    "in progress":        { background: "#e0f2fe", color: "#0284c7" },
                    "revision_requested": { background: "#fff7ed", color: "#c2410c" },
                    "pending review":     { background: "#fef3c7", color: "#b45309" },
                    "completed":          { background: "#ecfdf5", color: "#047857" },
                };
                const STATUS_LABELS = {
                    "not started":        "Assigned",
                    "in progress":        "In Progress",
                    "revision_requested": "Revision Requested",
                    "pending review":     "Submitted",
                    "completed":          "Completed",
                };

                return (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setGradebookStudent(null)}>
                        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 20px 60px rgba(15,23,42,0.18)", width: "100%", maxWidth: 680, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>

                            {/* Modal header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "1.25rem 1.5rem", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Gradebook</p>
                                    <h3 style={{ margin: "0.15rem 0 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>
                                        {gradebookStudent.first_name} {gradebookStudent.last_name}
                                    </h3>
                                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        {studentCases.length} case{studentCases.length !== 1 ? "s" : ""}
                                        {avg !== null ? ` · Avg score: ${avg}` : ""}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="instructor-baseline-remove"
                                    onClick={() => setGradebookStudent(null)}
                                    aria-label="Close"
                                    style={{ width: 32, height: 32, fontSize: "1.2rem", flexShrink: 0 }}
                                >×</button>
                            </div>

                            {/* Modal body */}
                            <div style={{ overflowY: "auto", padding: "1rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                                {studentCases.length === 0 ? (
                                    <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>No cases assigned to this student.</p>
                                ) : studentCases.map((c) => {
                                    const snap = c.patient_snapshot ?? c.patient_templates ?? {};
                                    const hasGrade = c.score != null;
                                    const hasFeedback = c.instructor_feedback || c.chart_annotations?.length > 0;
                                    const statusStyle = STATUS_STYLES[c.encounter_status] ?? STATUS_STYLES["not started"];

                                    return (
                                        <div key={c.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "0.875rem 1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>
                                                        {snap.first_name} {snap.last_name}
                                                    </div>
                                                    {snap.chief_complaint && (
                                                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                                                            {snap.chief_complaint}
                                                        </div>
                                                    )}
                                                    <div style={{ marginTop: "0.35rem" }}>
                                                        <span className="instructor-status-badge" style={statusStyle}>
                                                            {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                                                    {hasGrade ? (
                                                        <>
                                                            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                                                                {c.score}<span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--text-muted)" }}>/{c.max_score ?? 100}</span>
                                                            </div>
                                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                                {Math.round((c.score / (c.max_score ?? 100)) * 100)}%
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                                            {c.encounter_status === "completed" ? "No score recorded" : "Not graded yet"}
                                                        </span>
                                                    )}
                                                    {(c.encounter_status === "pending review" || c.encounter_status === "completed") && (
                                                        <button
                                                            type="button"
                                                            className="instructor-action-btn instructor-action-edit"
                                                            onClick={() => openReview(c)}
                                                        >
                                                            {c.encounter_status === "pending review" ? "Grade" : "View"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {hasFeedback && (
                                                <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 1rem", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                                                    {c.instructor_feedback && (
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Instructor Feedback</div>
                                                            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{c.instructor_feedback}</p>
                                                        </div>
                                                    )}
                                                    {c.chart_annotations?.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Chart Annotations</div>
                                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                                                {c.chart_annotations.map((a, i) => (
                                                                    <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "0.4rem 0.7rem", fontSize: "0.84rem" }}>
                                                                        <strong style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#64748b" }}>{a.section}: </strong>
                                                                        {a.comment}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {!hasFeedback && ["pending review", "completed"].includes(c.encounter_status) && (
                                                <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.6rem 1rem", background: "#f8fafc" }}>
                                                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                                        {c.encounter_status === "pending review" ? "Awaiting review." : "No feedback recorded."}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── GRADING MODAL (from gradebook) ── */}
            {reviewCase && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210 }} onClick={closeReview}>
                    <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 20px 60px rgba(15,23,42,0.18)", width: "100%", maxWidth: 1080, height: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>

                        <div className="case-modal-header">
                            <div>
                                <p className="section-title" style={{ margin: 0 }}>Case Review</p>
                                <h3 style={{ margin: "0.2rem 0 0" }}>
                                    {reviewCase.patient_snapshot?.first_name} {reviewCase.patient_snapshot?.last_name}
                                </h3>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                <span className="instructor-status-badge" style={{ "not started": { background: "#f1f5f9", color: "#64748b" }, "in progress": { background: "#e0f2fe", color: "#0284c7" }, "revision_requested": { background: "#fff7ed", color: "#c2410c" }, "pending review": { background: "#fef3c7", color: "#b45309" }, "completed": { background: "#ecfdf5", color: "#047857" } }[reviewCase.encounter_status] ?? { background: "#f1f5f9", color: "#64748b" }}>
                                    {{ "not started": "Not Started", "in progress": "In Progress", "revision_requested": "Revision Requested", "pending review": "Pending Review", "completed": "Completed" }[reviewCase.encounter_status] ?? reviewCase.encounter_status}
                                </span>
                                <button className="instructor-baseline-remove" type="button" onClick={closeReview} aria-label="Close" style={{ width: 32, height: 32, fontSize: "1.2rem" }}>×</button>
                            </div>
                        </div>

                        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                            {/* Left — student note */}
                            <div style={{ flex: "0 0 58%", overflowY: "auto", padding: "1.25rem", borderRight: "1px solid #e2e8f0" }}>
                                <p className="case-modal-section-label">Patient Info</p>
                                <div className="case-info-grid" style={{ marginBottom: "1rem" }}>
                                    {reviewCase.patient_snapshot?.age && <div className="case-info-item"><span className="case-info-label">Age</span><span>{reviewCase.patient_snapshot.age}</span></div>}
                                    {reviewCase.patient_snapshot?.sex && <div className="case-info-item"><span className="case-info-label">Sex</span><span>{reviewCase.patient_snapshot.sex}</span></div>}
                                    {reviewCase.patient_snapshot?.occupation && <div className="case-info-item"><span className="case-info-label">Occupation</span><span>{reviewCase.patient_snapshot.occupation}</span></div>}
                                </div>
                                {reviewCase.patient_snapshot?.chief_complaint && (
                                    <div className="case-complaint-box" style={{ marginBottom: "1rem" }}>
                                        <span className="case-info-label">Chief Complaint</span>
                                        <p>{reviewCase.patient_snapshot.chief_complaint}</p>
                                    </div>
                                )}
                                {reviewCase.patient_snapshot?.clinical_baseline && Object.keys(reviewCase.patient_snapshot.clinical_baseline).length > 0 && (
                                    <div style={{ marginBottom: "1rem" }}>
                                        <p className="case-modal-section-label">Clinical Baseline</p>
                                        <div className="case-baseline-grid">
                                            {Object.entries(reviewCase.patient_snapshot.clinical_baseline).map(([k, v]) => (
                                                <div key={k} className="case-baseline-item"><span className="case-info-label">{k}</span><span>{v}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="case-modal-section-label">Student Encounter Notes</p>
                                <div className="case-notes-readonly">
                                    {(() => {
                                        const parsed = parseEncounterNotes(reviewCase.encounter_notes);
                                        if (parsed?.format === "clinical-note-v1") {
                                            if (!parsed.template || !Array.isArray(parsed.template.fields) || !parsed.data) {
                                                return <p className="form-message form-message-error">Saved data is incomplete or invalid.</p>;
                                            }
                                            return <DynamicClinicalNoteForm template={parsed.template} value={parsed.data} readOnly={true} />;
                                        }
                                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && ("subjective" in parsed || "objective" in parsed || "assessment" in parsed || "plan" in parsed)) {
                                            return <PTSoapNote value={parsed} readOnly={true} />;
                                        }
                                        if (typeof reviewCase.encounter_notes === "string") {
                                            return reviewCase.encounter_notes || <em style={{ color: "var(--text-muted)" }}>No notes recorded.</em>;
                                        }
                                        return <em style={{ color: "var(--text-muted)" }}>No notes recorded.</em>;
                                    })()}
                                </div>

                                {annotations.length > 0 && (
                                    <div style={{ marginTop: "1.25rem" }}>
                                        <p className="case-modal-section-label">Chart Annotations</p>
                                        {annotations.map((a, i) => (
                                            <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "0.6rem 0.75rem", marginBottom: "0.5rem" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.section}</span>
                                                    {reviewCase.encounter_status === "pending review" && (
                                                        <button type="button" onClick={() => removeAnnotation(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1rem", lineHeight: 1 }} aria-label="Remove">×</button>
                                                    )}
                                                </div>
                                                <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem" }}>{a.comment}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {reviewCase.encounter_status === "pending review" && (
                                    <div style={{ marginTop: "1.25rem" }}>
                                        <p className="case-modal-section-label">Add Chart Annotation</p>
                                        <select value={annotationTarget} onChange={(e) => setAnnotationTarget(e.target.value)} className="instructor-search-input" style={{ marginBottom: "0.5rem" }}>
                                            <option>General</option><option>Subjective</option><option>Objective</option><option>Assessment</option><option>Plan</option><option>Medications</option><option>Allergies</option>
                                        </select>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <input type="text" className="instructor-search-input" placeholder="e.g. Missing pain scale in subjective section" value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAnnotation()} style={{ flex: 1 }} />
                                            <button type="button" className="secondary-action-button" onClick={addAnnotation}>Add</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right — rubric */}
                            <div style={{ flex: "0 0 42%", overflowY: "auto", padding: "1.25rem", background: "#f8fafc" }}>
                                {(reviewCase.patient_snapshot?.expectations_rubric) && (
                                    <div style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
                                        <p className="case-modal-section-label" style={{ color: "#0369a1", marginBottom: "0.3rem" }}>Expectations & Milestones</p>
                                        <p style={{ margin: 0, fontSize: "0.82rem", color: "#0f172a", whiteSpace: "pre-wrap" }}>{reviewCase.patient_snapshot.expectations_rubric}</p>
                                    </div>
                                )}

                                <p className="case-modal-section-label">Rubric Scoring</p>
                                <div style={{ marginBottom: "1rem" }}>
                                    {getCaseCriteria(reviewCase).map((crit) => (
                                        <div key={crit.key} style={{ marginBottom: "1rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                                                <label htmlFor={`gb-rubric-${crit.key}`} style={{ fontWeight: 500, fontSize: "0.875rem" }}>{crit.label}</label>
                                                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/ {crit.maxPoints} pts</span>
                                            </div>
                                            <input
                                                id={`gb-rubric-${crit.key}`}
                                                type="number" step="0.01" min={0} max={crit.maxPoints}
                                                value={rubricScores[crit.key] ?? ""}
                                                onChange={(e) => setRubricScores((prev) => ({ ...prev, [crit.key]: e.target.value }))}
                                                disabled={reviewSubmitting || (reviewCase.encounter_status !== "pending review" && !reviewEditing)}
                                                className="instructor-search-input" style={{ width: "100%" }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "0.5rem" }}>
                                    <span>Total Score</span>
                                    <strong style={{ fontSize: "1.25rem" }}>{totalScore()} / {maxScore()}</strong>
                                </div>

                                <div style={{ marginTop: "1.25rem" }}>
                                    <p className="case-modal-section-label">Overall Feedback</p>
                                    {(reviewCase.encounter_status === "pending review" || reviewEditing) ? (
                                        <textarea className="instructor-feedback-textarea" placeholder="Leave overall comments for the student…" value={feedback} onChange={(e) => setFeedback(e.target.value)} disabled={reviewSubmitting} rows={5} />
                                    ) : (
                                        <div className="case-notes-readonly">{reviewCase.instructor_feedback || <em style={{ color: "var(--text-muted)" }}>No feedback left.</em>}</div>
                                    )}
                                </div>

                                {reviewCase.profiles && (
                                    <div style={{ marginTop: "1rem" }}>
                                        <p className="case-modal-section-label">Submitted By</p>
                                        <p style={{ margin: 0 }}>{reviewCase.profiles.first_name} {reviewCase.profiles.last_name}</p>
                                    </div>
                                )}

                                {reviewError && <p className="form-message form-message-error" role="alert" style={{ marginTop: "1rem" }}>{reviewError}</p>}

                                {reviewCase.encounter_status === "pending review" && (
                                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                                        <button className="secondary-action-button" type="button" onClick={() => handleGradeSubmit("return")} disabled={reviewSubmitting} style={{ flex: 1 }}>
                                            {reviewSubmitting ? "Saving…" : "Return for Revision"}
                                        </button>
                                        <button className="primary-action-button" type="button" onClick={() => handleGradeSubmit("approve")} disabled={reviewSubmitting} style={{ flex: 1 }}>
                                            {reviewSubmitting ? "Saving…" : "Approve & Sign Off"}
                                        </button>
                                    </div>
                                )}
                                {reviewCase.encounter_status === "completed" && !reviewEditing && (
                                    <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                                        <p style={{ margin: 0, color: "var(--success-text)", fontSize: "0.85rem", fontWeight: 600 }}>Signed off — this case is complete.</p>
                                        <button className="secondary-action-button" type="button" onClick={() => setReviewEditing(true)}>
                                            Edit Grade
                                        </button>
                                    </div>
                                )}
                                {reviewCase.encounter_status === "completed" && reviewEditing && (
                                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                                        <button className="secondary-action-button" type="button" onClick={() => setReviewEditing(false)} disabled={reviewSubmitting} style={{ flex: 1 }}>
                                            Cancel
                                        </button>
                                        <button className="primary-action-button" type="button" onClick={() => handleGradeSubmit("approve")} disabled={reviewSubmitting} style={{ flex: 1 }}>
                                            {reviewSubmitting ? "Saving…" : "Save Grade"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
