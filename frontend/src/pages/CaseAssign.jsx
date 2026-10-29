import { useEffect, useState } from "react";
import {
    getTemplateById,
    getMyCourses,
    getCourseStudents,
    assignCase,
} from "../services/instructorService.js";

export default function CaseAssign({ templateId, onNavigate }) {
    const [template, setTemplate] = useState(null);
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState([]);
    const [search, setSearch] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assignmentNotes, setAssignmentNotes] = useState("");
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [courseLoadingId, setCourseLoadingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const [tmpl, crs] = await Promise.all([
                    getTemplateById(templateId),
                    getMyCourses(),
                ]);
                setTemplate(tmpl);
                setCourses(crs);
                // Start with the template's own course, if the instructor teaches it
                if (crs.some((c) => c.id === tmpl.course_id)) handleCourseSelect(tmpl.course_id);
            } catch (err) {
                console.error(err);
                setError("Failed to load data.");
            }
            setLoading(false);
        }
        load();
    }, [templateId]);

    function toggleStudent(userId) {
        setSelected((prev) =>
            prev.includes(userId)
                ? prev.filter((id) => id !== userId)
                : [...prev, userId]
        );
    }

    async function handleCourseSelect(courseId) {
        if (!courseId) return;
        setSelectedCourseId(courseId);
        setCourseLoadingId(courseId);
        try {
            // Only students enrolled in the course can receive its cases
            const enrolled = await getCourseStudents(courseId);
            setStudents(enrolled);
            setSelected(enrolled.map((s) => s.user_id));
        } catch (err) {
            console.error(err);
            setError("Failed to load course students.");
        }
        setCourseLoadingId(null);
    }

    const filteredStudents = students.filter((s) => {
        const q = search.toLowerCase();
        return (
            s.first_name?.toLowerCase().includes(q) ||
            s.last_name?.toLowerCase().includes(q)
        );
    });

    async function handleAssign() {
        if (!selectedCourseId) {
            setError("Choose the course this case is for.");
            return;
        }
        if (selected.length === 0) {
            setError("Select at least one student.");
            return;
        }
        setError("");
        setSubmitting(true);

        const patientSnapshot = {
            first_name: template.first_name,
            last_name: template.last_name,
            date_of_birth: template.date_of_birth,
            age: template.age,
            sex: template.sex,
            phone_number: template.phone_number,
            email: template.email,
            occupation: template.occupation,
            emergency_contacts: template.emergency_contact_name || template.emergency_contact_phone ? [{
                name: template.emergency_contact_name || "",
                phone: template.emergency_contact_phone || ""
            }] : [],
            allergies: template.allergies,
            medical_history: template.medical_history,
            current_medications: template.current_medications,
            chief_complaint: template.chief_complaint,
            clinical_baseline: template.clinical_baseline,
            student_instructions: template.student_instructions,
            expectations_rubric: template.expectations_rubric,
            // A case built from a patient gets the chart's referrals copied by the database on assignment.
            initial_referral: template.patient_id ? null : template.initial_referral || null,
        };

        const results = await Promise.allSettled(
            selected.map((studentId) =>
                assignCase(templateId, studentId, patientSnapshot, dueDate, assignmentNotes, selectedCourseId)
            )
        );

        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
            console.error("Some assignments failed:", failures);
            setError(
                `${failures.length} assignment(s) failed. Some students may already have this case open.`
            );
            setSubmitting(false);
            return;
        }

        onNavigate("instructorCases");
    }

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
                    <h2>Assign Case</h2>
                    <p>Choose the students who will receive this training case.</p>
                </div>
                <button
                    className="secondary-action-button"
                    type="button"
                    onClick={() => onNavigate("instructorCases")}
                >
                    ← Back
                </button>
            </div>

            {/* ── Template Summary ───────────────────────────── */}
            {template && (
                <div className="instructor-template-summary">
                    <div className="instructor-summary-row">
                        <span className="instructor-summary-label">Patient</span>
                        <span>{template.first_name} {template.last_name}, {template.age}{template.sex ? ` · ${template.sex}` : ""}</span>
                    </div>
                    {template.occupation && (
                        <div className="instructor-summary-row">
                            <span className="instructor-summary-label">Occupation</span>
                            <span>{template.occupation}</span>
                        </div>
                    )}
                    <div className="instructor-summary-row">
                        <span className="instructor-summary-label">Chief Complaint</span>
                        <span>{template.chief_complaint}</span>
                    </div>
                </div>
            )}

            {/* ── Assign by Course ──────────────────────────── */}
            <div className="instructor-form-panel" style={{ marginBottom: "1rem" }}>
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Assign by Course</h3>
                    <p className="instructor-baseline-hint">
                        Choose the course this case is for. Its enrolled students are selected for you.
                    </p>
                    <div className="student-form-field">
                        <select
                            className="instructor-search-input"
                            value={selectedCourseId ?? ""}
                            onChange={(e) => handleCourseSelect(e.target.value)}
                            disabled={submitting || courseLoadingId !== null}
                        >
                            <option value="" disabled>
                                {courses.length === 0
                                    ? "No courses yet — import students to create a course"
                                    : courseLoadingId !== null
                                    ? "Loading…"
                                    : "Select a course…"}
                            </option>
                            {courses.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.course_number} — CRN {c.crn}
                                </option>
                            ))}
                        </select>
                    </div>
                    {selected.length > 0 && (
                        <p className="instructor-baseline-hint" style={{ marginTop: "0.5rem" }}>
                            {selected.length} student{selected.length !== 1 ? "s" : ""} selected. Adjust individually below if needed.
                        </p>
                    )}
                </div>
            </div>

            {/* ── Assignment Details ────────────────────────── */}
            <div className="instructor-form-panel" style={{ marginBottom: "1rem" }}>
                <div className="instructor-form-section">
                    <h3 className="instructor-form-section-title">Assignment Details</h3>
                    <div className="instructor-form-grid">
                        <div className="student-form-field">
                            <label htmlFor="due-date">Due Date</label>
                            <input
                                id="due-date"
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        <div className="student-form-field instructor-form-wide">
                            <label htmlFor="assignment-notes">Assignment Notes</label>
                            <textarea
                                id="assignment-notes"
                                rows={3}
                                value={assignmentNotes}
                                onChange={(e) => setAssignmentNotes(e.target.value)}
                                disabled={submitting}
                                className="instructor-textarea"
                                placeholder="Optional instructions or context for this specific assignment…"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <p className="form-message form-message-error" role="alert">{error}</p>
            )}

            {/* ── Student Picker ─────────────────────────────── */}
            <div className="instructor-form-panel">
                <div className="instructor-form-section">
                    <div className="instructor-baseline-header">
                        <div>
                            <h3 className="instructor-form-section-title">Select Students</h3>
                            <p className="instructor-baseline-hint">
                                {selected.length === 0
                                    ? "No students selected."
                                    : `${selected.length} student${selected.length > 1 ? "s" : ""} selected.`}
                            </p>
                        </div>
                    </div>

                    <div className="patient-search-panel" style={{ marginBottom: "1rem" }}>
                        <input
                            type="text"
                            placeholder="Search students by name…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="instructor-search-input"
                            aria-label="Search students"
                        />
                    </div>

                    {students.length === 0 ? (
                        <div className="patients-empty-state">
                            <div className="patients-empty-icon" aria-hidden="true">👤</div>
                            <strong>No students to show</strong>
                            <p>{selectedCourseId ? "No students are enrolled in this course yet." : "Choose a course above to list its students."}</p>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <p className="instructor-loading">No students match your search.</p>
                    ) : (
                        <ul className="instructor-student-list">
                            {filteredStudents.map((s) => {
                                const checked = selected.includes(s.user_id);
                                return (
                                    <li key={s.user_id} className="instructor-student-item">
                                        <label className="instructor-student-label">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleStudent(s.user_id)}
                                                disabled={submitting}
                                            />
                                            <span className="instructor-student-name">
                                                {s.last_name}, {s.first_name}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="student-form-actions">
                    <button
                        className="secondary-action-button"
                        type="button"
                        onClick={() => onNavigate("instructorCases")}
                        disabled={submitting}
                        style={{ marginRight: "0.75rem" }}
                    >
                        Cancel
                    </button>
                    <button
                        className="primary-action-button"
                        type="button"
                        onClick={handleAssign}
                        disabled={submitting || selected.length === 0}
                    >
                        {submitting
                            ? "Assigning…"
                            : `Assign to ${selected.length || ""} Student${selected.length !== 1 ? "s" : ""}`}
                    </button>
                </div>
            </div>
        </main>
    );
}
