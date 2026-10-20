import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { getReferrals, createReferral, updateReferralStatus } from "../services/referralService.js";
import "./ReferralManager.css";

const DISCIPLINES = [
    "Physical Therapy",
    "Pharmacy",
    "Occupational Therapy",
    "Speech-Language Pathology",
    "Nursing",
    "Social Work",
    "Psychiatry",
];

export default function ReferralManager({ patientId, caseId, readOnly = false }) {
    const [referrals, setReferrals] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [discipline, setDiscipline] = useState(DISCIPLINES[0]);
    const [priority, setPriority] = useState("routine");
    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [actionModal, setActionModal] = useState(null);
    const [actionNote, setActionNote] = useState("");

    useEffect(() => {
        loadReferrals();
    }, [patientId, caseId]);

    async function loadReferrals() {
        try {
            const data = await getReferrals({ patientId, caseId });
            setReferrals(data || []);
        } catch (err) {
            console.error("Failed to load referrals:", err);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("account_type")
                .eq("user_id", user.id)
                .single();
            setCurrentUser({ id: user.id, accountType: profile?.account_type });
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await createReferral({
                patientId,
                caseId,
                targetDiscipline: discipline,
                priority,
                reason,
                notes,
            });
            setReason("");
            setNotes("");
            setShowForm(false);
            await loadReferrals();
        } catch (err) {
            console.error("Failed to create referral:", err);
            setError(err.message || "Failed to create referral.");
        } finally {
            setLoading(false);
        }
    }

    async function handleStatus(id, newStatus, responseNotes = null) {
        setError("");
        try {
            await updateReferralStatus(id, newStatus, responseNotes);
            await loadReferrals();
        } catch (err) {
            console.error("Failed to update referral:", err);
            setError(err.message || "Failed to update referral.");
        }
    }

    return (
        <div className="referral-container">
            <div className="referral-header">
                <h3>Specialty Referrals</h3>
                {!readOnly && (
                    <button type="button" onClick={() => { setShowForm(!showForm); setError(""); }}>
                        {showForm ? "Cancel" : "+ New Referral"}
                    </button>
                )}
            </div>

            {error && <p className="referral-error" role="alert">{error}</p>}

            {showForm && (
                <form className="referral-form" onSubmit={handleSubmit}>
                    <label>
                        Specialty
                        <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                            {DISCIPLINES.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Priority
                        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                            <option value="routine">Routine</option>
                            <option value="urgent">Urgent</option>
                            <option value="stat">Stat</option>
                        </select>
                    </label>

                    <input
                        type="text"
                        placeholder="Reason for referral (e.g. Gait evaluation)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                    />

                    <textarea
                        placeholder="Clinical notes / summary..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                    />

                    <button type="submit" disabled={loading}>
                        {loading ? "Submitting..." : "Submit Referral"}
                    </button>
                </form>
            )}

            {referrals.length === 0 ? (
                <p className="referral-empty">No referrals recorded.</p>
            ) : (
                referrals.map((r) => {
                    const isStaff = currentUser?.accountType === "instructor" || currentUser?.accountType === "admin";
                    const isAuthor = r.referring_user_id === currentUser?.id;
                    const canAcceptOrComplete = isStaff || !isAuthor;

                    return (
                        <div key={r.id} className="referral-card">
                            <div className="referral-card-header">
                                <strong>{r.target_discipline} ({r.priority.toUpperCase()})</strong>
                                <span className="referral-status">{r.status}</span>
                            </div>
                            <p className="referral-meta">
                                Referred by {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "Clinical Provider"} · {new Date(r.created_at).toLocaleDateString()}
                            </p>
                            <p className="referral-reason">{r.reason}</p>
                            {r.notes && <p className="referral-notes">{r.notes}</p>}
                            {r.response_notes && (
                                <div className="referral-response">
                                    <strong>Response / Findings:</strong> {r.response_notes}
                                </div>
                            )}

                            {(!readOnly || isStaff) && (
                                actionModal?.id === r.id ? (
                                    <div className="referral-action-box">
                                        <textarea
                                            placeholder={actionModal.status === "completed" ? "Consult findings / recommendations..." : "Reason for return or cancellation..."}
                                            value={actionNote}
                                            onChange={(e) => setActionNote(e.target.value)}
                                            rows={2}
                                        />
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleStatus(r.id, actionModal.status, actionNote.trim() || null);
                                                    setActionModal(null);
                                                    setActionNote("");
                                                }}
                                            >
                                                Confirm {actionModal.status === "completed" ? "Complete" : "Cancel"}
                                            </button>
                                            <button type="button" onClick={() => { setActionModal(null); setActionNote(""); }}>
                                                Back
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="referral-actions">
                                        {canAcceptOrComplete && (
                                            <>
                                                {r.status === "pending" && (
                                                    <button type="button" onClick={() => handleStatus(r.id, "accepted")}>
                                                        Accept
                                                    </button>
                                                )}
                                                {r.status === "accepted" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setActionModal({ id: r.id, status: "completed" });
                                                            setActionNote("");
                                                        }}
                                                    >
                                                        Complete
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {(isStaff || isAuthor) && r.status !== "cancelled" && r.status !== "completed" && (
                                            <button
                                                type="button"
                                                className="btn-cancel"
                                                onClick={() => {
                                                    setActionModal({ id: r.id, status: "cancelled" });
                                                    setActionNote("");
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}