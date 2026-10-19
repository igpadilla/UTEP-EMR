import { useEffect, useState } from "react";
import { getMyTemplates, getMyAssignedCases, deleteTemplate, searchPatients, signOffCase, gradeCase } from "../services/instructorService.js";
import { getCaseAuditLogs } from "../services/auditService.js";
import PTSoapNote from "../components/PTSoapNote.jsx";

const STATUS_STYLES = {
    "not started":        { background: "#f1f5f9", color: "#64748b" },
    "in progress":        { background: "#e0f2fe", color: "#0284c7" },
    "revision_requested": { background: "#fff7ed", color: "#c2410c" },
    "pending review":     { background: "#fef3c7", color: "#b45309" },
    "completed":          { background: "#ecfdf5", color: "#047857" },
};

const STATUS_LABELS = {
    "not started":        "Not Started",
    "in progress":        "In Progress",
    "revision_requested": "Revision Requested",
    "pending review":     "Pending Review",
    "completed":          "Completed",
};

// The default rubric criteria every case gets. Instructors can override
// these by defining their own criteria in the template builder.
const DEFAULT_CRITERIA = [
    { key: "subjective",  label: "Subjective History",          maxPoints: 25 },
    { key: "objective",   label: "Objective Findings & Vitals", maxPoints: 25 },
    { key: "assessment",  label: "Assessment & Clinical Logic",  maxPoints: 25 },
    { key: "plan",        label: "Plan & Safety Checks",        maxPoints: 25 },
];

export default function InstructorCases({ onNavigate }) {
    const [templates, setTemplates] = useState([]);
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Patient picker modal
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerQuery, setPickerQuery] = useState("");
    const [pickerPatients, setPickerPatients] = useState([]);
    const [pickerLoading, setPickerLoading] = useState(false);

    // Review / grading modal
    const [reviewCase, setReviewCase] = useState(null);
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [feedback, setFeedback] = useState("");
    const [rubricScores, setRubricScores] = useState({});
    const [annotations, setAnnotations] = useState([]);
    const [annotationDraft, setAnnotationDraft] = useState("");
    const [annotationTarget, setAnnotationTarget] = useState("General");

    // Audit log modal
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditModalOpen, setAuditModalOpen] = useState(false);
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        fetchAll();
    }, []);

    async function fetchAll() {
        setLoading(true);
        setError("");
        try {
            const [tmpl, assigned] = await Promise.all([
                getMyTemplates(),
                getMyAssignedCases(),
            ]);
            setTemplates(tmpl);
            setCases(assigned);
        } catch (err) {
            console.error(err);
            setError("Failed to load data. Please try again.");
        }
        setLoading(false);
    }

    async function handleDelete(templateId, patientName) {
        if (!window.confirm(`Delete template "${patientName}"? This cannot be undone.`)) return;
        try {
            await deleteTemplate(templateId);
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        } catch (err) {
            console.error(err);
            alert("Failed to delete template. It may have active assignments.");
        }
    }

    async function openPicker() {
        setPickerOpen(true);
        setPickerQuery("");
        setPickerLoading(true);
        try {
            const patients = await searchPatients("");
            setPickerPatients(patients);
        } catch (err) {
            console.error(err);
        }
        setPickerLoading(false);
    }

    async function handlePickerSearch(e) {
        const q = e.target.value;
        setPickerQuery(q);
        setPickerLoading(true);
        try {
            const patients = await searchPatients(q);
            setPickerPatients(patients);
        } catch (err) {
            console.error(err);
        }
        setPickerLoading(false);
    }

    function handleSelectPatient(patient) {
        setPickerOpen(false);
        onNavigate("templateBuilder", null, { fromPatientId: patient.id });
    }

    function openReview(c) {
        setReviewCase(c);
        setReviewError("");
        setFeedback(c.instructor_feedback ?? "");
        setAnnotations(c.chart_annotations ?? []);

        // Pre-fill rubric scores if the instructor already graded this before
        const saved = c.rubric_scores ?? {};
        const criteria = getCriteria(c);
        const initial = {};
        criteria.forEach((crit) => {
            initial[crit.key] = saved[crit.key] ?? "";
        });
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
    }

    function getCriteria(c) {
        const templateCriteria = c.patient_templates?.rubric_criteria || c.patient_snapshot?.rubric_criteria;
        if (templateCriteria && templateCriteria.length > 0) return templateCriteria;
        return DEFAULT_CRITERIA;
    }


    function totalScore() {
        return Object.values(rubricScores).reduce((sum, val) => {
            const n = parseFloat(val);
            return sum + (isNaN(n) ? 0 : n);
        }, 0);
    }

    function maxScore() {
        if (!reviewCase) return 100;
        return getCriteria(reviewCase).reduce((sum, c) => sum + c.maxPoints, 0);
    }

    function addAnnotation() {
        if (!annotationDraft.trim()) return;
        setAnnotations((prev) => [
            ...prev,
            { section: annotationTarget, comment: annotationDraft.trim(), at: new Date().toISOString() },
        ]);
        setAnnotationDraft("");
    }

    function removeAnnotation(index) {
        setAnnotations((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleGradeSubmit(decision) {
        setReviewSubmitting(true);
        setReviewError("");

        const criteria = getCriteria(reviewCase);
        const allFilled = criteria.every((c) => rubricScores[c.key] !== "");
        if (!allFilled) {
            setReviewError("Please fill in a score for every rubric criterion before submitting.");
            setReviewSubmitting(false);
            return;
        }

        try {
            const updated = await gradeCase(reviewCase.id, {
                rubricScores,
                chartAnnotations: annotations,
                score: totalScore(),
                feedback,
                decision,
            });
            setCases((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
            closeReview();
        } catch (err) {
            console.error(err);
            setReviewError("Failed to save grade. Please try again.");
        }
        setReviewSubmitting(false);
    }

    async function openAuditModal(caseId) {
        setAuditModalOpen(true);
        setAuditLoading(true);
        try {
            const logs = await getCaseAuditLogs(caseId);
            setAuditLogs(logs);
        } catch (err) {
            console.error(err);
            setAuditLogs([]);
        }
        setAuditLoading(false);
    }

    function closeAuditModal() {
        setAuditModalOpen(false);
        setAuditLogs([]);
    }

    function parseEncounterNotes(notes) {
        if (!notes) return null;
        if (typeof notes === "object") return notes;
        try {
            return JSON.parse(notes);
        } catch {
            return null;
        }
    }

    return (
        <main className="instructor-main">
            <div className="instructor-page-header">
                <div>
                    <p className="section-title">Instructor</p>
                    <h2>Case Management</h2>
                    <p>Create patient templates and assign training cases to students.</p>
                </div>
            </div>

            {error && (
                <p className="form-message form-message-error" role="alert">{error}</p>
            )}

            {/* ── My Templates ───────────────────────────────────── */}
            <section className="instructor-section">
                <div className="instructor-section-header">
                    <div>
                        <h3>My Templates</h3>
                        <p className="section-description">
                            Reusable patient scenarios you have created.
                        </p>
                    </div>
                    <div className="instructor-row-actions">
                        <button
                            className="secondary-action-button"
                            type="button"
                            onClick={openPicker}
                        >
                            From Patient
                        </button>
                        <button
                            className="primary-action-button"
                            type="button"
                            onClick={() => onNavigate("templateBuilder", null)}
                        >
                            + New Template
                        </button>
                    </div>
                </div>

                <div className="patient-results">
                    {loading ? (
                        <p className="instructor-loading">Loading templates…</p>
                    ) : templates.length === 0 ? (
                        <div className="patients-empty-state">
                            <div className="patients-empty-icon" aria-hidden="true">📋</div>
                            <strong>No templates yet</strong>
                            <p>Create your first patient template to get started.</p>
                        </div>
                    ) : (
                        <div className="patient-table-wrapper">
                            <table className="patient-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Patient</th>
                                        <th>Year / Discipline</th>
                                        <th>Chief Complaint</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {templates.map((t) => (
                                        <tr key={t.id} className="instructor-table-row">
                                            <td>{t.title || "—"}</td>
                                            <td>{t.first_name} {t.last_name}, {t.age}{t.sex ? ` · ${t.sex}` : ""}</td>
                                            <td>{[t.target_year, t.discipline].filter(Boolean).join(" · ") || "—"}</td>
                                            <td className="instructor-complaint-cell">{t.chief_complaint}</td>
                                            <td>{new Date(t.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <div className="instructor-row-actions">
                                                    <button
                                                        className="instructor-action-btn instructor-action-edit"
                                                        type="button"
                                                        onClick={() => onNavigate("templateBuilder", t.id)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="instructor-action-btn instructor-action-assign"
                                                        type="button"
                                                        onClick={() => onNavigate("caseAssign", t.id)}
                                                    >
                                                        Assign
                                                    </button>
                                                    <button
                                                        className="instructor-action-btn instructor-action-delete"
                                                        type="button"
                                                        onClick={() => handleDelete(t.id, `${t.first_name} ${t.last_name}`)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Assigned Cases ─────────────────────────────────── */}
            <section className="instructor-section">
                <div className="instructor-section-header">
                    <div>
                        <h3>Assigned Cases</h3>
                        <p className="section-description">
                            All cases assigned to students and their current status.
                        </p>
                    </div>
                </div>

                <div className="patient-results">
                    {loading ? (
                        <p className="instructor-loading">Loading cases…</p>
                    ) : cases.length === 0 ? (
                        <div className="patients-empty-state">
                            <div className="patients-empty-icon" aria-hidden="true">📂</div>
                            <strong>No cases assigned yet</strong>
                            <p>Assign a template to a student to get started.</p>
                        </div>
                    ) : (
                        <div className="patient-table-wrapper">
                            <table className="patient-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Chief Complaint</th>
                                        <th>Student</th>
                                        <th>Status</th>
                                        <th>Due Date</th>
                                        <th>Score</th>
                                        <th>Assigned</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cases.map((c) => {
                                        const statusStyle = STATUS_STYLES[c.encounter_status] ?? STATUS_STYLES["not started"];
                                        const patientName = c.patient_templates
                                            ? `${c.patient_templates.first_name} ${c.patient_templates.last_name}`
                                            : "—";
                                        const studentName = c.profiles
                                            ? `${c.profiles.first_name} ${c.profiles.last_name}`
                                            : "—";
                                        const canReview = c.encounter_status === "pending review" || c.encounter_status === "completed";
                                        return (
                                            <tr key={c.id} className="instructor-table-row">
                                                <td>{patientName}</td>
                                                <td className="instructor-complaint-cell">
                                                    {c.patient_templates?.chief_complaint ?? "—"}
                                                </td>
                                                <td>{studentName}</td>
                                                <td>
                                                    <span className="instructor-status-badge" style={statusStyle}>
                                                        {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                                    </span>
                                                </td>
                                                <td>{c.due_date ? new Date(c.due_date).toLocaleDateString() : "—"}</td>
                                                <td>
                                                    {c.score != null
                                                        ? <strong>{c.score} / {c.max_score ?? 100}</strong>
                                                        : <span style={{ color: "var(--text-muted)" }}>—</span>
                                                    }
                                                </td>
                                                <td>{new Date(c.assigned_at).toLocaleDateString()}</td>
                                                <td>
                                                    <div className="instructor-row-actions">
                                                        {canReview && (
                                                            <button
                                                                className="instructor-action-btn instructor-action-edit"
                                                                type="button"
                                                                onClick={() => openReview(c)}
                                                            >
                                                                {c.encounter_status === "pending review" ? "Grade" : "View"}
                                                            </button>
                                                        )}
                                                        <button
                                                            className="instructor-action-btn instructor-action-assign"
                                                            type="button"
                                                            onClick={() => openAuditModal(c.id)}
                                                        >
                                                            Audit Log
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Grading / Review Modal ─────────────────────────── */}
            {reviewCase && (
                <div style={overlayStyle} onClick={closeReview}>
                    <div style={gradingModalStyle} onClick={(e) => e.stopPropagation()}>

                        <div className="case-modal-header">
                            <div>
                                <p className="section-title" style={{ margin: 0 }}>Case Review</p>
                                <h3 style={{ margin: "0.2rem 0 0" }}>
                                    {reviewCase.patient_snapshot?.first_name} {reviewCase.patient_snapshot?.last_name}
                                </h3>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                <span className="instructor-status-badge" style={STATUS_STYLES[reviewCase.encounter_status] ?? STATUS_STYLES["not started"]}>
                                    {STATUS_LABELS[reviewCase.encounter_status] ?? reviewCase.encounter_status}
                                </span>
                                <button
                                    className="instructor-baseline-remove"
                                    type="button"
                                    onClick={closeReview}
                                    aria-label="Close"
                                    style={{ width: 32, height: 32, fontSize: "1.2rem" }}
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Split layout: left = student work, right = rubric */}
                        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

                            {/* Left — student note */}
                            <div style={{ flex: "0 0 58%", overflowY: "auto", padding: "1.25rem", borderRight: "1px solid #e2e8f0" }}>
                                <p className="case-modal-section-label">Patient Info</p>
                                <div className="case-info-grid" style={{ marginBottom: "1rem" }}>
                                    {reviewCase.patient_snapshot?.age && (
                                        <div className="case-info-item">
                                            <span className="case-info-label">Age</span>
                                            <span>{reviewCase.patient_snapshot.age}</span>
                                        </div>
                                    )}
                                    {reviewCase.patient_snapshot?.sex && (
                                        <div className="case-info-item">
                                            <span className="case-info-label">Sex</span>
                                            <span>{reviewCase.patient_snapshot.sex}</span>
                                        </div>
                                    )}
                                    {reviewCase.patient_snapshot?.occupation && (
                                        <div className="case-info-item">
                                            <span className="case-info-label">Occupation</span>
                                            <span>{reviewCase.patient_snapshot.occupation}</span>
                                        </div>
                                    )}
                                </div>

                                {reviewCase.patient_snapshot?.chief_complaint && (
                                    <div className="case-complaint-box" style={{ marginBottom: "1rem" }}>
                                        <span className="case-info-label">Chief Complaint</span>
                                        <p>{reviewCase.patient_snapshot.chief_complaint}</p>
                                    </div>
                                )}

                                {reviewCase.patient_snapshot?.clinical_baseline &&
                                    Object.keys(reviewCase.patient_snapshot.clinical_baseline).length > 0 && (
                                    <div style={{ marginBottom: "1rem" }}>
                                        <p className="case-modal-section-label">Clinical Baseline</p>
                                        <div className="case-baseline-grid">
                                            {Object.entries(reviewCase.patient_snapshot.clinical_baseline).map(([k, v]) => (
                                                <div key={k} className="case-baseline-item">
                                                    <span className="case-info-label">{k}</span>
                                                    <span>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="case-modal-section-label">Student Encounter Notes</p>
                                <div className="case-notes-readonly">
                                    {(() => {
                                        const parsed = parseEncounterNotes(reviewCase.encounter_notes);
                                        if (parsed) return <PTSoapNote value={parsed} readOnly={true} />;
                                        return reviewCase.encounter_notes || (
                                            <em style={{ color: "var(--text-muted)" }}>No notes recorded.</em>
                                        );
                                    })()}
                                </div>

                                {/* Annotations that have been added */}
                                {annotations.length > 0 && (
                                    <div style={{ marginTop: "1.25rem" }}>
                                        <p className="case-modal-section-label">Chart Annotations</p>
                                        {annotations.map((a, i) => (
                                            <div key={i} style={annotationBubbleStyle}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                                        {a.section}
                                                    </span>
                                                    {reviewCase.encounter_status === "pending review" && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeAnnotation(i)}
                                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1rem", lineHeight: 1 }}
                                                            aria-label="Remove annotation"
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                                <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem" }}>{a.comment}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add annotation form — only when grading */}
                                {reviewCase.encounter_status === "pending review" && (
                                    <div style={{ marginTop: "1.25rem" }}>
                                        <p className="case-modal-section-label">Add Chart Annotation</p>
                                        <select
                                            value={annotationTarget}
                                            onChange={(e) => setAnnotationTarget(e.target.value)}
                                            className="instructor-search-input"
                                            style={{ marginBottom: "0.5rem" }}
                                        >
                                            <option>General</option>
                                            <option>Subjective</option>
                                            <option>Objective</option>
                                            <option>Assessment</option>
                                            <option>Plan</option>
                                            <option>Medications</option>
                                            <option>Allergies</option>
                                        </select>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <input
                                                type="text"
                                                className="instructor-search-input"
                                                placeholder="e.g. Missing pain scale in subjective section"
                                                value={annotationDraft}
                                                onChange={(e) => setAnnotationDraft(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && addAnnotation()}
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                type="button"
                                                className="secondary-action-button"
                                                onClick={addAnnotation}
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right — rubric scoring and deliberate traps */}
                            <div style={{ flex: "0 0 42%", overflowY: "auto", padding: "1.25rem", background: "#f8fafc" }}>
                                {(() => {
                                    const traps = reviewCase.patient_templates?.traps || reviewCase.patient_snapshot?.traps || [];
                                    if (traps.length === 0) return null;
                                    return (
                                        <div style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                                            <p className="case-modal-section-label" style={{ marginBottom: "0.5rem" }}>
                                                Deliberate Traps in Scenario
                                            </p>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                                                {traps.map((trap, idx) => (
                                                    <div key={idx} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.6rem 0.75rem" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                                            <span style={{ fontWeight: 600, fontSize: "0.8rem", color: "#1e293b" }}>
                                                                {trap.category || "Clinical Trap"}
                                                            </span>
                                                            <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: "4px", background: trap.severity === "Critical" ? "#fee2e2" : "#f1f5f9", color: trap.severity === "Critical" ? "#991b1b" : "#475569", fontWeight: 600 }}>
                                                                {trap.severity || "Risk"}
                                                            </span>
                                                        </div>
                                                        {trap.trigger && (
                                                            <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", color: "#475569" }}>
                                                                <strong>Trigger:</strong> {trap.trigger}
                                                            </p>
                                                        )}
                                                        {trap.expected_action && (
                                                            <p style={{ margin: 0, fontSize: "0.8rem", color: "#047857" }}>
                                                                <strong>Expected Action:</strong> {trap.expected_action}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {reviewCase.patient_templates?.expectations_rubric && (
                                    <div style={{ marginBottom: "1.25rem", padding: "0.85rem", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px" }}>
                                        <p className="case-modal-section-label" style={{ color: "#0369a1", marginBottom: "0.3rem" }}>
                                            Instructor Expectations & Milestones
                                        </p>
                                        <p style={{ margin: 0, fontSize: "0.82rem", color: "#0f172a", whiteSpace: "pre-wrap" }}>
                                            {reviewCase.patient_templates.expectations_rubric}
                                        </p>
                                    </div>
                                )}

                                <p className="case-modal-section-label">Rubric Scoring</p>


                                <div style={{ marginBottom: "1rem" }}>
                                    {getCriteria(reviewCase).map((crit) => (
                                        <div key={crit.key} style={{ marginBottom: "1rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                                                <label style={{ fontWeight: 500, fontSize: "0.875rem" }}>{crit.label}</label>
                                                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/ {crit.maxPoints} pts</span>
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={crit.maxPoints}
                                                value={rubricScores[crit.key] ?? ""}
                                                onChange={(e) => setRubricScores((prev) => ({ ...prev, [crit.key]: e.target.value }))}
                                                disabled={reviewCase.encounter_status !== "pending review"}
                                                className="instructor-search-input"
                                                style={{ width: "100%" }}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Live score total */}
                                <div style={scoreTotalStyle}>
                                    <span>Total Score</span>
                                    <strong style={{ fontSize: "1.25rem" }}>
                                        {totalScore()} / {maxScore()}
                                    </strong>
                                </div>

                                <div style={{ marginTop: "1.25rem" }}>
                                    <p className="case-modal-section-label">Overall Feedback</p>
                                    {reviewCase.encounter_status === "pending review" ? (
                                        <textarea
                                            className="instructor-feedback-textarea"
                                            placeholder="Leave overall comments for the student…"
                                            value={feedback}
                                            onChange={(e) => setFeedback(e.target.value)}
                                            disabled={reviewSubmitting}
                                            rows={5}
                                        />
                                    ) : (
                                        <div className="case-notes-readonly">
                                            {reviewCase.instructor_feedback || <em style={{ color: "var(--text-muted)" }}>No feedback left.</em>}
                                        </div>
                                    )}
                                </div>

                                {reviewCase.profiles && (
                                    <div style={{ marginTop: "1rem" }}>
                                        <p className="case-modal-section-label">Submitted By</p>
                                        <p style={{ margin: 0 }}>
                                            {reviewCase.profiles.first_name} {reviewCase.profiles.last_name}
                                        </p>
                                    </div>
                                )}

                                {reviewError && (
                                    <p className="form-message form-message-error" role="alert" style={{ marginTop: "1rem" }}>
                                        {reviewError}
                                    </p>
                                )}

                                {reviewCase.encounter_status === "pending review" && (
                                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                                        <button
                                            className="secondary-action-button"
                                            type="button"
                                            onClick={() => handleGradeSubmit("return")}
                                            disabled={reviewSubmitting}
                                            style={{ flex: 1 }}
                                        >
                                            {reviewSubmitting ? "Saving…" : "Return for Revision"}
                                        </button>
                                        <button
                                            className="primary-action-button"
                                            type="button"
                                            onClick={() => handleGradeSubmit("approve")}
                                            disabled={reviewSubmitting}
                                            style={{ flex: 1 }}
                                        >
                                            {reviewSubmitting ? "Saving…" : "Approve & Sign Off"}
                                        </button>
                                    </div>
                                )}

                                {reviewCase.encounter_status === "completed" && (
                                    <p style={{ marginTop: "1.5rem", color: "var(--success-text)", fontSize: "0.85rem", fontWeight: 600 }}>
                                        Signed off — this case is complete.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Patient Picker Modal ───────────────────────────── */}
            {pickerOpen && (
                <div style={overlayStyle} onClick={() => setPickerOpen(false)}>
                    <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                        <div className="instructor-picker-header">
                            <h3>Select a Patient</h3>
                            <button
                                className="instructor-baseline-remove"
                                type="button"
                                onClick={() => setPickerOpen(false)}
                                aria-label="Close"
                                style={{ width: 32, height: 32, fontSize: "1.2rem" }}
                            >
                                ×
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Search by name…"
                            value={pickerQuery}
                            onChange={handlePickerSearch}
                            className="instructor-search-input"
                            autoFocus
                            style={{ marginBottom: "0.75rem" }}
                        />

                        {pickerLoading ? (
                            <p className="instructor-loading" style={{ padding: "1rem 0" }}>Searching…</p>
                        ) : pickerPatients.length === 0 ? (
                            <p className="instructor-loading" style={{ padding: "1rem 0" }}>No patients found.</p>
                        ) : (
                            <ul className="instructor-student-list">
                                {pickerPatients.map((p) => (
                                    <li key={p.id} className="instructor-student-item">
                                        <button
                                            type="button"
                                            className="instructor-picker-row"
                                            onClick={() => handleSelectPatient(p)}
                                        >
                                            <div className="instructor-picker-name">
                                                {p.first_name} {p.last_name}
                                            </div>
                                            <div className="instructor-picker-meta">
                                                Age {p.age}{p.sex ? ` · ${p.sex}` : ""}{p.occupation ? ` · ${p.occupation}` : ""}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* ── Audit Log Modal ────────────────────────────────── */}
            {auditModalOpen && (
                <div style={overlayStyle} onClick={closeAuditModal}>
                    <div style={{ ...modalStyle, maxWidth: "640px", padding: 0 }} onClick={(e) => e.stopPropagation()}>

                        <div className="case-modal-header">
                            <div>
                                <p className="section-title" style={{ margin: 0 }}>Case History</p>
                                <h3 style={{ margin: "0.2rem 0 0" }}>Audit Log</h3>
                            </div>
                            <button
                                className="instructor-baseline-remove"
                                type="button"
                                onClick={closeAuditModal}
                                aria-label="Close"
                                style={{ width: 32, height: 32, fontSize: "1.2rem" }}
                            >
                                ×
                            </button>
                        </div>

                        <div className="case-modal-body">
                            {auditLoading ? (
                                <p className="instructor-loading">Loading audit log…</p>
                            ) : auditLogs.length === 0 ? (
                                <p className="instructor-loading">No audit entries for this case yet.</p>
                            ) : (
                                <div className="patient-table-wrapper">
                                    <table className="patient-table">
                                        <thead>
                                            <tr>
                                                <th>When</th>
                                                <th>Actor</th>
                                                <th>Action</th>
                                                <th>Detail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditLogs.map((log) => (
                                                <tr key={log.id} className="instructor-table-row">
                                                    <td style={{ whiteSpace: "nowrap" }}>
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </td>
                                                    <td>
                                                        {log.profiles
                                                            ? `${log.profiles.first_name} ${log.profiles.last_name}`
                                                            : "—"}
                                                    </td>
                                                    <td>
                                                        <span className="instructor-status-badge" style={STATUS_STYLES["in progress"]}>
                                                            {log.action_type.replace(/_/g, " ")}
                                                        </span>
                                                    </td>
                                                    <td className="instructor-complaint-cell">
                                                        {log.new_value ?? log.old_value ?? "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
};

const modalStyle = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.18)",
    width: "100%",
    maxWidth: "500px",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    padding: "1.5rem",
    overflow: "hidden",
};

const gradingModalStyle = {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.18)",
    width: "100%",
    maxWidth: "1080px",
    height: "88vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
};

const annotationBubbleStyle = {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "0.6rem 0.75rem",
    marginBottom: "0.5rem",
};

const scoreTotalStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "0.75rem 1rem",
    marginTop: "0.5rem",
};
