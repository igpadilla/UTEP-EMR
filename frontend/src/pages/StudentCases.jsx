import { useEffect, useRef, useState } from "react";
import {
    getMyAssignedCases,
    startCase,
    saveCaseNotes,
    submitCase
} from "../services/studentCaseService.js";
import TagSelector from "../components/TagSelector.jsx";
import PTSoapNote from "../components/PTSoapNote.jsx";
import DynamicClinicalNoteForm from "../components/DynamicClinicalNoteForm.jsx";
import { getClinicalNoteTemplatesForCase } from "../services/clinicalNoteTemplateService.js";
import PatientChart from "./PatientChart.jsx";

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

const EDITABLE_STATUSES = ["not started", "in progress", "revision_requested"];


const EMPTY_PT_SOAP = {
    subjective: "",
    objective: "",
    assessment: { icd10_code: "", icd10_description: "", clinical_rationale: "" },
    plan: "",
};

export default function StudentCases({ onNavigate, openCaseId = null, fromCourse = null, embedded = false }) {
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [activeCase, setActiveCase] = useState(null);
    const [showChart, setShowChart] = useState(false);
    const templateRequestId = useRef(0);

    const [notes, setNotes] = useState("");
    const [ptSoap, setPtSoap] = useState(EMPTY_PT_SOAP);

    const [submitting, setSubmitting] = useState(false);
    const [modalError, setModalError] = useState("");

    const [clinicalRole, setClinicalRole] = useState(null);
    const [noteTemplates, setNoteTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);

    const [selectedNoteTemplateId, setSelectedNoteTemplateId] = useState("");
    const [dynamicNoteData, setDynamicNoteData] = useState({});

    const isPTStudent = clinicalRole?.roleName === "physical_therapy";

    const [templatesError, setTemplatesError] = useState("");
    const selectedTemplate = noteTemplates.find((template) => template.id === selectedNoteTemplateId);
    const noteFormReady = !templatesLoading && !templatesError && Boolean(selectedTemplate);

    let savedNote = null;
    try {
        savedNote = JSON.parse(activeCase?.encounter_notes ?? "null");
    } catch {
        // Legacy plain-text notes are not JSON.
    }

    const isStructuredNote = savedNote?.format === "clinical-note-v1";
    const hasLegacyNote = Boolean(activeCase?.encounter_notes) && !isStructuredNote;

    useEffect(() => {
        fetchCases();
    }, []);

    const openedFromLink = useRef(false);
    useEffect(() => {
        if (!openCaseId || openedFromLink.current || loading) return;
        const target = cases.find((c) => c.id === openCaseId);
        if (target) {
            openedFromLink.current = true;
            openCase(target);
        }
    }, [openCaseId, loading, cases]);

    async function fetchCases() {
        setLoading(true);
        try {
            const data = await getMyAssignedCases();
            setCases(data);
        } catch (err) {
            console.error(err);
            setError("Failed to load your cases. Please try again.");
        }
        setLoading(false);
    }

    async function loadCaseNoteTemplates(assignedCase) {
        const requestId = ++templateRequestId.current;
        setTemplatesLoading(true);
        setClinicalRole(null);
        setNoteTemplates([]);
        setSelectedNoteTemplateId("");
        setDynamicNoteData({});
        setTemplatesError("");

        try {
            const { clinicalRole, templates } = await getClinicalNoteTemplatesForCase(assignedCase.id);

            if (requestId !== templateRequestId.current) return;

            if (!clinicalRole) {
                throw new Error("This course needs a clinical discipline.");
            }

            let saved = null;
            try {
                saved = JSON.parse(assignedCase.encounter_notes);
            } catch {
                // Existing plain-text notes are not structured notes.
            }

            const isStructured = saved?.format === "clinical-note-v1";
            const available = [...templates];

            if (isStructured && saved.template) {
                const index = available.findIndex((template) => template.id === saved.template.id);
                if (index >= 0) {
                    available[index] = saved.template;
                } else {
                    available.push(saved.template);
                }
            }

            if (!available.length) {
                throw new Error("No clinical note form is configured for this discipline.");
            }

            const selected = isStructured && saved.template ? saved.template : available.find((template) => template.name === "PT SOAP Note") ?? available[0];

            setClinicalRole(clinicalRole);
            setNoteTemplates(available);
            setSelectedNoteTemplateId(selected.id);
            setDynamicNoteData(isStructured ? saved.data ?? {} : {});

        } catch (error) {
            if (requestId !== templateRequestId.current) return;
            console.error("Error loading clinical note templates:", error);
            setTemplatesError(error.message || "Unable to load clinical note templates.");
        } finally {
            if (requestId === templateRequestId.current) {
                setTemplatesLoading(false);
            }
        }
    }

    function loadPTSoap(encounterNotes) {
        if (!encounterNotes) return EMPTY_PT_SOAP;
        try {
            const parsed = JSON.parse(encounterNotes);
            return {
                ...EMPTY_PT_SOAP,
                ...parsed,
                assessment: { ...EMPTY_PT_SOAP.assessment, ...(parsed?.assessment ?? {}) },
            };
        } catch {
            return EMPTY_PT_SOAP;
        }
    }

    async function openCase(c) {
        const openingRequestId = ++templateRequestId.current;
        let openedCase = c;

        if (c.encounter_status === "not started") {
            try {
                const updated = await startCase(c.id);
                if (openingRequestId !== templateRequestId.current) return;
                setCases((prev) => prev.map((x) => x.id === c.id ? updated : x));
                openedCase = updated;
            } catch (err) {
                if (openingRequestId !== templateRequestId.current) return;
                console.error("Failed to start case:", err);
                setModalError("Unable to start this case. Please try again.");
                return;
            }
        }

        if (openingRequestId !== templateRequestId.current) return;

        setPtSoap(loadPTSoap(openedCase.encounter_notes));
        setNotes(openedCase.encounter_notes ?? "");
        setActiveCase(openedCase);
        setShowChart(false);
        setModalError("");

        await loadCaseNoteTemplates(openedCase);
    }

    function closeCase() {
        templateRequestId.current += 1;
        setActiveCase(null);
        setShowChart(false);
        setNotes("");
        setPtSoap(EMPTY_PT_SOAP);
        setModalError("");
        setClinicalRole(null);
        setNoteTemplates([]);
        setSelectedNoteTemplateId("");
        setDynamicNoteData({});
        setTemplatesError("");
        setTemplatesLoading(false);
    }

    function serializeClinicalNote() {
        if (!selectedTemplate) {
            throw new Error("No clinical note template selected.");
        }
        return JSON.stringify({
            format: "clinical-note-v1",
            template: {
                id: selectedTemplate.id,
                name: selectedTemplate.name,
                description: selectedTemplate.description,
                fields: selectedTemplate.fields,
            },
            data: dynamicNoteData,
        });
    }

    async function handleSaveDraft() {
        if (submitting) return;
        if (!hasLegacyNote && !noteFormReady) return;
        setModalError("");
        setSubmitting(true);
        try {
            const encounterNotes = hasLegacyNote ? isPTStudent ? JSON.stringify(ptSoap) : notes : serializeClinicalNote();
            const updated = await saveCaseNotes(activeCase.id, encounterNotes);
            setCases((prev) => prev.map((x) => x.id === activeCase.id ? updated : x));
            setActiveCase(updated);
        } catch (err) {
            console.error(err);
            setModalError(
                isPTStudent
                    ? "Failed to save PT SOAP note. Please try again."
                    : "Failed to save notes. Please try again."
            );
        }
        setSubmitting(false);
    }

    async function handleSubmit() {
        if (submitting) return;
        if (!hasLegacyNote && !noteFormReady) return;

        if (hasLegacyNote) {
            if (isPTStudent) {
                const hasRequiredSOAP =
                    ptSoap.subjective.trim() &&
                    ptSoap.objective.trim() &&
                    ptSoap.assessment.icd10_code.trim() &&
                    ptSoap.assessment.clinical_rationale.trim() &&
                    ptSoap.plan.trim();
                if (!hasRequiredSOAP) {
                    setModalError("Please complete all PT SOAP sections before submitting for signature.");
                    return;
                }
            } else if (!notes.trim()) {
                setModalError("Please add encounter notes before submitting.");
                return;
            }
        } else {
            const missingFields = (selectedTemplate.fields ?? []).filter((field) => {
                if (!field.required) return false;
                const value = field.key.split(".").reduce((current, key) => current?.[key], dynamicNoteData);
                return !String(value ?? "").trim();
            });
            if (missingFields.length > 0) {
                setModalError(`Please complete: ${missingFields.map((field) => field.label).join(", ")}.`);
                return;
            }
        }

        setModalError("");
        setSubmitting(true);
        try {
            const encounterNotes = hasLegacyNote ? isPTStudent ? JSON.stringify(ptSoap) : notes : serializeClinicalNote();
            const updated = await submitCase(activeCase.id, encounterNotes);
            setCases((prev) => prev.map((x) => x.id === activeCase.id ? updated : x));
            closeCase();
        } catch (err) {
            console.error(err);
            setModalError(
                isPTStudent
                    ? "Failed to submit PT SOAP note. Please try again."
                    : "Failed to submit case. Please try again."
            );
        }
        setSubmitting(false);
    }

    const isEditable = activeCase && EDITABLE_STATUSES.includes(activeCase.encounter_status);

    const visibleCases = fromCourse
        ? cases.filter((c) => c.course_id === fromCourse.id)
        : cases;

    // ── Case encounter (inline) ─────────────────────────────────────────────
    if (activeCase) {
        const caseView = (
            <div>
                {/* Back + header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: embedded ? "0 0 1rem" : "0 0 1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <button className="secondary-action-button" type="button" onClick={closeCase}>
                            ← Cases
                        </button>
                        <div>
                            <p className="section-title" style={{ margin: 0 }}>Case Encounter</p>
                            <h3 style={{ margin: "0.1rem 0 0", fontSize: "1.1rem" }}>
                                {activeCase.patient_snapshot?.first_name} {activeCase.patient_snapshot?.last_name}
                            </h3>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span className="instructor-status-badge" style={STATUS_STYLES[activeCase.encounter_status] ?? STATUS_STYLES["not started"]}>
                            {STATUS_LABELS[activeCase.encounter_status] ?? activeCase.encounter_status}
                        </span>
                        <button
                            type="button"
                            className="secondary-action-button"
                            onClick={() => setShowChart((v) => !v)}
                        >
                            {showChart ? "Hide Chart" : "Show Chart"}
                        </button>
                    </div>
                </div>

                {/* Embedded patient chart (toggle) */}
                {showChart && (
                    <div style={{ marginBottom: "1.5rem", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                        <PatientChart
                            key={`chart-${activeCase.id}`}
                            caseId={activeCase.id}
                            canEditPatient={false}
                            embedded
                            onNavigate={onNavigate}
                        />
                    </div>
                )}

                {/* Case body */}
                <div className="case-modal-body" style={{ maxWidth: "none", padding: 0 }}>

                    {/* Student Instructions */}
                    {activeCase.patient_snapshot?.student_instructions && (
                        <div className="case-modal-section">
                            <p className="case-modal-section-label">Instructions</p>
                            <div className="case-complaint-box">
                                <p>{activeCase.patient_snapshot.student_instructions}</p>
                            </div>
                        </div>
                    )}

                    {/* Patient snapshot */}
                    <div className="case-modal-section">
                        <p className="case-modal-section-label">Patient Info</p>
                        <div className="case-info-grid">
                            {activeCase.patient_snapshot?.age && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Age</span>
                                    <span>{activeCase.patient_snapshot.age}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.date_of_birth && (
                                <div className="case-info-item">
                                    <span className="case-info-label">DOB</span>
                                    <span>{activeCase.patient_snapshot.date_of_birth}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.sex && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Sex</span>
                                    <span>{activeCase.patient_snapshot.sex}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.occupation && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Occupation</span>
                                    <span>{activeCase.patient_snapshot.occupation}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.phone_number && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Phone</span>
                                    <span>{activeCase.patient_snapshot.phone_number}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.email && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Email</span>
                                    <span>{activeCase.patient_snapshot.email}</span>
                                </div>
                            )}
                            {activeCase.patient_snapshot?.emergency_contacts?.[0] && (
                                <div className="case-info-item">
                                    <span className="case-info-label">Emergency Contact</span>
                                    <span>{activeCase.patient_snapshot.emergency_contacts[0].name} ({activeCase.patient_snapshot.emergency_contacts[0].phone})</span>
                                </div>
                            )}
                        </div>
                        {activeCase.patient_snapshot?.chief_complaint && (
                            <div className="case-complaint-box">
                                <span className="case-info-label">Chief Complaint</span>
                                <p>{activeCase.patient_snapshot.chief_complaint}</p>
                            </div>
                        )}
                    </div>

                    {/* Medical Information */}
                    {(activeCase.patient_snapshot?.allergies?.length > 0 || activeCase.patient_snapshot?.medical_history?.length > 0 || activeCase.patient_snapshot?.current_medications?.length > 0) && (
                        <div className="case-modal-section">
                            <p className="case-modal-section-label">Medical Information</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                {activeCase.patient_snapshot?.allergies?.length > 0 && (
                                    <div>
                                        <span className="case-info-label">Allergies</span>
                                        <TagSelector value={activeCase.patient_snapshot.allergies} readOnly={true} />
                                    </div>
                                )}
                                {activeCase.patient_snapshot?.medical_history?.length > 0 && (
                                    <div>
                                        <span className="case-info-label">Medical History</span>
                                        <TagSelector value={activeCase.patient_snapshot.medical_history} readOnly={true} />
                                    </div>
                                )}
                                {activeCase.patient_snapshot?.current_medications?.length > 0 && (
                                    <div>
                                        <span className="case-info-label">Medications</span>
                                        <TagSelector value={activeCase.patient_snapshot.current_medications.map(m => `${m.medicine.name} ${m.dosage}${m.medicine.unit} ${m.frequency}x/day`)} readOnly={true} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Clinical baseline */}
                    {activeCase.patient_snapshot?.clinical_baseline &&
                        Object.keys(activeCase.patient_snapshot.clinical_baseline).length > 0 && (
                        <div className="case-modal-section">
                            <p className="case-modal-section-label">Clinical Baseline</p>
                            <div className="case-baseline-grid">
                                {Object.entries(activeCase.patient_snapshot.clinical_baseline).map(([k, v]) => (
                                    <div key={k} className="case-baseline-item">
                                        <span className="case-info-label">{k}</span>
                                        <span>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Expectations & Rubric */}
                    {activeCase.patient_snapshot?.expectations_rubric && (
                        <div className="case-modal-section">
                            <p className="case-modal-section-label">Expectations & Rubric</p>
                            <div className="case-notes-readonly">
                                {activeCase.patient_snapshot.expectations_rubric}
                            </div>
                        </div>
                    )}

                    {/* Revision requested feedback */}
                    {activeCase.encounter_status === "revision_requested" && (
                        <div className="case-modal-section" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "1rem" }}>
                            <p className="case-modal-section-label" style={{ color: "#c2410c" }}>Revision Requested by Instructor</p>
                            {activeCase.instructor_feedback && (
                                <div style={{ marginBottom: "0.75rem" }}>
                                    <span className="case-info-label">Feedback</span>
                                    <div className="case-notes-readonly" style={{ marginTop: "0.25rem" }}>
                                        {activeCase.instructor_feedback}
                                    </div>
                                </div>
                            )}
                            {activeCase.chart_annotations?.length > 0 && (
                                <div style={{ marginBottom: "0.75rem" }}>
                                    <span className="case-info-label">Chart Annotations</span>
                                    {activeCase.chart_annotations.map((a, i) => (
                                        <div key={i} style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "6px", padding: "0.5rem 0.75rem", marginTop: "0.4rem", fontSize: "0.875rem" }}>
                                            <strong style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#c2410c" }}>{a.section}: </strong>
                                            {a.comment}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeCase.score != null && (
                                <div>
                                    <span className="case-info-label">Current Score</span>
                                    <p style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>
                                        {activeCase.score} / {activeCase.max_score ?? 100} pts
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Completed feedback */}
                    {activeCase.encounter_status === "completed" && activeCase.instructor_feedback && (
                        <div className="case-modal-section">
                            <p className="case-modal-section-label">Instructor Feedback</p>
                            <div className="case-notes-readonly">
                                {activeCase.instructor_feedback}
                            </div>
                        </div>
                    )}

                    {/* Clinical documentation */}
                    <div className="case-modal-section">
                        <p className="case-modal-section-label">Clinical Documentation</p>

                        {templatesLoading ? (
                            <p>Loading clinical note form…</p>
                        ) : hasLegacyNote ? (
                            <>
                                <p>This case contains a note saved using the previous documentation format.</p>
                                {isPTStudent ? (
                                    <PTSoapNote
                                        value={ptSoap}
                                        onChange={setPtSoap}
                                        disabled={submitting}
                                        readOnly={!isEditable}
                                    />
                                ) : (
                                    <>
                                        <p className="case-modal-section-label">Encounter Notes</p>
                                        {isEditable ? (
                                            <textarea
                                                className="instructor-textarea"
                                                rows={6}
                                                placeholder="Document your clinical reasoning, findings, assessment, and plan…"
                                                value={notes}
                                                onChange={(event) => setNotes(event.target.value)}
                                                disabled={submitting}
                                                style={{ width: "100%" }}
                                            />
                                        ) : (
                                            <div className="case-notes-readonly">
                                                {notes || "No notes recorded."}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        ) : templatesError ? (
                            <p role="alert" className="form-message form-message-error">
                                {templatesError} Please contact your instructor.
                            </p>
                        ) : selectedTemplate ? (
                            <>
                                <p><strong>Discipline:</strong> {clinicalRole?.roleDisplayName}</p>

                                {noteTemplates.length > 1 && (
                                    <label htmlFor="clinical-note-template" className="case-info-label">
                                        Clinical Note Form
                                        <select
                                            id="clinical-note-template"
                                            className="instructor-input"
                                            value={selectedNoteTemplateId}
                                            disabled={!isEditable || submitting}
                                            onChange={(event) => {
                                                const nextTemplateId = event.target.value;
                                                if (nextTemplateId === selectedNoteTemplateId) return;
                                                const hasEnteredData = Object.values(dynamicNoteData).some((value) => {
                                                    if (value && typeof value === "object") {
                                                        return JSON.stringify(value) !== "{}";
                                                    }
                                                    return String(value ?? "").trim() !== "";
                                                });
                                                if (hasEnteredData) {
                                                    const confirmChange = window.confirm(
                                                        "Changing the clinical note form will clear any data you have entered. Are you sure you want to continue?"
                                                    );
                                                    if (!confirmChange) return;
                                                }
                                                setSelectedNoteTemplateId(event.target.value);
                                                setDynamicNoteData({});
                                            }}
                                            style={{ width: "100%", marginTop: "0.5rem" }}
                                        >
                                            {noteTemplates.map((template) => (
                                                <option key={template.id} value={template.id}>
                                                    {template.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                <div style={{ marginTop: "1rem" }}>
                                    <DynamicClinicalNoteForm
                                        template={selectedTemplate}
                                        value={dynamicNoteData}
                                        onChange={setDynamicNoteData}
                                        disabled={submitting}
                                        readOnly={!isEditable}
                                    />
                                </div>
                            </>
                        ) : (
                            <p>No clinical note form is available.</p>
                        )}
                    </div>

                    {modalError && (
                        <p className="form-message form-message-error" role="alert">{modalError}</p>
                    )}
                </div>

                {/* Footer actions */}
                {isEditable && (
                    <div className="case-modal-footer" style={{ padding: "1rem 0 0", marginTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                        <button
                            className="secondary-action-button"
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={submitting || (!hasLegacyNote && !noteFormReady)}
                        >
                            {submitting ? "Saving…" : "Save Draft"}
                        </button>
                        <button
                            className="primary-action-button"
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || (!hasLegacyNote && !noteFormReady)}
                        >
                            {submitting
                                ? "Submitting…"
                                : activeCase.encounter_status === "revision_requested"
                                ? "Resubmit for Review"
                                : isPTStudent ? "Submit for Signature" : "Submit for Review"}
                        </button>
                    </div>
                )}

                {activeCase.encounter_status === "pending review" && (
                    <div className="case-modal-footer" style={{ padding: "1rem 0 0", marginTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                            Submitted — waiting for your instructor to review and sign off.
                        </p>
                    </div>
                )}

                {activeCase.encounter_status === "completed" && (
                    <div className="case-modal-footer" style={{ padding: "1rem 0 0", marginTop: "1rem", borderTop: "1px solid #e2e8f0", flexDirection: "column", alignItems: "flex-start", gap: "0.4rem" }}>
                        <p style={{ margin: 0, color: "var(--success-text)", fontSize: "0.85rem", fontWeight: 600 }}>
                            This case has been signed off by your instructor.
                        </p>
                        {activeCase.score != null && (
                            <p style={{ margin: 0, fontSize: "0.9rem" }}>
                                Final score: <strong>{activeCase.score} / {activeCase.max_score ?? 100} pts</strong>
                            </p>
                        )}
                    </div>
                )}
            </div>
        );

        if (embedded) return <div style={{ padding: "0 1.25rem 1.25rem" }}>{caseView}</div>;
        return <main className="instructor-main">{caseView}</main>;
    }

    // ── Cases list ──────────────────────────────────────────────────────────
    const listContent = (
        <>
            {!embedded && fromCourse && (
                <div style={{ padding: "0.75rem 1.5rem 0" }}>
                    <button
                        className="secondary-action-button"
                        type="button"
                        onClick={() => onNavigate("studentCourseDetail", null, { course: fromCourse })}
                    >
                        ← {fromCourse.course_number}
                    </button>
                </div>
            )}
            {!embedded && (
                <div className="instructor-page-header">
                    <div>
                        <p className="section-title">{fromCourse ? fromCourse.course_number : "Student"}</p>
                        <h2>My Cases</h2>
                        <p>Training cases assigned to you by your instructor.</p>
                    </div>
                </div>
            )}
            {embedded && (
                <div className="course-tab-header">
                    <div>
                        <h3 className="course-tab-title">My Cases</h3>
                        <p className="course-tab-subtitle">{visibleCases.length} case{visibleCases.length !== 1 ? "s" : ""} assigned</p>
                    </div>
                </div>
            )}

            {error && (
                <p className="form-message form-message-error" role="alert">{error}</p>
            )}

            <div className="patient-results">
                {loading ? (
                    <p className="instructor-loading">Loading your cases…</p>
                ) : visibleCases.length === 0 ? (
                    <div className="patients-empty-state">
                        <div className="patients-empty-icon" aria-hidden="true">📋</div>
                        <strong>No cases assigned yet</strong>
                        <p>Your instructor has not assigned any training cases to you yet.</p>
                    </div>
                ) : (
                    <div className="patient-table-wrapper">
                        <table className="patient-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Age</th>
                                    <th>Chief Complaint</th>
                                    <th>Status</th>
                                    <th>Due</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleCases.map((c) => {
                                    const snap = c.patient_snapshot ?? {};
                                    const statusStyle = STATUS_STYLES[c.encounter_status] ?? STATUS_STYLES["not started"];
                                    const actionLabel =
                                        c.encounter_status === "not started" ? "Open Case"
                                        : c.encounter_status === "revision_requested" ? "Revise"
                                        : c.encounter_status === "in progress" ? "Continue"
                                        : "View";
                                    const dueDate = c.due_date ? new Date(c.due_date) : null;
                                    const isOverdue = dueDate && dueDate < new Date() && c.encounter_status !== "completed";
                                    const isDueSoon = dueDate && !isOverdue && (dueDate - new Date()) < 7 * 24 * 60 * 60 * 1000;

                                    return (
                                        <tr key={c.id} className="instructor-table-row">
                                            <td>
                                                <strong>{snap.first_name ?? "—"} {snap.last_name ?? ""}</strong>
                                                {snap.sex ? <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.4rem" }}>· {snap.sex}</span> : null}
                                            </td>
                                            <td>{snap.age ?? "—"}</td>
                                            <td className="instructor-complaint-cell">{snap.chief_complaint ?? "—"}</td>
                                            <td>
                                                <span className="instructor-status-badge" style={statusStyle}>
                                                    {STATUS_LABELS[c.encounter_status] ?? c.encounter_status}
                                                </span>
                                            </td>
                                            <td style={{ whiteSpace: "nowrap", color: isOverdue ? "#dc2626" : isDueSoon ? "#d97706" : "inherit", fontWeight: isOverdue || isDueSoon ? 600 : 400 }}>
                                                {dueDate ? dueDate.toLocaleDateString() : "—"}
                                                {isOverdue && <span style={{ fontSize: "0.72rem", marginLeft: "0.3rem" }}>Overdue</span>}
                                                {isDueSoon && <span style={{ fontSize: "0.72rem", marginLeft: "0.3rem" }}>Soon</span>}
                                            </td>
                                            <td>
                                                <button
                                                    className={`instructor-action-btn ${c.encounter_status === "not started" ? "instructor-action-assign" : "instructor-action-edit"}`}
                                                    type="button"
                                                    onClick={() => openCase(c)}
                                                >
                                                    {actionLabel}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );

    if (embedded) return <div>{listContent}</div>;
    return <main className="instructor-main">{listContent}</main>;
}
