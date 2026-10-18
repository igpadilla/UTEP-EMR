import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import VitalsPanel from "../components/vitals/VitalsPanel.jsx";
import MedicationSelector from "../components/MedicationSelector.jsx";
import TagSelector from "../components/TagSelector.jsx";

export default function PatientDetail({ id, onNavigate }) {
    const [patient, setPatient] = useState(null);
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({});
    const [editMeds, setEditMeds] = useState([]);
    const [activeTab, setActiveTab] = useState("allergies");

    useEffect(() => {
        fetchData();
    }, [id]);

    async function fetchData() {
        setLoading(true);
        const [patientRes, visitsRes] = await Promise.all([
            supabase.from("patients").select("*").eq("id", id).single(),
            supabase.from("visits").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
        ]);

        if (patientRes.error) {
            console.error("Failed to fetch patient:", patientRes.error);
            setError("Patient not found.");
        } else {
            setPatient(patientRes.data);
            setForm(toForm(patientRes.data));
        }

        if (!visitsRes.error) setVisits(visitsRes.data);

        setLoading(false);
    }

    // Keep fetchPatient pointing to fetchData for existing callers
    const fetchPatient = fetchData;

    function toForm(data) {
        return {
            first_name: data.first_name ?? "",
            last_name: data.last_name ?? "",
            age: data.age ?? "",
            sex: data.sex ?? "",
            occupation: data.occupation ?? "",
            last_visit: data.last_visit ?? "",
            last_visit_notes: data.last_visit_notes ?? "",
            date_of_birth: data.date_of_birth ?? "",
            phone_number: data.phone_number ?? "",
            email: data.email ?? "",
            allergies: Array.isArray(data.allergies) ? data.allergies: [],
            medical_history: Array.isArray(data.medical_history) ? data.medical_history : [],
            emergency_contact_name: data.emergency_contacts?.[0]?.name ?? "",
            emergency_contact_phone: data.emergency_contacts?.[0]?.phone ?? "",
        };
    }

    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        setError("");

        const { error } = await supabase
            .from("patients")
            .update({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                date_of_birth: form.date_of_birth || null,
                phone_number: form.phone_number || null,
                email: form.email || null,
                allergies: form.allergies,
                medical_history: form.medical_history,
                emergency_contacts: [{
                    name: form.emergency_contact_name,
                    phone: form.emergency_contact_phone
                }],
                age: parseInt(form.age, 10),
                sex: form.sex || null,
                occupation: form.occupation.trim() || null,
                current_medications: editMeds,
                last_visit: form.last_visit || null,
                last_visit_notes: form.last_visit_notes.trim() || null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id);

        if (error) {
            console.error("Failed to save:", error);
            setError("Failed to save changes. Please try again.");
        } else {
            await fetchPatient();
            setEditing(false);
        }

        setSaving(false);
    }

    async function handleDelete() {
        if (!confirm(`Delete ${patient.first_name} ${patient.last_name}? This cannot be undone.`)) return;

        const { error } = await supabase.from("patients").delete().eq("id", id);

        if (error) {
            console.error("Failed to delete:", error);
            setError("Failed to delete patient.");
        } else {
            onNavigate("patientManager");
        }
    }

    if (loading) return <p>Loading patient...</p>;
    if (error && !patient) return <p role="alert">{error}</p>;

    return (
        <main>
            <div className="scaffold-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h1>{patient.first_name} {patient.last_name}</h1>
                    <button onClick={() => onNavigate("patientManager")}>← Back</button>
                </div>

                <p style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#888" }}>
                    ID: {patient.id}
                </p>

                {error && <p role="alert" style={{ color: "red" }}>{error}</p>}

                {editing ? (
                    <form onSubmit={handleSave}>
                        <div style={rowStyle}>
                            <div style={fieldStyle}>
                                <label>First Name</label>
                                <input name="first_name" value={form.first_name} onChange={handleChange} required />
                            </div>
                            <div style={fieldStyle}>
                                <label>Last Name</label>
                                <input name="last_name" value={form.last_name} onChange={handleChange} required />
                            </div>
                        </div>
                                                <div style={rowStyle}>
                            <div style={fieldStyle}>
                                <label>Date of Birth</label>
                                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} />
                            </div>
                            <div style={fieldStyle}>
                                <label>Phone</label>
                                <input name="phone_number" value={form.phone_number} onChange={handleChange} />
                            </div>
                            <div style={fieldStyle}>
                                <label>Email</label>
                                <input type="email" name="email" value={form.email} onChange={handleChange} />
                            </div>
                        </div>

                        <div style={rowStyle}>
                            <div style={fieldStyle}>
                                <label>Emergency Contact Name</label>
                                <input name="emergency_contact_name" value={form.emergency_contact_name} onChange={handleChange} />
                            </div>
                            <div style={fieldStyle}>
                                <label>Emergency Contact Phone</label>
                                <input name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={handleChange} />
                            </div>
                        </div>

                        <div style={rowStyle}>
                            <div style={fieldStyle}>
                                <label>Age</label>
                                <input name="age" type="number" min="0" max="150" value={form.age} onChange={handleChange} required />
                            </div>
                            <div style={fieldStyle}>
                                <label>Sex</label>
                                <select name="sex" value={form.sex} onChange={handleChange}>
                                    <option value="">— Select —</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label>Occupation</label>
                                <input name="occupation" value={form.occupation} onChange={handleChange} />
                            </div>
                        </div>

                        <div style={{ padding: "1rem", border: "1px solid #e0e0e0", borderRadius: "8px", background: "#fcfcfc", marginBottom: "1rem" }}>
                            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid #ccc", paddingBottom: "0.5rem" }}>
                                <button type="button" onClick={() => setActiveTab("allergies")} style={activeTab === "allergies" ? activeTabStyle : inactiveTabStyle}>Allergies</button>
                                <button type="button" onClick={() => setActiveTab("history")} style={activeTab === "history" ? activeTabStyle : inactiveTabStyle}>Medical History</button>
                                <button type="button" onClick={() => setActiveTab("medications")} style={activeTab === "medications" ? activeTabStyle : inactiveTabStyle}>Medications</button>
                            </div>

                            {activeTab === "allergies" && (
                                <div style={fieldStyle}>
                                    <TagSelector 
                                        value={form.allergies} 
                                        onChange={(newVal) => setForm({...form, allergies: newVal})} 
                                        placeholder="Add allergy..." 
                                    />
                                </div>
                            )}

                            {activeTab === "history" && (
                                <div style={fieldStyle}>
                                    <TagSelector 
                                        value={form.medical_history} 
                                        onChange={(newVal) => setForm({...form, medical_history: newVal})} 
                                        placeholder="Add condition..." 
                                    />
                                </div>
                            )}

                            {activeTab === "medications" && (
                                <div style={fieldStyle}>
                                    <MedicationSelector value={editMeds} onChange={setEditMeds} />
                                </div>
                            )}
                        </div>

                        <div style={fieldStyle}>
                            <label>Last Visit</label>
                            <input name="last_visit" type="date" value={form.last_visit} onChange={handleChange} />
                        </div>

                        <div style={fieldStyle}>
                            <label>Last Visit Notes</label>
                            <textarea name="last_visit_notes" value={form.last_visit_notes} onChange={handleChange} rows={4} />
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                            <button type="button" onClick={() => { setEditing(false); setForm(toForm(patient)); setEditMeds(Array.isArray(patient.current_medications) ? patient.current_medications : []); setError(""); }}>Cancel</button>
                        </div>
                    </form>
                ) : (
                    <>
                        <div style={sectionStyle}>
                            <h3>Basic Info</h3>
                            <Detail label="Date of Birth" value={patient.date_of_birth} />
                            <Detail label="Phone" value={patient.phone_number} />
                            <Detail label="Email" value={patient.email} />
                            <Detail label="Emergency Contact" value={patient.emergency_contacts?.[0] ? `${patient.emergency_contacts[0].name} (${patient.emergency_contacts[0].phone})` : null} />
                            <Detail label="Age" value={patient.age} />
                            <Detail label="Sex" value={patient.sex} />
                            <Detail label="Occupation" value={patient.occupation} />
                        </div>

                        <div style={sectionStyle}>
                            <h3>Medical</h3>
                            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1rem", borderBottom: "1px solid #ccc", paddingBottom: "0.5rem" }}>
                                <button onClick={() => setActiveTab("allergies")} style={activeTab === "allergies" ? activeTabStyle : inactiveTabStyle}>Allergies</button>
                                <button onClick={() => setActiveTab("history")} style={activeTab === "history" ? activeTabStyle : inactiveTabStyle}>Medical History</button>
                                <button onClick={() => setActiveTab("medications")} style={activeTab === "medications" ? activeTabStyle : inactiveTabStyle}>Medications</button>
                            </div>

                            {activeTab === "allergies" && (
                                <div>
                                    {(!patient.allergies || patient.allergies.length === 0) ? <p style={{ color: "#aaa" }}>No allergies recorded.</p> : (
                                        <TagSelector value={patient.allergies} readOnly={true} />
                                    )}
                                </div>
                            )}

                            {activeTab === "history" && (
                                <div>
                                    {(!patient.medical_history || patient.medical_history.length === 0) ? <p style={{ color: "#aaa" }}>No medical history recorded.</p> : (
                                        <TagSelector value={patient.medical_history} readOnly={true} />
                                    )}
                                </div>
                            )}

                            {activeTab === "medications" && (
                                <div>
                                    {(!patient.current_medications || patient.current_medications.length === 0) ? <p style={{ color: "#aaa" }}>No medications recorded.</p> : (
                                        <TagSelector 
                                            value={patient.current_medications.map(m => `${m.medicine.name} ${m.dosage}${m.medicine.unit} ${m.frequency}x/day`)} 
                                            readOnly={true} 
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        <VitalsPanel patientId={id} />

                        <div style={sectionStyle}>
                            <h3>Visit History</h3>
                            {visits.length === 0 ? (
                                <p style={{ color: "#aaa" }}>No visits recorded.</p>
                            ) : (
                                visits.map((v) => (
                                    <div key={v.id} style={visitCardStyle}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <strong>{v.visit_type ?? "Visit"}</strong>
                                            <span style={{ color: "#888", fontSize: "0.85rem" }}>
                                                {new Date(v.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {v.medications && <Detail label="Medications" value={v.medications} />}
                                        {v.notes && <Detail label="Notes" value={v.notes} />}
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem" }}>
                            <button onClick={() => { setEditing(true); setEditMeds(Array.isArray(patient.current_medications) ? patient.current_medications : []); }}>Edit Patient</button>
                            <button onClick={handleDelete} style={{ color: "red" }}>Delete Patient</button>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}

function Detail({ label, value }) {
    return (
        <div style={{ marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold" }}>{label}: </span>
            <span>{value ?? <em style={{ color: "#aaa" }}>Not set</em>}</span>
        </div>
    );
}

const rowStyle = {
    display: "flex",
    gap: "1rem",
};

const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    marginBottom: "0.75rem",
    flex: 1,
};

const sectionStyle = {
    marginBottom: "1.5rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid #eee",
    textAlign: "left"
};

const visitCardStyle = {
    padding: "0.75rem",
    marginBottom: "0.75rem",
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
};

const activeTabStyle = {
    background: "none",
    border: "none",
    borderBottom: "2px solid #0056b3",
    color: "#0056b3",
    fontWeight: "bold",
    cursor: "pointer",
    padding: "0 0 0.25rem 0",
};

const inactiveTabStyle = {
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    padding: "0 0 0.25rem 0",
};
