import { useEffect, useState } from "react";
import { getMyCourseCases } from "../services/instructorService.js";
import { getMyActiveSimulations, getOpenLobbiesForCourse, getMyLobbyMembership, joinSimLobby, getMySimsForCourse, getMySimSummary, getMySimGradesForCourse } from "../services/simulationService.js";
import StudentCases from "./StudentCases.jsx";

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
    pharmacy: "PHARM",
    nursing: "NURS",
    physical_therapy: "PT",
    occupational_therapy: "OT",
    psychology: "PSYC",
    psychiatry: "PSYC",
    speech_language_pathology: "SLP",
    social_work: "SW",
    inpatient_physician: "MD",
};


const STATUS_STYLES = {
    "not started": { background: "#ede9fe", color: "#6d28d9" },
    "in progress": { background: "#e0f2fe", color: "#0284c7" },
    "revision_requested": { background: "#fff7ed", color: "#c2410c" },
    "pending review": { background: "#fef3c7", color: "#b45309" },
    "completed": { background: "#ecfdf5", color: "#047857" },
};

const STATUS_LABELS = {
    "not started": "Assigned",
    "in progress": "In Progress",
    "revision_requested": "Revision Requested",
    "pending review": "Submitted",
    "completed": "Completed",
};

const TABS = [
    { id: "home", label: "Home" },
    { id: "cases", label: "Cases" },
    { id: "gradebook", label: "Gradebook" },
    { id: "simulations", label: "Simulations" },
    { id: "announcements", label: "Announcements", disabled: true },
];

const SIM_STATUS_BADGE = {
    lobby:  { label: "Lobby",  background: "#fef9c3", color: "#854d0e" },
    active: { label: "Active", background: "#dcfce7", color: "#15803d" },
    ended:  { label: "Ended",  background: "#f1f5f9", color: "#64748b" },
};

function formatSimDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
    const [activeSims, setActiveSims] = useState([]);
    const [openLobbies, setOpenLobbies] = useState([]);
    const [joiningLobby, setJoiningLobby] = useState(null);
    const [mySims, setMySims] = useState([]);
    const [mySimGrades, setMySimGrades] = useState([]);
    const [expandedSimId, setExpandedSimId] = useState(null);
    const [simSummaries, setSimSummaries] = useState({});

    async function handleExpandSim(simId) {
        if (expandedSimId === simId) { setExpandedSimId(null); return; }
        setExpandedSimId(simId);
        if (!simSummaries[simId]) {
            const summary = await getMySimSummary(simId).catch(() => null);
            if (summary) setSimSummaries(prev => ({ ...prev, [simId]: summary }));
        }
    }

    useEffect(() => {
        getMyActiveSimulations()
            .then(sims => setActiveSims(sims.filter(s => s.simulations?.course_id === course.id)))
            .catch(() => {});
        getOpenLobbiesForCourse(course.id)
            .then(setOpenLobbies)
            .catch(() => {});
        getMySimsForCourse(course.id)
            .then(setMySims)
            .catch(() => {});
        getMySimGradesForCourse(course.id)
            .then(setMySimGrades)
            .catch(() => {});
    }, [course.id]);

    async function handleJoinLobby(simId) {
        setJoiningLobby(simId);
        try {
            await joinSimLobby(simId);
            onNavigate("simulationLobbyWaiting", simId);
        } catch (e) {
            setJoiningLobby(null);
        }
    }

    useEffect(() => {
        getMyCourseCases(course.id)
            .then(setCases)
            .catch((err) => { console.error(err); setError("Failed to load cases."); })
            .finally(() => setLoading(false));
    }, [course.id]);

    const instructor = course.profiles;
    const banner = DISCIPLINE_BANNERS[course.discipline] ?? DEFAULT_BANNER;
    const abbr = course.discipline ? (DISCIPLINE_ABBR[course.discipline] ?? course.discipline) : null;
    const initials = instructor
        ? `${instructor.first_name?.[0] ?? ""}${instructor.last_name?.[0] ?? ""}`.toUpperCase()
        : "?";

    const completed = cases.filter((c) => c.encounter_status === "completed").length;
    const needsRevision = cases.filter((c) => c.encounter_status === "revision_requested").length;
    const scored = cases.filter((c) => c.score != null);
    const avgScore = scored.length
        ? (scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1)
        : null;
    const upcoming = cases
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

            {openLobbies.map(sim => (
                <div key={sim.id}
                    style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px",
                        padding: "0.75rem 1.25rem", margin: "1rem 2rem 0",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                    <span style={{ fontWeight: 600, color: "#854d0e" }}>
                        Lobby open: {sim.title}
                    </span>
                    <button type="button" className="primary-button"
                        style={{ padding: "0.35rem 0.9rem", fontSize: "0.875rem", background: "#d97706" }}
                        disabled={joiningLobby === sim.id}
                        onClick={() => handleJoinLobby(sim.id)}>
                        {joiningLobby === sim.id ? "Joining…" : "Join lobby →"}
                    </button>
                </div>
            ))}
            {activeSims.map(p => (
                <div key={p.simulation_id}
                    style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px",
                        padding: "0.75rem 1.25rem", margin: "1rem 2rem",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                    <span style={{ fontWeight: 600, color: "#15803d" }}>
                        Active simulation: {p.simulations?.title}
                    </span>
                    <button type="button" className="primary-button"
                        style={{ padding: "0.35rem 0.9rem", fontSize: "0.875rem" }}
                        onClick={() => onNavigate("simulationLobby", p.simulation_id)}>
                        Join →
                    </button>
                </div>
            ))}

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
                            className={`course-sidenav-item ${activeTab === tab.id ? "active" : ""} ${tab.disabled ? "course-sidenav-item-disabled" : ""}`}
                            type="button"
                            onClick={() => !tab.disabled && setActiveTab(tab.id)}
                            disabled={tab.disabled}
                            title={tab.disabled ? "Coming soon" : undefined}
                        >
                            {tab.label}
                            {tab.id === "cases" && cases.length > 0 && (
                                <span className="course-sidenav-badge">{cases.length}</span>
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
                                                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }} onClick={() => setActiveTab("cases")}>
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
                        <StudentCases
                            embedded
                            fromCourse={course}
                            onNavigate={onNavigate}
                        />
                    )}

                    {/* ── GRADEBOOK ── */}
                    {activeTab === "gradebook" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Gradebook</h3>
                                    <p className="course-tab-subtitle">Your scores and instructor feedback</p>
                                </div>
                            </div>

                            {cases.length === 0 && mySimGrades.length === 0 ? (
                                <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                    <strong>No grades yet.</strong>
                                    <p>Your instructor hasn't assigned any cases or simulations to this course.</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0 1.25rem 1.25rem" }}>

                                    {/* ── Cases ── */}
                                    {cases.length > 0 && (
                                        <>
                                            <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Cases</p>
                                            {cases.map((c) => {
                                                const snap = c.patient_snapshot ?? {};
                                                const hasGrade = c.score != null;
                                                const hasFeedback = c.instructor_feedback || c.chart_annotations?.length > 0;
                                                const statusStyle = STATUS_STYLES[c.encounter_status] ?? STATUS_STYLES["not started"];
                                                return (
                                                    <div key={c.id} className="course-detail-section">
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "1rem 1.25rem", gap: "0.75rem" }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                                                                    <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0.1rem 0.45rem", borderRadius: "4px", background: "#e0f2fe", color: "#0369a1" }}>Case</span>
                                                                </div>
                                                                <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)" }}>
                                                                    {snap.first_name} {snap.last_name}
                                                                </div>
                                                                {snap.chief_complaint && (
                                                                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                        {snap.chief_complaint}
                                                                    </div>
                                                                )}
                                                                <div style={{ marginTop: "0.4rem" }}>
                                                                    <span className="instructor-status-badge" style={statusStyle}>
                                                                        {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div style={{ flexShrink: 0, textAlign: "right" }}>
                                                                {hasGrade ? (
                                                                    <>
                                                                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                                                                            {c.score}<span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--text-muted)" }}>/{c.max_score ?? 100}</span>
                                                                        </div>
                                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                                                                            {Math.round((c.score / (c.max_score ?? 100)) * 100)}%
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                                                        {c.encounter_status === "completed" ? "No score recorded" : "Not graded yet"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {hasFeedback && (
                                                            <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.875rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                                {c.instructor_feedback && (
                                                                    <div>
                                                                        <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Instructor Feedback</div>
                                                                        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{c.instructor_feedback}</p>
                                                                    </div>
                                                                )}
                                                                {c.chart_annotations?.length > 0 && (
                                                                    <div>
                                                                        <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Chart Annotations</div>
                                                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                                                            {c.chart_annotations.map((a, i) => (
                                                                                <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.5rem 0.75rem", fontSize: "0.875rem" }}>
                                                                                    <strong style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b" }}>{a.section}: </strong>
                                                                                    {a.comment}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {!hasFeedback && ["pending review", "completed"].includes(c.encounter_status) && (
                                                            <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 1.25rem" }}>
                                                                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                                                    {c.encounter_status === "pending review" ? "Awaiting instructor review." : "No feedback recorded."}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* ── Simulations ── */}
                                    {mySimGrades.length > 0 && (
                                        <>
                                            <p style={{ margin: cases.length > 0 ? "0.5rem 0 0" : "0.25rem 0 0", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>Simulations</p>
                                            {mySimGrades.map((p) => {
                                                const sim = p.simulations;
                                                const graded = !!p.reviewed_at;
                                                const score = p.rubric_scores?.score;
                                                const SIM_ROLE_LABEL = { med: "Med Student", front_desk: "Front Desk", patient_actor: "Patient Actor", observer: "Observer" };
                                                return (
                                                    <div key={p.simulation_id} className="course-detail-section">
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "1rem 1.25rem", gap: "0.75rem" }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                                                                    <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0.1rem 0.45rem", borderRadius: "4px", background: "#ede9fe", color: "#7c3aed" }}>Simulation</span>
                                                                </div>
                                                                <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)" }}>{sim?.title ?? "Simulation"}</div>
                                                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                                                    {SIM_ROLE_LABEL[p.sim_role] ?? p.sim_role}
                                                                    {sim?.ended_at ? ` · ${formatSimDate(sim.ended_at)}` : ""}
                                                                </div>
                                                                <div style={{ marginTop: "0.4rem" }}>
                                                                    <span className="instructor-status-badge" style={graded ? { background: "#ecfdf5", color: "#047857" } : { background: "#fef3c7", color: "#b45309" }}>
                                                                        {graded ? "Graded" : "Pending Grade"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {graded && score != null && (
                                                                <div style={{ flexShrink: 0, textAlign: "right" }}>
                                                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                                                                        {score}<span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--text-muted)" }}>/100</span>
                                                                    </div>
                                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{score}%</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {graded && p.instructor_feedback && (
                                                            <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.875rem 1.25rem" }}>
                                                                <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Instructor Feedback</div>
                                                                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{p.instructor_feedback}</p>
                                                            </div>
                                                        )}
                                                        {graded && !p.instructor_feedback && (
                                                            <div style={{ borderTop: "1px solid #e2e8f0", padding: "0.75rem 1.25rem" }}>
                                                                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>No feedback recorded.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── SIMULATIONS ── */}
                    {activeTab === "simulations" && (
                        <div>
                            <div className="course-tab-header">
                                <div>
                                    <h3 className="course-tab-title">Simulations</h3>
                                    <p className="course-tab-subtitle">Simulations you have participated in</p>
                                </div>
                            </div>

                            {mySims.length === 0 ? (
                                <div className="patients-empty-state" style={{ padding: "3rem 1.25rem" }}>
                                    <strong>No simulations yet.</strong>
                                    <p>You haven't participated in any simulations for this course.</p>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0 1.25rem 1.25rem" }}>
                                    {mySims.map(sim => {
                                        const badge = SIM_STATUS_BADGE[sim.status] ?? SIM_STATUS_BADGE.ended;
                                        const isOpen = expandedSimId === sim.id;
                                        const summary = simSummaries[sim.id];

                                        // Build per-round activity from summary
                                        const rounds = summary
                                            ? summary.participants.map(p => {
                                                const medEncs = summary.medEncounters.filter(e => e.round === p.round);
                                                const fdEncs  = summary.frontDeskEncounters.filter(e => e.round === p.round);
                                                const actEncs = summary.actorEncounters.filter(e => e.round === p.round);
                                                return { ...p, medEncs, fdEncs, actEncs };
                                            })
                                            : [];

                                        return (
                                            <div key={sim.id} className="course-detail-section">
                                                {/* Header row — click to expand */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleExpandSim(sim.id)}
                                                    style={{
                                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                                        padding: "0.875rem 1.25rem", width: "100%", textAlign: "left",
                                                        background: "none", border: "none", cursor: "pointer", gap: "1rem"
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)" }}>
                                                            {sim.title}
                                                        </div>
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                                                            {sim.started_at ? `Started ${formatSimDate(sim.started_at)}` : `Created ${formatSimDate(sim.created_at)}`}
                                                            {sim.ended_at ? ` · Ended ${formatSimDate(sim.ended_at)}` : ""}
                                                            {sim.current_round > 1 ? ` · ${sim.current_round} rounds` : ""}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                                                        <span style={{
                                                            ...badge,
                                                            padding: "0.2rem 0.65rem", borderRadius: "999px",
                                                            fontSize: "0.72rem", fontWeight: 600
                                                        }}>
                                                            {badge.label}
                                                        </span>
                                                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                            {isOpen ? "▲" : "▼"}
                                                        </span>
                                                    </div>
                                                </button>

                                                {/* Expanded detail */}
                                                {isOpen && (
                                                    <div style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                                                        {!summary && (
                                                            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading…</p>
                                                        )}
                                                        {summary && rounds.length === 0 && (
                                                            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>No participation data found.</p>
                                                        )}
                                                        {rounds.map((r, i) => (
                                                            <div key={i}>
                                                                {rounds.length > 1 && (
                                                                    <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                                                                        Round {r.round}
                                                                    </div>
                                                                )}

                                                                {/* Role badge */}
                                                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                                                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</span>
                                                                    <span style={{
                                                                        fontSize: "0.78rem", fontWeight: 600, padding: "0.15rem 0.55rem", borderRadius: "999px",
                                                                        ...(r.sim_role === "med"           ? { background: "#e0f2fe", color: "#0369a1" } :
                                                                            r.sim_role === "front_desk"    ? { background: "#ede9fe", color: "#7c3aed" } :
                                                                            r.sim_role === "patient_actor" ? { background: "#ccfbf1", color: "#0f766e" } :
                                                                                                             { background: "#f1f5f9", color: "#64748b" })
                                                                    }}>
                                                                        {r.sim_role === "med" ? "Med Student" :
                                                                         r.sim_role === "front_desk" ? "Front Desk" :
                                                                         r.sim_role === "patient_actor" ? "Patient Actor" : "Observer"}
                                                                    </span>
                                                                </div>

                                                                {/* Med encounters */}
                                                                {r.medEncs.length > 0 && (
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                                                        <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Patient seen</div>
                                                                        {r.medEncs.map(enc => {
                                                                            const tpl = enc.patient_templates;
                                                                            const done = !!enc.med_completed_at;
                                                                            return (
                                                                                <div key={enc.id} style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.875rem" }}>
                                                                                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                                                                                        {tpl ? `${tpl.first_name} ${tpl.last_name}` : "Unknown patient"}
                                                                                    </div>
                                                                                    {tpl?.chief_complaint && (
                                                                                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{tpl.chief_complaint}</div>
                                                                                    )}
                                                                                    <div style={{ marginTop: "0.35rem" }}>
                                                                                        <span style={{
                                                                                            fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.45rem", borderRadius: "999px",
                                                                                            background: done ? "#ecfdf5" : "#fef9c3",
                                                                                            color:      done ? "#047857" : "#854d0e"
                                                                                        }}>
                                                                                            {done ? "Completed" : "In progress"}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Front desk encounters */}
                                                                {r.fdEncs.length > 0 && (
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                                                        <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Patients checked in</div>
                                                                        {r.fdEncs.map(enc => {
                                                                            const tpl = enc.patient_templates;
                                                                            return (
                                                                                <div key={enc.id} style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.875rem", fontSize: "0.875rem" }}>
                                                                                    <span style={{ fontWeight: 600 }}>{tpl ? `${tpl.first_name} ${tpl.last_name}` : "Unknown patient"}</span>
                                                                                    {tpl?.chief_complaint && (
                                                                                        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}> · {tpl.chief_complaint}</span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Patient actor encounters */}
                                                                {r.actEncs.length > 0 && (
                                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                                                        <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>Portrayed patient</div>
                                                                        {r.actEncs.map(enc => {
                                                                            const tpl = enc.patient_templates;
                                                                            return (
                                                                                <div key={enc.id} style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.875rem", fontSize: "0.875rem" }}>
                                                                                    <span style={{ fontWeight: 600 }}>{tpl ? `${tpl.first_name} ${tpl.last_name}` : "Unknown patient"}</span>
                                                                                    {tpl?.chief_complaint && (
                                                                                        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}> · {tpl.chief_complaint}</span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Observer or no encounters yet */}
                                                                {r.sim_role === "observer" && r.medEncs.length === 0 && r.fdEncs.length === 0 && r.actEncs.length === 0 && (
                                                                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>You observed this simulation.</p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
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
