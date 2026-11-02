import { useState } from "react";
import { supabase } from "../supabase.js";
import PatientRegistrationForm from "../components/PatientRegistrationForm.jsx";

// access says what this role may do with live patients; front desk may register.
export default function PatientLookup({ onNavigate, access = { register: true } }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [registering, setRegistering] = useState(false);

    async function handleSearch(e) {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setSearched(false);

        const q = query.trim();
        // Check if the query is a valid UUID (patient ID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const filter = uuidRegex.test(q)
            ? `id.eq.${q},first_name.ilike.%${q}%,last_name.ilike.%${q}%`
            : `first_name.ilike.%${q}%,last_name.ilike.%${q}%`;

        const { data, error } = await supabase
            .from("patients")
            .select("id, first_name, last_name, age")
            .or(filter);

        if (error) {
            console.error("Lookup failed:", error);
        } else {
            setResults(data);
        }

        setSearched(true);
        setLoading(false);
    }

    return (
        <main>
            <div className="scaffold-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h1>Patient Lookup</h1>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        {access.register && (
                            <button onClick={() => setRegistering(!registering)}>
                                {registering ? "← Back to Lookup" : "+ Register Patient"}
                            </button>
                        )}
                        <button onClick={() => onNavigate("dashboard")}>← Back</button>
                    </div>
                </div>

                {access.register && registering && (
                    <PatientRegistrationForm onPatientCreated={() => setRegistering(false)} />
                )}

                {!registering && <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                    <input
                        type="text"
                        placeholder="Search by name or patient ID..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ flex: 1, padding: "0.5rem" }}
                    />
                    <button type="submit" disabled={loading}>
                        {loading ? "Searching..." : "Search"}
                    </button>
                </form>}

                {!registering && searched && results.length === 0 && (
                    <p>No patients found for "<strong>{query}</strong>".</p>
                )}

                {!registering && results.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>First Name</th>
                                <th style={thStyle}>Last Name</th>
                                <th style={thStyle}>Age</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((p) => (
                                <tr
                                    key={p.id}
                                    onClick={() => onNavigate("studentPatientDetail", p.id)}
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                                    onMouseLeave={e => e.currentTarget.style.background = ""}
                                >
                                    <td style={tdStyle}>{p.first_name}</td>
                                    <td style={tdStyle}>{p.last_name}</td>
                                    <td style={tdStyle}>{p.age}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </main>
    );
}

const thStyle = {
    textAlign: "left",
    padding: "0.5rem",
    borderBottom: "2px solid #ccc",
};

const tdStyle = {
    padding: "0.5rem",
    borderBottom: "1px solid #eee",
};
