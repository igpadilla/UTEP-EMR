import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import PatientRegistrationForm from "../components/PatientRegistrationForm.jsx";

export default function PatientManager({ onNavigate, embedded = false }) {
    const [patients, setPatients] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    const filtered = patients.filter((p) => {
        const q = search.toLowerCase();
        return (
            p.first_name.toLowerCase().includes(q) ||
            p.last_name.toLowerCase().includes(q) ||
            String(p.age).includes(q) ||
            p.id.toLowerCase().includes(q)
        );
    });

    useEffect(() => {
        fetchPatients();
    }, []);

    async function fetchPatients() {
        setLoading(true);
        const { data, error } = await supabase
            .from("patients")
            .select("*")
            .order("created_at", { ascending: false });
        if (!error) setPatients(data);
        setLoading(false);
    }

    const content = (
        <>
            {/* Header */}
            {!embedded && (
                <div className="instructor-page-header">
                    <div>
                        <p className="section-title">Instructor</p>
                        <h2>Patient Manager</h2>
                        <p>Manage the patient registry used for building case templates.</p>
                    </div>
                    {!showForm && (
                        <button
                            className="primary-action-button"
                            type="button"
                            onClick={() => setShowForm(true)}
                        >
                            + Add Patient
                        </button>
                    )}
                </div>
            )}

            {embedded && !showForm && (
                <div className="course-tab-header">
                    <div>
                        <h3 className="course-tab-title">Patients</h3>
                        <p className="course-tab-subtitle">Patient registry for building case templates</p>
                    </div>
                    <button
                        className="primary-action-button"
                        type="button"
                        onClick={() => setShowForm(true)}
                    >
                        + Add Patient
                    </button>
                </div>
            )}

            {/* Registration form */}
            {showForm && (
                <div className="course-detail-section" style={{ marginBottom: "1rem", padding: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>New Patient</h4>
                        <button
                            className="secondary-action-button"
                            type="button"
                            onClick={() => setShowForm(false)}
                        >
                            Cancel
                        </button>
                    </div>
                    <PatientRegistrationForm
                        onPatientCreated={() => {
                            fetchPatients();
                            setShowForm(false);
                        }}
                    />
                </div>
            )}

            {/* Search + table */}
            {!showForm && (
                <div className="course-detail-section">
                    <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                        <input
                            type="text"
                            className="instructor-search-input"
                            placeholder="Search by name or age…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: "100%", boxSizing: "border-box" }}
                        />
                    </div>

                    {loading ? (
                        <p className="instructor-loading">Loading patients…</p>
                    ) : filtered.length === 0 ? (
                        <div className="patients-empty-state">
                            <strong>{search ? "No patients match your search." : "No patients yet."}</strong>
                            {!search && <p>Add a patient to get started.</p>}
                        </div>
                    ) : (
                        <div className="patient-table-wrapper">
                            <table className="patient-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Age</th>
                                        <th>Sex</th>
                                        <th>Added</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p) => (
                                        <tr
                                            key={p.id}
                                            className="instructor-table-row"
                                            onClick={() => onNavigate("patientDetail", p.id)}
                                            style={{ cursor: "pointer" }}
                                        >
                                            <td style={{ fontWeight: 500 }}>{p.first_name} {p.last_name}</td>
                                            <td>{p.age}</td>
                                            <td>{p.sex || "—"}</td>
                                            <td>{new Date(p.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </>
    );

    if (embedded) return <div>{content}</div>;

    return <main className="instructor-main">{content}</main>;
}
