import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import VitalsPanel from "../components/vitals/VitalsPanel.jsx";
import ReferralManager from "../components/ReferralManager.jsx";
import "./PatientChart.css";

// Case statuses where the student can still change their copy (same as StudentCases.jsx).
const EDITABLE_STATUSES = ["not started", "in progress", "revision_requested"];

// Chart sections. Vitals and Referrals are built; the rest are placeholders.
const TABS = ["Summary", "Vitals", "Notes", "Medications", "Allergies & History", "Visits", "Referrals"];

// Patient chart: banner + section tabs. `backTo` is the page to return to.
// With `caseId` it shows the student's copy of the patient from that assigned case.
export default function PatientChart({ id, caseId, backTo, onNavigate }) {
    const [patient, setPatient] = useState(null);
    const [caseStatus, setCaseStatus] = useState(null);
    const [activeTab, setActiveTab] = useState("Vitals");

    useEffect(() => {
        if (caseId) {
            supabase
                .from("assigned_cases")
                .select("patient_snapshot, encounter_status")
                .eq("id", caseId)
                .single()
                .then(({ data }) => {
                    setPatient(data?.patient_snapshot ?? null);
                    setCaseStatus(data?.encounter_status ?? null);
                });
        } else {
            supabase
                .from("patients")
                .select("first_name, last_name, age, sex, date_of_birth, allergies")
                .eq("id", id)
                .single()
                .then(({ data }) => setPatient(data));
        }
    }, [id, caseId]);

    if (!patient) return <p>Loading chart...</p>;

    const allergies = patient.allergies ?? [];
    // A submitted case is read-only for the student (vitals and referrals).
    const locked = Boolean(caseId) && !EDITABLE_STATUSES.includes(caseStatus);

    return (
        <main className="chart-page">
            <section className="chart-header">
                <div className="chart-banner">
                    <div>
                        <h1>
                            {patient.first_name} {patient.last_name}
                            {caseId && <span className="chart-case-tag">Case copy</span>}
                        </h1>
                        <p className="chart-banner-details">
                            {patient.age} y · {patient.sex ?? "Sex not set"}
                            {patient.date_of_birth && ` · DOB ${patient.date_of_birth}`}
                        </p>
                    </div>
                    <div className="chart-banner-right">
                        {allergies.length > 0 ? (
                            <span className="chart-allergies">Allergies: {allergies.join(", ")}</span>
                        ) : (
                            <span className="chart-no-allergies">No known allergies</span>
                        )}
                        <button onClick={() => onNavigate(backTo ?? "patientLookup", id)}>← Back</button>
                    </div>
                </div>

                <nav className="chart-tabs" aria-label="Chart sections">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            className={tab === activeTab ? "chart-tab chart-tab-active" : "chart-tab"}
                            aria-current={tab === activeTab ? "page" : undefined}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </nav>
            </section>

            <div className="chart-content">
                {activeTab === "Vitals" ? (
                    <VitalsPanel patientId={id} caseId={caseId} locked={locked} />
                ) : activeTab === "Referrals" ? (
                    <ReferralManager patientId={id} caseId={caseId} readOnly={locked} />
                ) : (
                    <p className="chart-placeholder">{activeTab} is coming soon.</p>
                )}
            </div>
        </main>
    );
}
