import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import MedicationSelector from "../components/MedicationSelector.jsx";

const VISIT_TYPES = ["Initial", "Follow-up", "Emergency", "Routine", "Specialist", "Other"];

const STATUS_COLORS = {
    scheduled: { background: "#e8f4fd", color: "#1a6fa8" },
    completed:  { background: "#e8f8e8", color: "#2a7a2a" },
    cancelled:  { background: "#fdecea", color: "#c0392b" },
};

// access says what this role may do with live patients; a biller only reads.
export default function Appointments({ onNavigate, access = { schedule: true, checkIn: true } }) {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("scheduled");

    // Start visit modal
    const [activeAppt, setActiveAppt] = useState(null);
    const [visitForm, setVisitForm] = useState({ visit_type: "Follow-up", notes: "" });
    const [selectedMeds, setSelectedMeds] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [visitError, setVisitError] = useState("");

    useEffect(() => {
        fetchAppointments();
    }, []);

    async function fetchAppointments() {
        setLoading(true);
        const { data, error } = await supabase
            .from("appointments")
            .select("*, patients(first_name, last_name)")
            .order("scheduled_date", { ascending: true })
            .order("scheduled_time", { ascending: true });

        if (error) {
            console.error("Failed to fetch appointments:", error);
        } else {
            setAppointments(data);
        }
        setLoading(false);
    }

    async function handleStatusChange(apptId, newStatus) {
        const { error } = await supabase
            .from("appointments")
            .update({ status: newStatus })
            .eq("id", apptId);

        if (!error) await fetchAppointments();
    }

    function openStartModal(appt) {
        setActiveAppt(appt);
        setVisitForm({ visit_type: "Follow-up", notes: "" });
        setSelectedMeds([]);
        setVisitError("");
    }

    function closeModal() {
        setActiveAppt(null);
        setVisitError("");
    }

    async function handleStartVisit(e) {
        e.preventDefault();
        setVisitError("");
        setSubmitting(true);

        const { data: { user } } = await supabase.auth.getUser();

        const medicationsText = selectedMeds.length > 0
            ? selectedMeds.map((m) => `${m.medicine.name} ${m.dosage}${m.medicine.unit} ${m.frequency}x/day`).join(", ")
            : null;

        const { error: visitError } = await supabase.from("visits").insert({
            patient_id: activeAppt.patient_id,
            visit_type: visitForm.visit_type,
            notes: visitForm.notes.trim() || null,
            medications: medicationsText,
            created_by: user.id,
        });

        if (visitError) {
            setVisitError("Failed to save visit. Please try again.");
            setSubmitting(false);
            return;
        }

        await handleStatusChange(activeAppt.id, "completed");
        setSubmitting(false);
        closeModal();
    }

    const filtered = filter === "all"
        ? appointments
        : appointments.filter((a) => a.status === filter);

    return (
        <main>
            <div className="scaffold-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h1>Appointments</h1>
                    <button onClick={() => onNavigate("dashboard")}>← Back</button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
                    {["scheduled", "completed", "cancelled", "all"].map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            style={{
                                padding: "0.3rem 0.8rem",
                                borderRadius: "999px",
                                border: "1px solid #ccc",
                                background: filter === s ? "#333" : "#fff",
                                color: filter === s ? "#fff" : "#333",
                                cursor: "pointer",
                                textTransform: "capitalize",
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p>Loading appointments...</p>
                ) : filtered.length === 0 ? (
                    <p style={{ color: "#aaa" }}>No {filter === "all" ? "" : filter} appointments.</p>
                ) : (
                    filtered.map((a) => (
                        <div key={a.id} style={cardStyle}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                                <div>
                                    <strong style={{ fontSize: "1rem" }}>
                                        {a.patients?.first_name} {a.patients?.last_name}
                                    </strong>
                                    <div style={{ color: "#555", fontSize: "0.9rem" }}>{a.appointment_type}</div>
                                </div>

                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontWeight: "bold" }}>
                                        {new Date(a.scheduled_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                    </div>
                                    {a.scheduled_time && (
                                        <div style={{ color: "#555", fontSize: "0.85rem" }}>
                                            {formatTime(a.scheduled_time)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {a.notes && (
                                <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", color: "#444" }}>{a.notes}</p>
                            )}

                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                                <span style={{ ...badgeStyle, ...STATUS_COLORS[a.status] }}>
                                    {a.status}
                                </span>

                                {a.status === "scheduled" && access.checkIn && (
                                    <>
                                        <button style={primaryBtnStyle} onClick={() => openStartModal(a)}>
                                            ▶ Start
                                        </button>
                                        <button
                                            style={{ ...smallBtnStyle, color: "#c0392b" }}
                                            onClick={() => handleStatusChange(a.id, "cancelled")}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                )}

                                <button
                                    style={{ ...smallBtnStyle, marginLeft: "auto" }}
                                    onClick={() => onNavigate("studentPatientDetail", a.patient_id)}
                                >
                                    View Patient →
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Start Visit Modal */}
            {activeAppt && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h2 style={{ marginTop: 0 }}>
                            Start Visit — {activeAppt.patients?.first_name} {activeAppt.patients?.last_name}
                        </h2>
                        <p style={{ color: "#555", marginTop: "-0.5rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
                            {activeAppt.appointment_type} · {new Date(activeAppt.scheduled_date + "T00:00:00").toLocaleDateString()}
                        </p>

                        <form onSubmit={handleStartVisit}>
                            <div style={fieldStyle}>
                                <label>Visit Type</label>
                                <select
                                    value={visitForm.visit_type}
                                    onChange={(e) => setVisitForm({ ...visitForm, visit_type: e.target.value })}
                                >
                                    {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div style={fieldStyle}>
                                <label>Medications</label>
                                <MedicationSelector value={selectedMeds} onChange={setSelectedMeds} />
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

                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                                <button type="submit" disabled={submitting}>
                                    {submitting ? "Saving..." : "Complete Visit"}
                                </button>
                                <button type="button" onClick={closeModal}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

function formatTime(time) {
    const [h, m] = time.split(":");
    const date = new Date();
    date.setHours(parseInt(h), parseInt(m));
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const cardStyle    = { padding: "1rem", marginBottom: "0.75rem", border: "1px solid #e0e0e0", borderRadius: "8px" };
const badgeStyle   = { display: "inline-block", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: "bold", textTransform: "capitalize" };
const smallBtnStyle  = { background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", padding: "0", color: "#333" };
const primaryBtnStyle = { background: "#333", color: "#fff", border: "none", borderRadius: "4px", padding: "0.3rem 0.75rem", cursor: "pointer", fontSize: "0.85rem" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalStyle   = { background: "#fff", padding: "2rem", borderRadius: "8px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflowY: "auto" };
const fieldStyle   = { display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem" };
