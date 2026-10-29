import { useEffect, useState } from "react";
import {
    getTemplateById,
    getPatientById,
    createTemplate,
    updateTemplate,
    getMyCourses,
} from "../services/instructorService.js";
import TagSelector from "../components/TagSelector.jsx";
import MedicationSelector from "../components/MedicationSelector.jsx";
import PatientChart from "./PatientChart.jsx";
import { validateRubric } from "../lib/grading.js";
import "./TemplateBuilder.css";

const EMPTY_FORM = {
    title: "",
    target_year: "",
    discipline: "",
    course_id: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    age: "",
    sex: "",
    phone_number: "",
    email: "",
    occupation: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    allergies: [],
    medical_history: [],
    chief_complaint: "",
    student_instructions: "",
    hidden_diagnosis: "",
};

const DEFAULT_RUBRIC_CRITERIA = [
    { key: "subjective",  label: "Subjective History",          maxPoints: 25 },
    { key: "objective",   label: "Objective Findings & Vitals", maxPoints: 25 },
    { key: "assessment",  label: "Assessment & Clinical Logic",  maxPoints: 25 },
    { key: "plan",        label: "Plan & Safety Checks",        maxPoints: 25 },
];

const STEPS = [
    { id: "details",  label: "Case Details",         short: "Setup" },
    { id: "patient",  label: "Patient",              short: "Patient", scratchOnly: true },
    { id: "scenario", label: "What Students See",    short: "Scenario" },
    { id: "grading",  label: "Grading & Answer Key", short: "Grading" },
];

export default function TemplateBuilder({ templateId, patientId, onNavigate }) {
    const isEditing = Boolean(templateId);
    const isFromPatient = Boolean(patientId) && !isEditing;

    const [form, setForm] = useState(EMPTY_FORM);
    const [expectationsRubric, setExpectationsRubric] = useState("");
    const [baseline, setBaseline] = useState([{ key: "", value: "" }]);
    const [traps, setTraps] = useState([]);
    const [rubricCriteria, setRubricCriteria] = useState(DEFAULT_RUBRIC_CRITERIA);
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(isEditing || isFromPatient);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [currentStep, setCurrentStep] = useState(0);
    const [activeTab, setActiveTab] = useState("allergies");
    const [medications, setMedications] = useState([]);
    const [initialReferral, setInitialReferral] = useState({ target_discipline: "", priority: "routine", reason: "", notes: "" });
    // A linked case takes its patient details from the patient's chart.
    const [linkedPatientId, setLinkedPatientId] = useState(isFromPatient ? patientId : null);
    const isLinked = Boolean(linkedPatientId);
    // A linked case edits the patient on the chart, so it has no Patient step.
    const steps = STEPS.filter((step) => !step.scratchOnly || !isLinked);
    const stepIndex = Math.min(currentStep, steps.length - 1);
    const stepId = steps[stepIndex].id;

    // Fields that failed validation on the last save attempt, highlighted until edited.
    // Keys are field ids; rubric rows use "rubric_<row index>".
    const [invalid, setInvalid] = useState({});
    const [focusId, setFocusId] = useState(null);
    const STEP_FIELDS = {
        patient: ["first_name", "last_name", "age"],
        scenario: ["chief_complaint"],
    };
    const stepHasError = (id) => (STEP_FIELDS[id] ?? []).some((f) => invalid[f])
        || (id === "grading" && Object.keys(invalid).some((k) => k.startsWith("rubric_")));
    const flag = (name) => (invalid[name] ? true : undefined);

    useEffect(() => {
        if (!focusId) return;
        document.getElementById(focusId)?.focus();
        setFocusId(null);
    }, [focusId, stepIndex]);

    function goToStep(id) {
        const index = steps.findIndex((step) => step.id === id);
        if (index >= 0) setCurrentStep(index);
    }

    function fillFromPatient(p) {
        setForm((f) => ({
            ...f,
            first_name: p.first_name,
            last_name: p.last_name,
            date_of_birth: p.date_of_birth ?? "",
            age: String(p.age),
            sex: p.sex ?? "",
            phone_number: p.phone_number ?? "",
            email: p.email ?? "",
            occupation: p.occupation ?? "",
            emergency_contact_name: p.emergency_contacts?.[0]?.name ?? "",
            emergency_contact_phone: p.emergency_contacts?.[0]?.phone ?? "",
            allergies: Array.isArray(p.allergies) ? p.allergies : [],
            medical_history: Array.isArray(p.medical_history) ? p.medical_history : [],
        }));
        setMedications(Array.isArray(p.current_medications) ? p.current_medications : []);
    }

    useEffect(() => {
        getMyCourses().then(setCourses).catch(console.error);
    }, []);

    useEffect(() => {
        if (isEditing) {
            async function loadTemplate() {
                try {
                    const t = await getTemplateById(templateId);
                    setForm({
                        title: t.title ?? "",
                        target_year: t.target_year ?? "",
                        discipline: t.discipline ?? "",
                        course_id: t.course_id ?? "",
                        first_name: t.first_name,
                        last_name: t.last_name,
                        date_of_birth: t.date_of_birth ?? "",
                        age: String(t.age),
                        sex: t.sex ?? "",
                        phone_number: t.phone_number ?? "",
                        email: t.email ?? "",
                        occupation: t.occupation ?? "",
                        emergency_contact_name: t.emergency_contact_name ?? "",
                        emergency_contact_phone: t.emergency_contact_phone ?? "",
                        allergies: Array.isArray(t.allergies) ? t.allergies : [],
                        medical_history: Array.isArray(t.medical_history) ? t.medical_history : [],
                        chief_complaint: t.chief_complaint,
                        student_instructions: t.student_instructions ?? "",
                        hidden_diagnosis: t.hidden_diagnosis ?? "",
                    });
                    
                    if (t.current_medications) {
                        setMedications(Array.isArray(t.current_medications) ? t.current_medications : []);
                    }

                    const entries = Object.entries(t.clinical_baseline ?? {});
                    setBaseline(
                        entries.length > 0
                            ? entries.map(([key, value]) => ({ key, value }))
                            : [{ key: "", value: "" }]
                    );
                    setExpectationsRubric(t.expectations_rubric ?? "");
                    setTraps(Array.isArray(t.traps) ? t.traps : []);
                    setRubricCriteria(
                        Array.isArray(t.rubric_criteria) && t.rubric_criteria.length > 0
                            ? t.rubric_criteria
                            : DEFAULT_RUBRIC_CRITERIA
                    );
                    if (t.initial_referral) {
                        setInitialReferral(t.initial_referral);
                    }
                    if (t.patient_id) {
                        setLinkedPatientId(t.patient_id);
                        fillFromPatient(await getPatientById(t.patient_id));
                    }
                } catch (err) {
                    console.error(err);
                    setError("Failed to load template.");
                }
                setLoading(false);
            }
            loadTemplate();
            return;
        }

        if (isFromPatient) {
            async function loadFromPatient() {
                try {
                    const p = await getPatientById(patientId);
                    fillFromPatient(p);
                    setForm((f) => ({ ...f, chief_complaint: p.last_visit_notes ?? "" }));

                    const baselineRows = [{ key: "", value: "" }];
                    setBaseline(baselineRows);
                    setTraps([]);
                    setRubricCriteria(DEFAULT_RUBRIC_CRITERIA);
                } catch (err) {
                    console.error(err);
                    setError("Failed to load patient data.");
                }
                setLoading(false);
            }
            loadFromPatient();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, patientId]);

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
        if (invalid[e.target.name]) setInvalid(({ [e.target.name]: _cleared, ...rest }) => rest);
    }

    function handleBaselineChange(index, field, value) {
        setBaseline((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }

    function addBaselineRow() {
        setBaseline((prev) => [...prev, { key: "", value: "" }]);
    }

    function removeBaselineRow(index) {
        setBaseline((prev) => prev.filter((_, i) => i !== index));
    }

    function addTrap() {
        setTraps((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                category: "Drug Interaction",
                trigger: "",
                expected_action: "",
                severity: "Critical",
            },
        ]);
    }

    function updateTrap(index, field, value) {
        setTraps((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }

    function removeTrap(index) {
        setTraps((prev) => prev.filter((_, i) => i !== index));
    }

    function addRubricRow() {
        const key = `crit_${Date.now()}`;
        setRubricCriteria((prev) => [
            ...prev,
            { key, label: "", maxPoints: 10 },
        ]);
    }

    function updateRubricRow(index, field, value) {
        setRubricCriteria((prev) => {
            const next = [...prev];
            const parsedVal = field === "maxPoints" ? (parseInt(value, 10) || 0) : value;
            next[index] = { ...next[index], [field]: parsedVal };
            return next;
        });
    }

    function removeRubricRow(index) {
        setRubricCriteria((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        // Check everything first so every missing field is highlighted, not just the first.
        const age = parseInt(form.age, 10);
        const bad = {};
        if (!form.first_name.trim()) bad.first_name = true;
        if (!form.last_name.trim()) bad.last_name = true;
        if (isNaN(age) || age < 0 || age > 150) bad.age = true;
        if (!form.chief_complaint.trim()) bad.chief_complaint = true;
        let rubricError = "";
        try {
            validateRubric(rubricCriteria);
        } catch (err) {
            rubricError = err.message;
            rubricCriteria.forEach((row, i) => { if (!String(row.label ?? "").trim()) bad[`rubric_${i}`] = true; });
        }

        if (Object.keys(bad).length || rubricError) {
            setInvalid(bad);
            const patientMissing = bad.first_name || bad.last_name || bad.age;
            const firstField = ["first_name", "last_name", "age", "chief_complaint"].find((f) => bad[f])
                ?? Object.keys(bad).find((k) => k.startsWith("rubric_"));
            if (isLinked && patientMissing) {
                setError("The patient is missing a name or valid age. Fix it in the chart on the right.");
            } else if (patientMissing || bad.chief_complaint) {
                setError("Fill in the highlighted fields.");
            } else {
                setError(rubricError);
            }
            goToStep(patientMissing && !isLinked ? "patient" : bad.chief_complaint ? "scenario" : "grading");
            setFocusId(firstField);
            return;
        }
        setInvalid({});

        const clinical_baseline = {};
        for (const { key, value } of baseline) {
            const k = key.trim();
            if (k) clinical_baseline[k] = value.trim();
        }

        const payload = {
            title: form.title.trim() || null,
            target_year: form.target_year.trim() || null,
            discipline: form.discipline.trim() || null,
            course_id: form.course_id || null,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            date_of_birth: form.date_of_birth || null,
            age,
            sex: form.sex || null,
            phone_number: form.phone_number || null,
            email: form.email || null,
            occupation: form.occupation.trim() || null,
            emergency_contact_name: form.emergency_contact_name.trim() || null,
            emergency_contact_phone: form.emergency_contact_phone.trim() || null,
            allergies: form.allergies,
            medical_history: form.medical_history,
            current_medications: medications,
            chief_complaint: form.chief_complaint.trim(),
            clinical_baseline,
            traps,
            rubric_criteria: rubricCriteria,
            student_instructions: form.student_instructions.trim() || null,
            hidden_diagnosis: form.hidden_diagnosis.trim() || null,
            expectations_rubric: expectationsRubric.trim() || null,
            initial_referral: !isLinked && initialReferral.target_discipline ? initialReferral : null,
            patient_id: linkedPatientId,
        };

        setSubmitting(true);
        try {
            if (isEditing) {
                await updateTemplate(templateId, payload);
            } else {
                await createTemplate(payload);
            }
            onNavigate("instructorCases");
        } catch (err) {
            console.error(err);
            setError("Failed to save template. Please try again.");
        }
        setSubmitting(false);
    }

    if (loading) {
        return (
            <main className={`instructor-main ${isLinked ? "template-builder-split-main" : ""}`}>
                <p className="instructor-loading">Loading…</p>
            </main>
        );
    }

    const pageTitle = isEditing ? "Edit Template" : isFromPatient ? "New Template from Patient" : "New Template";

    return (
        <main className={`instructor-main ${isLinked ? "template-builder-split-main" : ""}`}>
            {!isLinked && (
                <div className="instructor-page-header">
                    <div>
                        <p className="section-title">Instructor</p>
                        <h2>{pageTitle}</h2>
                        <p>
                            {isFromPatient
                                ? "Edit chart on right, case details on left, then save."
                                : "Define a training patient scenario for your students."}
                        </p>
                    </div>
                    <button
                        className="secondary-action-button"
                        type="button"
                        onClick={() => onNavigate("instructorCases")}
                    >
                        ← Back
                    </button>
                </div>
            )}

            <div className={isLinked ? "template-builder-split" : undefined}>
                <div className={isLinked ? "template-builder-setup-col" : undefined}>
                    {isLinked && (
                        <div className="template-builder-setup-header">
                            <h2 className="template-builder-title">{pageTitle}</h2>
                            <p className="template-builder-desc">
                                {isFromPatient
                                    ? "Edit chart on right, case details on left, then save."
                                    : "Define a training patient scenario for your students."}
                            </p>
                        </div>
                    )}
                    <form className="instructor-form-panel" onSubmit={handleSubmit} noValidate>

                {error && (
                    <p className="form-message form-message-error" role="alert">{error}</p>
                )}

                {/* ── Stepper Header ────────────────────────────── */}
                <div className="template-stepper-nav">
                    <div className="template-stepper-header">
                        <div className="template-stepper-header-info">
                            <span className="template-stepper-count">
                                Step {stepIndex + 1} of {steps.length}
                            </span>
                            <span className="template-stepper-title">
                                {steps[stepIndex].label}
                            </span>
                        </div>
                    </div>

                    <div className="template-stepper-pills" role="tablist" aria-label="Setup steps">
                        {steps.map((step, idx) => (
                            <button
                                key={step.id}
                                type="button"
                                role="tab"
                                aria-selected={idx === stepIndex}
                                className={`template-step-pill ${idx === stepIndex ? "active" : ""} ${stepHasError(step.id) ? "has-error" : ""}`}
                                onClick={() => setCurrentStep(idx)}
                                disabled={submitting}
                            >
                                <span className="template-step-pill-num">{idx + 1}</span>
                                <span className="template-step-pill-label">{step.short}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="template-form-scroll-body">
                {/* ── Setup ───────────────────────────────────────── */}
                {stepId === "details" && (
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Case Setup</h3>
                    <div className="instructor-form-grid">
                        <div className="student-form-field instructor-form-wide">
                            <label htmlFor="title">Case Title</label>
                            <input
                                id="title"
                                name="title"
                                type="text"
                                value={form.title}
                                onChange={handleChange}
                                disabled={submitting}
                                placeholder="e.g. Acute Chest Pain — Suspected STEMI"
                            />
                        </div>

                        <div className="student-form-field">
                            <label htmlFor="target_year">Target Year</label>
                            <input
                                id="target_year"
                                name="target_year"
                                type="text"
                                value={form.target_year}
                                onChange={handleChange}
                                disabled={submitting}
                                placeholder="e.g. P1, P2, P3"
                            />
                        </div>

                        <div className="student-form-field">
                            <label htmlFor="discipline">Discipline</label>
                            <input
                                id="discipline"
                                name="discipline"
                                type="text"
                                value={form.discipline}
                                onChange={handleChange}
                                disabled={submitting}
                                placeholder="e.g. Pharmacotherapy"
                            />
                        </div>

                        <div className="student-form-field">
                            <label htmlFor="course_id">Course</label>
                            <select
                                id="course_id"
                                name="course_id"
                                value={form.course_id}
                                onChange={handleChange}
                                disabled={submitting}
                                className="instructor-search-input"
                            >
                                <option value="">— None —</option>
                                {courses.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.course_number} — CRN {c.crn}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                )}

                {/* ── Patient (scratch cases only: a linked case edits the chart on the right) ── */}
                {stepId === "patient" && (
                <>
                    <div className="instructor-form-section">
                        <h3 className="instructor-form-section-title">Patient Identity</h3>
                        <div className="instructor-form-grid">
                            <div className="student-form-field">
                                <label htmlFor="first_name">First Name <span aria-hidden="true">*</span></label>
                                <input id="first_name" name="first_name" type="text" value={form.first_name}
                                    onChange={handleChange} required disabled={submitting} aria-invalid={flag("first_name")} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="last_name">Last Name <span aria-hidden="true">*</span></label>
                                <input id="last_name" name="last_name" type="text" value={form.last_name}
                                    onChange={handleChange} required disabled={submitting} aria-invalid={flag("last_name")} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="age">Age <span aria-hidden="true">*</span></label>
                                <input id="age" name="age" type="number" min="0" max="150" value={form.age}
                                    onChange={handleChange} required disabled={submitting} aria-invalid={flag("age")} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="sex">Sex</label>
                                <input id="sex" name="sex" type="text" value={form.sex}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="date_of_birth">Date of Birth</label>
                                <input id="date_of_birth" name="date_of_birth" type="date" value={form.date_of_birth}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="phone_number">Phone</label>
                                <input id="phone_number" name="phone_number" type="tel" value={form.phone_number}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="email">Email</label>
                                <input id="email" name="email" type="email" value={form.email}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="emergency_contact_name">Emergency Contact Name</label>
                                <input id="emergency_contact_name" name="emergency_contact_name" type="text" value={form.emergency_contact_name}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field">
                                <label htmlFor="emergency_contact_phone">Emergency Contact Phone</label>
                                <input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" value={form.emergency_contact_phone}
                                    onChange={handleChange} disabled={submitting} />
                            </div>

                            <div className="student-form-field instructor-form-wide">
                                <label htmlFor="occupation">Occupation</label>
                                <input id="occupation" name="occupation" type="text" value={form.occupation}
                                    onChange={handleChange} disabled={submitting} />
                            </div>
                        </div>
                    </div>

                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title" style={{ textAlign: "center" }}>Medical Information</h3>
                    <div className="template-subtabs">
                        <button type="button" className={`template-subtab-btn ${activeTab === "allergies" ? "active" : ""}`} onClick={() => setActiveTab("allergies")}>Allergies</button>
                        <button type="button" className={`template-subtab-btn ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>Medical History</button>
                        <button type="button" className={`template-subtab-btn ${activeTab === "medications" ? "active" : ""}`} onClick={() => setActiveTab("medications")}>Medications</button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem", flex: 1 }}>
                        {activeTab === "allergies" && (
                            <TagSelector 
                                value={form.allergies} 
                                onChange={(newArr) => setForm({ ...form, allergies: newArr })} 
                                placeholder="Add allergy (press Enter or comma)..." 
                            />
                        )}

                        {activeTab === "history" && (
                            <TagSelector 
                                value={form.medical_history} 
                                onChange={(newArr) => setForm({ ...form, medical_history: newArr })} 
                                placeholder="Add condition (press Enter or comma)..." 
                            />
                        )}

                        {activeTab === "medications" && (
                            <MedicationSelector 
                                value={medications} 
                                onChange={setMedications} 
                            />
                        )}
                    </div>
                </div>
                </>
                )}

                {/* ── Scenario: everything the student sees ──────── */}
                {stepId === "scenario" && (
                <>
                {/* ── Visit Details ─────────────────────────────── */}
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Visit Details</h3>
                    <div className="instructor-form-grid">
                        <div className="student-form-field instructor-form-wide">
                            <label htmlFor="chief_complaint">Chief Complaint <span aria-hidden="true">*</span></label>
                            <textarea
                                id="chief_complaint"
                                name="chief_complaint"
                                rows={3}
                                value={form.chief_complaint}
                                onChange={handleChange}
                                required
                                aria-invalid={flag("chief_complaint")}
                                disabled={submitting}
                                className="instructor-textarea"
                            />
                        </div>
                    </div>
                </div>

                {/* ── Student Instructions ─────────────────────── */}
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Student Instructions</h3>
                    <p className="instructor-baseline-hint">
                        Visible to the student when they open the case. Use this to set context or direct their focus.
                    </p>
                    <div className="student-form-field instructor-form-wide">
                        <textarea
                            id="student_instructions"
                            name="student_instructions"
                            rows={4}
                            value={form.student_instructions}
                            onChange={handleChange}
                            disabled={submitting}
                            className="instructor-textarea"
                            placeholder="e.g. You are a pharmacist student on rotation. The patient presents to the emergency department..."
                        />
                    </div>
                </div>

                <div className="instructor-form-section">
                    <div className="instructor-baseline-header">
                        <div>
                            <h3 className="instructor-form-section-title">Labs & Other Findings</h3>
                            <p className="instructor-baseline-hint">
                                {isLinked
                                    ? "Add labs or other findings the student will see (e.g. A1C → 10.5%). Vitals come from the patient's chart."
                                    : "Add vitals, labs, history, or any data the student will see (e.g. BP → 140/90)."}
                            </p>
                        </div>
                        <button
                            className="secondary-action-button template-add-btn"
                            type="button"
                            onClick={addBaselineRow}
                            disabled={submitting}
                        >
                            + Add Row
                        </button>
                    </div>

                    <div className="instructor-baseline-list">
                        {baseline.map((row, i) => (
                            <div key={i} className="instructor-baseline-row">
                                <input
                                    type="text"
                                    placeholder="Label (e.g. BP)"
                                    value={row.key}
                                    onChange={(e) => handleBaselineChange(i, "key", e.target.value)}
                                    disabled={submitting}
                                    className="instructor-baseline-key"
                                    aria-label={`Baseline field label ${i + 1}`}
                                />
                                <input
                                    type="text"
                                    placeholder="Value (e.g. 140/90 mmHg)"
                                    value={row.value}
                                    onChange={(e) => handleBaselineChange(i, "value", e.target.value)}
                                    disabled={submitting}
                                    className="instructor-baseline-value"
                                    aria-label={`Baseline field value ${i + 1}`}
                                />
                                <button
                                    className="instructor-baseline-remove"
                                    type="button"
                                    onClick={() => removeBaselineRow(i)}
                                    disabled={submitting || baseline.length === 1}
                                    aria-label="Remove row"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Linked cases keep referrals on the patient's chart (Referrals tab); they are copied on assignment. */}
                {!isLinked && (
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Pre-loaded Referral (Optional)</h3>
                    <p className="instructor-baseline-hint">
                        Include an initial consult request on the chart (e.g. for Physical Therapy or Pharmacy students).
                    </p>
                    <div className="template-builder-two-col" style={{ gap: "1rem", marginTop: "0.75rem" }}>
                        <div className="student-form-field">
                            <label>Target Specialty</label>
                            <select
                                value={initialReferral.target_discipline}
                                onChange={(e) => setInitialReferral({ ...initialReferral, target_discipline: e.target.value })}
                                disabled={submitting}
                                className="instructor-search-input"
                            >
                                <option value="">-- None --</option>
                                <option value="Physical Therapy">Physical Therapy</option>
                                <option value="Pharmacy">Pharmacy</option>
                                <option value="Occupational Therapy">Occupational Therapy</option>
                                <option value="Speech-Language Pathology">Speech-Language Pathology</option>
                                <option value="Nursing">Nursing</option>
                                <option value="Social Work">Social Work</option>
                                <option value="Psychiatry">Psychiatry</option>
                            </select>
                        </div>
                        <div className="student-form-field">
                            <label>Priority</label>
                            <select
                                value={initialReferral.priority}
                                onChange={(e) => setInitialReferral({ ...initialReferral, priority: e.target.value })}
                                disabled={submitting}
                                className="instructor-search-input"
                            >
                                <option value="routine">Routine</option>
                                <option value="urgent">Urgent</option>
                                <option value="stat">Stat</option>
                            </select>
                        </div>
                    </div>
                    {initialReferral.target_discipline && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                            <div className="student-form-field">
                                <label>Reason for Consult</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Evaluate gait instability after right-sided stroke"
                                    value={initialReferral.reason}
                                    onChange={(e) => setInitialReferral({ ...initialReferral, reason: e.target.value })}
                                    disabled={submitting}
                                    className="instructor-search-input"
                                />
                            </div>
                            <div className="student-form-field">
                                <label>Referring Provider / Clinical Notes</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Ordered by Dr. Smith (Internal Medicine)"
                                    value={initialReferral.notes}
                                    onChange={(e) => setInitialReferral({ ...initialReferral, notes: e.target.value })}
                                    disabled={submitting}
                                    className="instructor-search-input"
                                />
                            </div>
                        </div>
                    )}
                </div>
                )}
                </>
                )}

                {/* ── Grading: instructor-only ────────────────────── */}
                {stepId === "grading" && (
                <>
                {/* ── Hidden Diagnosis ──────────────────────────── */}
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">
                        Hidden Diagnosis
                        <span style={{ marginLeft: "0.6rem", fontSize: "0.75rem", fontWeight: 400, color: "var(--text-muted)", background: "#fef3c7", padding: "0.1rem 0.5rem", borderRadius: "999px" }}>
                            Not shown to students
                        </span>
                    </h3>
                    <p className="instructor-baseline-hint">
                        The confirmed diagnosis for this case. Students will not see this field.
                    </p>
                    <div className="student-form-field instructor-form-wide">
                        <textarea
                            id="hidden_diagnosis"
                            name="hidden_diagnosis"
                            rows={2}
                            value={form.hidden_diagnosis}
                            onChange={handleChange}
                            disabled={submitting}
                            className="instructor-textarea"
                            placeholder="e.g. STEMI — Left anterior descending artery occlusion"
                        />
                    </div>
                </div>

                <div className="instructor-form-section">
                    <div className="instructor-baseline-header">
                        <div>
                            <h3 className="instructor-form-section-title">Deliberate Clinical "Traps"</h3>
                            <p className="instructor-baseline-hint">
                                Set intentional safety risks, drug interactions, or abnormal values the student must catch.
                            </p>
                        </div>
                        <button
                            className="secondary-action-button template-add-btn"
                            type="button"
                            onClick={addTrap}
                            disabled={submitting}
                        >
                            + Add Trap
                        </button>
                    </div>

                    {traps.length === 0 ? (
                        <div style={{ padding: "1.25rem", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", textAlign: "center", color: "#64748b" }}>
                            No deliberate traps added yet. Click <strong>+ Add Trap</strong> to plant a clinical challenge for students.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {traps.map((trap, idx) => (
                                <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                                            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#1e293b" }}>
                                                Trap #{idx + 1}
                                            </span>
                                            <select
                                                value={trap.category || "Drug Interaction"}
                                                onChange={(e) => updateTrap(idx, "category", e.target.value)}
                                                disabled={submitting}
                                                className="instructor-search-input"
                                                style={{ width: "auto", minWidth: "180px", padding: "0.3rem 0.5rem" }}
                                            >
                                                <option value="Drug Interaction">Drug Interaction</option>
                                                <option value="Abnormal Lab Result">Abnormal Lab Result</option>
                                                <option value="Contraindicated Medication">Contraindicated Medication</option>
                                                <option value="Allergy Conflict">Allergy Conflict</option>
                                                <option value="Vital Sign Decompensation">Vital Sign Decompensation</option>
                                                <option value="Diagnostic Red Herring">Diagnostic Red Herring</option>
                                                <option value="Other Safety Risk">Other Safety Risk</option>
                                            </select>
                                            <select
                                                value={trap.severity || "Critical"}
                                                onChange={(e) => updateTrap(idx, "severity", e.target.value)}
                                                disabled={submitting}
                                                className="instructor-search-input"
                                                style={{ width: "auto", padding: "0.3rem 0.5rem" }}
                                            >
                                                <option value="Critical">Critical Severity</option>
                                                <option value="Moderate">Moderate Severity</option>
                                                <option value="Warning">Warning</option>
                                            </select>
                                        </div>
                                        <button
                                            className="instructor-baseline-remove"
                                            type="button"
                                            onClick={() => removeTrap(idx)}
                                            disabled={submitting}
                                            aria-label="Remove trap"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    <div className="template-builder-two-col" style={{ gap: "0.75rem" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "0.25rem", textTransform: "uppercase" }}>
                                                Planted Trigger / Condition
                                            </label>
                                            <input
                                                type="text"
                                                className="instructor-search-input"
                                                placeholder="e.g. Lisinopril prescribed alongside Spironolactone"
                                                value={trap.trigger || ""}
                                                onChange={(e) => updateTrap(idx, "trigger", e.target.value)}
                                                disabled={submitting}
                                                style={{ width: "100%", background: "#fff" }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "0.25rem", textTransform: "uppercase" }}>
                                                Expected Student Action
                                            </label>
                                            <input
                                                type="text"
                                                className="instructor-search-input"
                                                placeholder="e.g. Flag hyperkalemia risk, discontinue potassium-sparing diuretic"
                                                value={trap.expected_action || ""}
                                                onChange={(e) => updateTrap(idx, "expected_action", e.target.value)}
                                                disabled={submitting}
                                                style={{ width: "100%", background: "#fff" }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="instructor-form-section">
                    <div className="instructor-baseline-header">
                        <div>
                            <h3 className="instructor-form-section-title">Grading Rubric Criteria</h3>
                            <p className="instructor-baseline-hint">
                                Configure the criteria and maximum points used to score student encounter notes.
                            </p>
                        </div>
                        <button
                            className="secondary-action-button template-add-btn"
                            type="button"
                            onClick={addRubricRow}
                            disabled={submitting}
                        >
                            + Add Criterion
                        </button>
                    </div>

                    <div className="instructor-baseline-list">
                        {rubricCriteria.map((row, i) => (
                            <div key={i} className="instructor-baseline-row">
                                <input
                                    type="text"
                                    placeholder="Criterion Label (e.g. Assessment & Clinical Logic)"
                                    id={`rubric_${i}`}
                                    value={row.label}
                                    aria-invalid={flag(`rubric_${i}`)}
                                    onChange={(e) => {
                                        updateRubricRow(i, "label", e.target.value);
                                        if (invalid[`rubric_${i}`]) setInvalid(({ [`rubric_${i}`]: _c, ...rest }) => rest);
                                    }}
                                    disabled={submitting}
                                    className="instructor-baseline-key"
                                    style={{ flex: "1 1 70%" }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: "0 0 120px" }}>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        placeholder="Points"
                                        value={row.maxPoints}
                                        onChange={(e) => updateRubricRow(i, "maxPoints", e.target.value)}
                                        disabled={submitting}
                                        className="instructor-baseline-value"
                                        style={{ width: "100%" }}
                                    />
                                    <span style={{ fontSize: "0.8rem", color: "#64748b" }}>pts</span>
                                </div>
                                <button
                                    className="instructor-baseline-remove"
                                    type="button"
                                    onClick={() => removeRubricRow(i)}
                                    disabled={submitting || rubricCriteria.length <= 1}
                                    aria-label="Remove criterion"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}>
                            Total Rubric Points: {rubricCriteria.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0)} pts
                        </span>
                    </div>
                </div>

                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Clinical Expectations & Reference Notes</h3>
                    <p className="instructor-baseline-hint">
                        Internal notes or key milestones for this case scenario (visible to instructors during review).
                    </p>
                    <div className="student-form-field instructor-form-wide">
                        <textarea
                            id="expectations_rubric"
                            name="expectations_rubric"
                            rows={4}
                            value={expectationsRubric}
                            onChange={(e) => setExpectationsRubric(e.target.value)}
                            disabled={submitting}
                            className="instructor-textarea"
                            placeholder="Add reference notes, ideal differential diagnoses, or specific instructions for this scenario..."
                        />
                    </div>
                </div>
                </>
                )}
                </div>

                {/* ── Step Navigation & Actions ──────────────────── */}
                <div className="template-step-actions">
                    <div className="template-step-nav-buttons">
                        <button
                            type="button"
                            className="secondary-action-button"
                            onClick={() => setCurrentStep(stepIndex - 1)}
                            disabled={stepIndex === 0 || submitting}
                        >
                            ← Previous
                        </button>

                        {stepIndex < steps.length - 1 ? (
                            <button
                                type="button"
                                className="secondary-action-button template-step-next-btn"
                                onClick={() => setCurrentStep(stepIndex + 1)}
                                disabled={submitting}
                            >
                                Next Step →
                            </button>
                        ) : (
                            <span />
                        )}
                    </div>
                </div>
            </form>

            <div className="template-builder-external-actions">
                <button
                    className="secondary-action-button"
                    type="button"
                    onClick={() => onNavigate("instructorCases")}
                    disabled={submitting}
                >
                    Cancel
                </button>
                <button
                    className="primary-action-button"
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                >
                    {submitting
                        ? isEditing ? "Saving…" : "Creating…"
                        : isEditing ? "Save Changes" : "Create Template"}
                </button>
            </div>
            </div>

            {isLinked && (
                <aside className="template-builder-chart-pane" aria-label="Patient chart">
                    <PatientChart key={linkedPatientId} id={linkedPatientId} canEditPatient
                        embedded onPatientSaved={fillFromPatient} onNavigate={onNavigate} />
                </aside>
            )}
            </div>
        </main>
    );
}
