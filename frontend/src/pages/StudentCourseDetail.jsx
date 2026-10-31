import { useEffect, useState } from "react";
import { getMyCourseCases, getCourseAnnouncements } from "../services/instructorService.js";
import { supabase } from "../supabase.js";

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

const STATUS_LABELS = {
    "not started":        "Not Started",
    "in progress":        "In Progress",
    "revision_requested": "Needs Revision",
    "pending review":     "Pending Review",
    "completed":          "Completed",
};

const STATUS_COLORS = {
    "not started":        "#64748b",
    "in progress":        "#0284c7",
    "revision_requested": "#d97706",
    "pending review":     "#7c3aed",
    "completed":          "#047857",
};

const TABS = [
    { id: "home",          label: "Home"          },
    { id: "cases",         label: "Cases"         },
    { id: "announcements", label: "Announcements" },
];

function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isDueSoon(iso) {
    if (!iso) return false;
    const diff = new Date(iso) - new Date();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

function isOverdue(iso, status) {
    if (!iso || status === "completed") return false;
    return new Date(iso) < new Date();
}

export default function StudentCourseDetail({ course, onNavigate }) {
    const [cases, setCases] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("home");

    useEffect(() => {
        getMyCourseCases(course.id)
            .then(setCases)
            .catch((err) => { console.error(err); setError("Failed to load cases."); })
            .finally(() => setLoading(false));

        getCourseAnnouncements(course.id)
            .then(setAnnouncements)
            .catch(() => {});
    }, [course.id]);

    const instructor = course.profiles;
    const banner = DISCIPLINE_BANNERS[course.discipline] ?? DEFAULT_BANNER;
    const abbr = course.discipline ? (DISCIPLINE_ABBR[course.discipline] ?? course.discipline) : null;
    const initials = instructor
        ? `${instructor.first_name?.[0] ?? ""}${instructor.last_name?.[0] ?? ""}`.toUpperCase()
        : "?";

    const completed    = cases.filter((c) => c.encounter_status === "completed").length;
    const needsRevision = cases.filter((c) => c.encounter_status === "revision_requested").length;
    const scored       = cases.filter((c) => c.score != null);
    const avgScore     = scored.length
        ? (scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1)
        : null;
    const upcoming     = cases
        .filter((c) => c.encounter_status !== "completed" && c.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    if (loading) {
        return (
            <main className="instructor-main">
                <p className="instructor-loading">Loading…</p>
            </main>
        );
    }

    return (
        <main style={{ paddingBottom: "2rem" }}>
            {/* ── Banner ──────────────────────────────────────── */}
            <div className="course-detail-banner" style={{ background: banner }}>
                <div style={{ maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
                    <button
                        className="secondary-action-button"
                        type="button"
                        onClick={() => onNavigate("studentCourses")}
                        style={{ marginBottom: "1rem", background: "rgba(0,0,0,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
                    >
                        ← My Courses
                    </button>
                    {abbr && (
                        <p className="course-detail-crn" style={{ opacity: 0.85 }}>{abbr}</p>
                    )}
                    <p className="course-detail-crn">CRN {course.crn}</p>
                    <h2 className="course-detail-title">{course.course_number}</h2>
                </div>
            </div>

            {error && <p className="form-message form-message-error" style={{ margin: "1rem 2rem" }}>{error}</p>}

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
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            className={`course-sidenav-item ${activeTab === tab.id ? "active" : ""}`}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            {tab.id === "cases" && cases.length > 0 && (
                                <span className="course-sidenav-badge">{cases.length}</span>
                            )}
                            {tab.id === "announcements" && announcements.length > 0 && (
                                <span className="course-sidenav-badge">{announcements.length}</span>
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
                                    <p className="course-tab-subtitle">Your progress at a glance</p>
                                </div>
                            </div>

                            {/* Progress stat cards */}
                            <div className="course-home-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value">{cases.length}</div>
                                    <div className="course-home-stat-label">Cases Assigned</div>
                                </div>
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value" style={{ color: completed > 0 ? "#047857" : "inherit" }}>
                                        {completed}/{cases.length}
                                    </div>
                                    <div className="course-home-stat-label">Completed</div>
                                </div>
                                <div className="course-home-stat-card">
                                    <div className="course-home-stat-value">{avgScore ?? "—"}</div>
                                    <div className="course-home-stat-label">Avg Score</div>
                                </div>
                            </div>

                            {/* Upcoming deadlines */}
                            {upcoming.length > 0 && (
                                <div className="course-detail-section" style={{ margin: "0 1.25rem 0.75rem" }}>
                                    <div className="course-detail-section-header">
                                        <h3>Upcoming Deadlines</h3>
                                    </div>
                                    <div style={{ padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                                        {upcoming.slice(0, 4).map((c) => {
                                            const overdue = isOverdue(c.due_date, c.encounter_status);
                                            const soon = isDueSoon(c.due_date);
                                            return (
                                                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
                                                    <span style={{ fontWeight: 500, color: "var(--text)" }}>
                                                        {c.patient_snapshot?.first_name} {c.patient_snapshot?.last_name}
                                                    </span>
                                                    <span style={{ color: overdue ? "#dc2626" : soon ? "#d97706" : "var(--text-muted)", fontWeight: overdue || soon ? 600 : 400 }}>
                                                        {formatDate(c.due_date)}{overdue ? " — Overdue" : soon ? " — Due Soon" : ""}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Needs revision alert */}
                            {needsRevision > 0 && (
                                <div style={{ margin: "0 1.25rem 0.75rem", padding: "0.75rem 1rem", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: "0.85rem", color: "#92400e" }}>
                                    {needsRevision} case{needsRevision > 1 ? "s" : ""} need{needsRevision === 1 ? "s" : ""} revision — check your feedback.
                                </div>
                            )}

                            {/* Course info */}
                            <div className="course-detail-section" style={{ margin: "0 1.25rem 1.25rem" }}>
                                <div className="course-detail-section-header">
                                    <h3>Course Details</h3>
                                </div>
                                <div style={{ padding: "0.75rem 1.25rem" }}>
                                    <div className="course-detail-meta-row">
                                        <span className="course-detail-meta-label">Course</span>
                                        <span className="course-detail-meta-value">{course.course_number}</span>
                                    </div>
                                    <div className="course-detail-meta-row">
                                        <span className="course-detail-meta-label">CRN</span>
                                        <span className="course-detail-meta-value">{course.crn}</span>
                                    </div>
                                    {abbr && (
                                        <div className="course-detail-meta-row">
                                            <span className="course-detail-meta-label">Discipline</span>
                                            <span className="course-detail-meta-value">{abbr}</span>
                                        </div>
                                    )}
                                    <div className="course-detail-meta-row">
                                        <span className="course-detail-meta-label">Instructor</span>
                                        <span className="course-detail-meta-value">
                                            {instructor ? `${instructor.first_name} ${instructor.last_name}` : "—"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── CASES ── */}
                    {activeTab === "cases" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">My Cases</h3>
                                    <p className="course-tab-subtitle">{cases.length} case{cases.length !== 1 ? "s" : ""} assigned</p>
                                </div>
                            </div>

                            {cases.length === 0 ? (
                                <div className="patients-empty-state">
                                    <strong>No cases assigned yet.</strong>
                                    <p>Your instructor hasn't assigned any cases for this course.</p>
                                </div>
                            ) : (
                                <div className="course-detail-section" style={{ margin: "0 1.25rem 1.25rem" }}>
                                    <div className="course-detail-case-row" style={{ background: "#f8fafc", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", gridTemplateColumns: "1fr 120px 110px 70px" }}>
                                        <span>Patient / Case</span>
                                        <span>Due</span>
                                        <span>Status</span>
                                        <span>Score</span>
                                    </div>
                                    {cases.map((c) => {
                                        const overdue = isOverdue(c.due_date, c.encounter_status);
                                        const soon = isDueSoon(c.due_date);
                                        return (
                                            <div
                                                key={c.id}
                                                className="course-detail-case-row"
                                                style={{ gridTemplateColumns: "1fr 120px 110px 70px", cursor: "pointer" }}
                                                onClick={() => onNavigate("studentCases", null, { openCaseId: c.id, fromCourse: course })}
                                            >
                                                <div>
                                                    <div className="course-detail-case-patient">
                                                        {c.patient_snapshot?.first_name} {c.patient_snapshot?.last_name}
                                                    </div>
                                                    <div className="course-detail-case-complaint">
                                                        {c.patient_snapshot?.chief_complaint}
                                                    </div>
                                                    {c.encounter_status === "revision_requested" && c.instructor_feedback && (
                                                        <div style={{ fontSize: "0.75rem", color: "#d97706", marginTop: "0.2rem" }}>
                                                            Feedback: {c.instructor_feedback}
                                                        </div>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: "0.8rem", color: overdue ? "#dc2626" : soon ? "#d97706" : "var(--text-muted)", fontWeight: overdue || soon ? 600 : 400 }}>
                                                    {c.due_date ? formatDate(c.due_date) : "—"}
                                                    {overdue && " (Overdue)"}
                                                    {!overdue && soon && " (Soon)"}
                                                </span>
                                                <span style={{ color: STATUS_COLORS[c.encounter_status] ?? "#64748b", fontWeight: 500, fontSize: "0.8rem" }}>
                                                    {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                                </span>
                                                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                                                    {c.score != null ? c.score : "—"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── ANNOUNCEMENTS ── */}
                    {activeTab === "announcements" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Announcements</h3>
                                    <p className="course-tab-subtitle">Messages from your instructor</p>
                                </div>
                            </div>

                            {announcements.length === 0 ? (
                                <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                    <strong>No announcements yet.</strong>
                                    <p>Your instructor hasn't posted any announcements.</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0 1.25rem 1.25rem" }}>
                                    {announcements.map((a) => (
                                        <div key={a.id} className="course-detail-section" style={{ padding: "1.25rem" }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)", marginBottom: "0.15rem" }}>
                                                {a.title}
                                            </div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                                                {a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : "Instructor"} · {formatDate(a.created_at)}
                                            </div>
                                            <p style={{ fontSize: "0.875rem", color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>
                                                {a.body}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </main>
    );
}
