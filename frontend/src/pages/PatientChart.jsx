import { useEffect, useRef, useState } from "react";
import VitalsPanel from "../components/vitals/VitalsPanel.jsx";
import ReferralManager from "../components/ReferralManager.jsx";
import PatientSummary from "../components/patient-chart/PatientSummary.jsx";
import PatientAllergiesHistory from "../components/patient-chart/PatientAllergiesHistory.jsx";
import { patientList } from "../components/patient-chart/patientChartForm.js";
import { loadPatientChart } from "../services/patientChartService.js";
import "./PatientChart.css";

const EDITABLE_STATUSES = ["not started", "in progress", "revision_requested"];
const TABS = ["Summary", "Vitals", "Notes", "Medications", "Allergies & History", "Visits", "Referrals"];


export default function PatientChart({ id, caseId, backTo, onNavigate, canEditPatient = false }) {
    const [patient, setPatient] = useState(null);
    const [caseStatus, setCaseStatus] = useState(null);
    const [activeTab, setActiveTab] = useState("Summary");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [reload, setReload] = useState(0);
    const [editingSection, setEditingSection] = useState(null);
    const tabButtons = useRef([]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            setPatient(null);
            try {
                const chart = await loadPatientChart({ patientId: id, caseId });
                if (cancelled) return;
                setPatient(chart.patient);
                setCaseStatus(chart.caseStatus);
            } catch (loadError) {
                if (!cancelled) setError(loadError.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [id, caseId, reload]);

    function goBack() {
        onNavigate(backTo ?? "patientLookup", id);
    }

    function chooseTab(tab) {
        if (editingSection) return;
        setNotice("");
        setActiveTab(tab);
    }

    function moveTab(event, index) {
        if (editingSection) return;
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
        else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = TABS.length - 1;
        else return;
        event.preventDefault();
        chooseTab(TABS[next]);
        tabButtons.current[next]?.focus();
    }

    function savedPatient(saved, message) {
        setPatient(saved);
        setEditingSection(null);
        setNotice(message);
    }

    if (loading) return <main className="chart-content"><p role="status">Loading chart…</p>
        <button type="button" className="secondary-action-button" onClick={goBack}>← Back</button></main>;
    if (error || !patient) return <main className="chart-content">
        <p className="form-message form-message-error" role="alert">{error || "Patient not found."}</p>
        <div className="chart-actions"><button type="button" className="secondary-action-button" onClick={() => setReload((value) => value + 1)}>Try again</button>
            <button type="button" className="secondary-action-button" onClick={goBack}>← Back</button></div>
    </main>;

    const allergies = patientList(patient.allergies);
    const canEdit = canEditPatient && !caseId && Boolean(patient.id);
    const locked = Boolean(caseId) && !EDITABLE_STATUSES.includes(caseStatus);
    const activeIndex = TABS.indexOf(activeTab);
    const sectionProps = {
        patient, canEdit, onCancel: () => setEditingSection(null), onSaved: savedPatient,
    };

    return (
        <main className="chart-page">
            <section className="chart-header">
                <div className="chart-banner">
                    <div>
                        <h1>{[patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Patient"}
                            {caseId && <span className="chart-case-tag">Case copy</span>}
                        </h1>
                        <p className="chart-banner-details">
                            {patient.age == null ? "Age not recorded" : `${patient.age} y`} · {patient.sex || "Sex not recorded"}
                            {patient.date_of_birth && ` · DOB ${patient.date_of_birth}`}
                        </p>
                    </div>
                    <div className="chart-banner-right">
                        {allergies.length ? <span className="chart-allergies">Allergies: {allergies.join(", ")}</span>
                            : <span className="chart-no-allergies">No allergies recorded</span>}
                        <div className="chart-actions">
                            <button type="button" className="secondary-action-button" disabled={Boolean(editingSection)} onClick={() => {
                                setNotice(""); setReload((value) => value + 1);
                            }}>Refresh chart</button>
                            <button type="button" className="secondary-action-button" disabled={Boolean(editingSection)} onClick={goBack}>← Back</button>
                        </div>
                    </div>
                </div>

                <nav className="chart-tabs" role="tablist" aria-label="Chart sections">
                    {TABS.map((tab, index) => <button key={tab} type="button" role="tab"
                        id={`chart-tab-${index}`} aria-controls={`chart-panel-${index}`}
                        aria-selected={tab === activeTab} tabIndex={tab === activeTab ? 0 : -1}
                        ref={(button) => { tabButtons.current[index] = button; }}
                        className={tab === activeTab ? "chart-tab chart-tab-active" : "chart-tab"}
                        disabled={Boolean(editingSection) && tab !== activeTab}
                        onKeyDown={(event) => moveTab(event, index)} onClick={() => chooseTab(tab)}>{tab}</button>)}
                </nav>
            </section>

            <div className="chart-content" role="tabpanel" id={`chart-panel-${activeIndex}`} aria-labelledby={`chart-tab-${activeIndex}`}>
                {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
                {editingSection && <p className="chart-edit-hint">Save or cancel your edits before switching sections or leaving the chart.</p>}
                {caseId && ["Summary", "Allergies & History"].includes(activeTab)
                    && <p className="chart-edit-hint">These are the patient details saved with this case. They are read-only here.</p>}

                {activeTab === "Summary" ? <PatientSummary {...sectionProps} editing={editingSection === "demographics"}
                    onEdit={() => setEditingSection("demographics")} />
                    : activeTab === "Allergies & History" ? <PatientAllergiesHistory {...sectionProps} editing={editingSection === "history"}
                        onEdit={() => setEditingSection("history")} />
                    : activeTab === "Vitals" ? <VitalsPanel patientId={id} caseId={caseId} locked={locked} />
                    : activeTab === "Referrals" ? <ReferralManager patientId={id} caseId={caseId} readOnly={locked} />
                    : <p className="chart-placeholder">{activeTab} is coming soon.</p>}
            </div>
        </main>
    );
}
