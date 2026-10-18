import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import MedicationSelector from "../components/MedicationSelector.jsx";
import ReferralManager from "../components/ReferralManager.jsx";

const VISIT_TYPES = ["Initial", "Follow-up", "Emergency", "Routine", "Specialist", "Other"];
const APPT_TYPES  = ["Follow-up", "Initial Consultation", "Specialist Referral", "Routine Check-up", "Emergency", "Other"];

export default function StudentPatientDetail({ id, onNavigate }) {
    const [patient, setPatient] = useState(null);
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);

    // visit form
    const [showVisitForm, setShowVisitForm] = useState(false);
    const [visitForm, setVisitForm] = useState({ visit_type: "Follow-up", notes: "" });
    const [selectedMeds, setSelectedMeds] = useState([]); // [{ medicine, dosage, frequency }]
    const [visitSubmitting, setVisitSubmitting] = useState(false);
    const [visitError, setVisitError] = useState("");

    // appointment form
    const [showApptForm, setShowApptForm] = useState(false);
    const [apptForm, setApptForm] = useState({ appointment_type: "Follow-up", scheduled_date: "", scheduled_time: "", notes: "" });
    const [apptSubmitting, setApptSubmitting] = useState(false);
    const [apptError, setApptError] = useState("");

    useEffect(() => {
        fetchData();
    }, [id]);

    async function fetchData() {
        setLoading(true);
        const [patientRes, visitsRes] = await Promise.all([
            supabase.from("patients").select("id, first_name, last_name, age, sex, occupation").eq("id", id).single(),
            supabase.from("visits").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
        ]);

        if (!patientRes.error) setPatient(patientRes.data);
        if (!visitsRes.error) setVisits(visitsRes.data);

        setLoading(false);
    }

    async function handleAddVisit(e) {
        e.preventDefault();
        setVisitError("");
        setVisitSubmitting(true);

        const { data: { user } } = await supabase.auth.getUser();

        const medicationsText = selectedMeds.length > 0
            ? selectedMeds.map((m) => `${m.medicine.name} ${m.dosage}${m.medicine.unit} ${m.frequency}x/day`).join(", ")
            : null;

        const { error } = await supabase.from("visits").insert({
            patient_id: id,
            visit_type: visitForm.visit_type,
            notes: visitForm.notes.trim() || null,
            medications: medicationsText,
            created_by: user.id,
        });

        if (error) {
            setVisitError("Failed to add visit. Please try again.");
        } else {
            setVisitForm({ visit_type: "Follow-up", notes: "" });
            setSelectedMeds([]);
            setShowVisitForm(false);
            await fetchData();
        }
        setVisitSubmitting(false);
    }

    async function handleScheduleAppt(e) {
        e.preventDefault();
        setApptError("");
        setApptSubmitting(true);

        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("appointments").insert({
            patient_id: id,
            appointment_type: apptForm.appointment_type,
            scheduled_date: apptForm.scheduled_date,
            scheduled_time: apptForm.scheduled_time || null,
            notes: apptForm.notes.trim() || null,
            created_by: user.id,
        });

        if (error) {
            setApptError("Failed to schedule appointment. Please try again.");
        } else {
            setApptForm({ appointment_type: "Follow-up", scheduled_date: "", scheduled_time: "", notes: "" });
            setShowApptForm(false);
        }
        setApptSubmitting(false);
    }

    const currentMedications = visits.find((v) => v.medications)?.medications;

    if (loading) return <p>Loading patient...</p>;
    if (!patient) return <p role="alert">Patient not found.</p>;

    return (
        <main>
            <div className="scaffold-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h1>{patient.first_name} {patient.last_name}</h1>
                    <button onClick={() => onNavigate("patientLookup")}>← Back</button>
                </div>

                {/* Basic Info */}
                <div style={sectionStyle}>
                    <h3>Patient Info</h3>
                    <Detail label="Age" value={patient.age} />
                    <Detail label="Sex" value={patient.sex} />
                    <Detail label="Occupation" value={patient.occupation} />
                </div>

                <button className="primary-action-button" onClick={() => onNavigate("patientChart", id, { backTo: "studentPatientDetail" })}>Open chart</button>

                {/* Current Medications */}
                <div style={sectionStyle}>
                    <h3>Current Medications</h3>
                    {currentMedications
                        ? <p>{currentMedications}</p>
                        : <p style={{ color: "#aaa" }}>No medications on record.</p>
                    }
                </div>

                {/* Schedule Appointment */}
                <div style={sectionStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3>Schedule Appointment</h3>
                        <button onClick={() => { setShowApptForm(!showApptForm); setApptError(""); }}>
                            {showApptForm ? "Cancel" : "+ Schedule"}
                        </button>
                    </div>

                    {showApptForm && (
                        <form onSubmit={handleScheduleAppt} style={inlineFormStyle}>
                            <div style={fieldStyle}>
                                <label>Appointment Type</label>
                                <select
                                    name="appointment_type"
                                    value={apptForm.appointment_type}
                                    onChange={(e) => setApptForm({ ...apptForm, appointment_type: e.target.value })}
                                >
                                    {APPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div style={{ display: "flex", gap: "1rem" }}>
                                <div style={{ ...fieldStyle, flex: 1 }}>
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        value={apptForm.scheduled_date}
                                        onChange={(e) => setApptForm({ ...apptForm, scheduled_date: e.target.value })}
                                        min={new Date().toISOString().split("T")[0]}
                                        required
                                    />
                                </div>
                                <div style={{ ...fieldStyle, flex: 1 }}>
                                    <label>Time (optional)</label>
                                    <input
                                        type="time"
                                        value={apptForm.scheduled_time}
                                        onChange={(e) => setApptForm({ ...apptForm, scheduled_time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={fieldStyle}>
                                <label>Notes (optional)</label>
                                <textarea
                                    value={apptForm.notes}
                                    onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })}
                                    rows={2}
                                    placeholder="Any notes for this appointment..."
                                />
                            </div>

                            {apptError && <p role="alert" style={{ color: "red" }}>{apptError}</p>}

                            <button type="submit" disabled={apptSubmitting}>
                                {apptSubmitting ? "Scheduling..." : "Confirm Appointment"}
                            </button>
                        </form>
                    )}
                </div>

                {/* Visits */}
                <div style={sectionStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3>Visits</h3>
                        <button onClick={() => { setShowVisitForm(!showVisitForm); setVisitError(""); }}>
                            {showVisitForm ? "Cancel" : "+ Add Visit"}
                        </button>
                    </div>

                    {showVisitForm && (
                        <form onSubmit={handleAddVisit} style={inlineFormStyle}>
                            <div style={fieldStyle}>
                                <label>Visit Type</label>
                                <select
                                    name="visit_type"
                                    value={visitForm.visit_type}
                                    onChange={(e) => setVisitForm({ ...visitForm, visit_type: e.target.value })}
                                >
                                    {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div style={fieldStyle}>
                                <label>Medications</label>
                                <MedicationSelector
                                    value={selectedMeds}
                                    onChange={setSelectedMeds}
                                />
                            </div>

                            <div style={fieldStyle}>
                                <label>Notes</label>
                                <textarea
                                    value={visitForm.notes}
                                    onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                                    rows={4}
                                    placeholder="Visit notes..."
                                />
                            </div>

                            {visitError && <p role="alert" style={{ color: "red" }}>{visitError}</p>}

                            <button type="submit" disabled={visitSubmitting}>
                                {visitSubmitting ? "Saving..." : "Save Visit"}
                            </button>
                        </form>
                    )}

                    {visits.length === 0 ? (
                        <p style={{ color: "#aaa", marginTop: "0.5rem" }}>No visits recorded.</p>
                    ) : (
                        <div style={{ marginTop: "1rem" }}>
                            {visits.map((v) => (
                                <div key={v.id} style={cardStyle}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <strong>{v.visit_type ?? "Visit"}</strong>
                                        <span style={{ color: "#888", fontSize: "0.85rem" }}>
                                            {new Date(v.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {v.medications && <Detail label="Medications" value={v.medications} />}
                                    {v.notes && <Detail label="Notes" value={v.notes} />}
                                </div>
                            ))}
                        </div>
                    )}
                    <ReferralManager patientId={id} />
                </div>
            </div>
        </main>
    );
}

function Detail({ label, value }) {
    return (
        <div style={{ marginBottom: "0.4rem" }}>
            <span style={{ fontWeight: "bold" }}>{label}: </span>
            <span>{value ?? <em style={{ color: "#aaa" }}>Not set</em>}</span>
        </div>
    );
}

const sectionStyle = { marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid #eee" };
const fieldStyle   = { display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem" };
const cardStyle    = { padding: "0.75rem", marginBottom: "0.75rem", border: "1px solid #e0e0e0", borderRadius: "6px" };
const inlineFormStyle = { marginTop: "1rem", padding: "1rem", background: "#f9f9f9", borderRadius: "6px" };
