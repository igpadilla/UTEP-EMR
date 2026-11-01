import Icd10Search from "./patient-chart/Icd10Search.jsx";

export default function PTSoapNote({
    value,
    onChange,
    disabled = false,
    readOnly = false,
}) {
    const soap = {
        subjective: "",
        objective: "",
        plan: "",
        ...value,
        assessment: {
            icd10_code: "",
            icd10_description: "",
            clinical_rationale: "",
            ...(value?.assessment ?? {}),
        },
    };

    function updateField(field, newValue) {
        onChange({
            ...soap,
            [field]: newValue,
        });
    }

    function updateAssessment(field, newValue) {
        onChange({
            ...soap,
            assessment: {
                ...soap.assessment,
                [field]: newValue,
            },
        });
    }

    return (
        <div className="pt-soap-note">
            <div className="pt-soap-header">
                <div>
                    <p
                        className="case-modal-section-label"
                        style={{ marginBottom: "0.25rem" }}
                    >
                        Physical Therapy SOAP Note
                    </p>

                    <p className="pt-soap-description">
                        Document this physical therapy encounter using the SOAP format.
                    </p>
                </div>
            </div>

            {/* Subjective */}
            <div className="pt-soap-section">
                <label className="pt-soap-label" htmlFor="pt-subjective">
                    Subjective
                </label>

                <p className="pt-soap-help">
                    Patient-reported symptoms, pain, functional limitations,
                    progress, and relevant history.
                </p>

                {readOnly ? (
                    <div className="case-notes-readonly">
                        {soap.subjective || (
                            <em>No subjective documentation.</em>
                        )}
                    </div>
                ) : (
                    <textarea
                        id="pt-subjective"
                        className="instructor-textarea"
                        rows={4}
                        value={soap.subjective}
                        onChange={(e) =>
                            updateField("subjective", e.target.value)
                        }
                        disabled={disabled}
                        placeholder="Document the patient's reported symptoms, pain, and functional limitations…"
                    />
                )}
            </div>

            {/* Objective */}
            <div className="pt-soap-section">
                <label className="pt-soap-label" htmlFor="pt-objective">
                    Objective
                </label>

                <p className="pt-soap-help">
                    Document measurable PT findings such as range of motion,
                    strength, gait, swelling, and functional testing.
                </p>

                {readOnly ? (
                    <div className="case-notes-readonly">
                        {soap.objective || (
                            <em>No objective documentation.</em>
                        )}
                    </div>
                ) : (
                    <textarea
                        id="pt-objective"
                        className="instructor-textarea"
                        rows={5}
                        value={soap.objective}
                        onChange={(e) =>
                            updateField("objective", e.target.value)
                        }
                        disabled={disabled}
                        placeholder="Document objective PT examination findings…"
                    />
                )}
            </div>

            {/* Assessment */}
            <div className="pt-soap-section">
                <span className="pt-soap-label">
                    Assessment
                </span>

                <p className="pt-soap-help">
                    Document the diagnosis and explain how the patient's
                    findings support your clinical assessment.
                </p>

                <div className="pt-assessment-grid">
                    <div className="pt-soap-field">
                        <label
                            className="case-info-label"
                            htmlFor="pt-icd10"
                        >
                            ICD-10 Diagnosis
                        </label>

                        {readOnly || disabled ? (
                            <div className="case-notes-readonly">
                                {soap.assessment.icd10_code ? (
                                    soap.assessment.icd10_description
                                        ? `${soap.assessment.icd10_code} — ${soap.assessment.icd10_description}`
                                        : soap.assessment.icd10_code
                                ) : (
                                    <em>Not documented.</em>
                                )}
                            </div>
                        ) : (
                            <Icd10Search
                                id="pt-icd10"
                                value={soap.assessment.icd10_code ? { code: soap.assessment.icd10_code, description: soap.assessment.icd10_description } : null}
                                onChange={({ code, description }) => onChange({ ...soap, assessment: { ...soap.assessment, icd10_code: code, icd10_description: description } })} />
                        )}
                    </div>

                    <div className="pt-soap-field">
                        <label
                            className="case-info-label"
                            htmlFor="pt-rationale"
                        >
                            Clinical Rationale
                        </label>

                        {readOnly ? (
                            <div className="case-notes-readonly">
                                {soap.assessment.clinical_rationale || (
                                    <em>No clinical rationale documented.</em>
                                )}
                            </div>
                        ) : (
                            <textarea
                                id="pt-rationale"
                                className="instructor-textarea"
                                rows={4}
                                value={soap.assessment.clinical_rationale}
                                onChange={(e) =>
                                    updateAssessment(
                                        "clinical_rationale",
                                        e.target.value
                                    )
                                }
                                disabled={disabled}
                                placeholder="Explain how the symptoms, objective findings, impairments, and functional limitations support your assessment…"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Plan */}
            <div className="pt-soap-section">
                <label className="pt-soap-label" htmlFor="pt-plan">
                    Plan
                </label>

                <p className="pt-soap-help">
                    Document interventions, therapeutic exercise, patient
                    education, home exercise program, frequency/duration,
                    and follow-up.
                </p>

                {readOnly ? (
                    <div className="case-notes-readonly">
                        {soap.plan || (
                            <em>No plan documented.</em>
                        )}
                    </div>
                ) : (
                    <textarea
                        id="pt-plan"
                        className="instructor-textarea"
                        rows={5}
                        value={soap.plan}
                        onChange={(e) =>
                            updateField("plan", e.target.value)
                        }
                        disabled={disabled}
                        placeholder="Document the physical therapy plan of care…"
                    />
                )}
            </div>
        </div>
    );
}