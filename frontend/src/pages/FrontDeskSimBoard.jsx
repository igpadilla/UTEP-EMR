import { useEffect, useRef, useState } from "react";
import {
    getSimulation,
    getSimEncounters,
    getMySimRole,
    checkInEncounter,
    dischargeEncounter,
    subscribeToSimulation,
} from "../services/simulationService.js";
import RoomsSlot from "../components/simulation/RoomsSlot.jsx";
import {
    getSimulationRooms,
    getSimulationRoomAssignments,
} from "../services/simulationRoomService.js";


function patientName(enc) {
    const t = enc.patient_templates;
    return t ? `${t.first_name} ${t.last_name}` : "Patient";
}

function formatTime(t) {
    if (!t) return "—";
    return t.slice(0, 5); // "HH:MM" from "HH:MM:SS"
}

function formatCheckedInTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function FrontDeskSimBoard({ simId, onNavigate }) {
    const [sim, setSim] = useState(null);
    const [encounters, setEncounters] = useState([]);
    const [selected, setSelected] = useState(null); // encounter id
    const [checkingIn, setCheckingIn] = useState(false);
    const [discharging, setDischarging] = useState(false);
    const [error, setError] = useState("");
    const unsubRef = useRef(null);
    const roundRef = useRef(null);
    const [simulationRooms, setSimulationRooms] = useState([]);
    const [roomAssignments, setRoomAssignments] = useState([]);


    async function load() {
        try {
            const [simData, encData] = await Promise.all([
                getSimulation(simId),
                getSimEncounters(simId),
            ]);

            const [roomData, assignmentData] = await Promise.all([
                getSimulationRooms(simId, simData.current_round),
                getSimulationRoomAssignments(simId, simData.current_round),
            ]);

            setSim(simData);
            setEncounters(encData);
            setSimulationRooms(roomData);
            setRoomAssignments(assignmentData);

            // Round switched — navigate to whichever board matches the new role.
            if (roundRef.current !== null && simData.current_round !== roundRef.current) {
                const newRole = await getMySimRole(simId);
                if (newRole === "med") onNavigate("medSim", simId);
                else if (newRole === "patient_actor") onNavigate("patientActorSim", simId);
                else if (newRole === "observer") onNavigate("simulationMonitor", simId);
                // "front_desk" stays on this board — no navigation needed
            }
            roundRef.current = simData.current_round;
        } catch (e) {
            setError(e.message);
        }
    }

    useEffect(() => {
        load();
        unsubRef.current = subscribeToSimulation(simId, load);
        return () => unsubRef.current?.();
    }, [simId]);

    async function handleCheckIn() {
        if (!selected) return;
        setCheckingIn(true);
        setError("");
        try {
            await checkInEncounter(selected);
            setSelected(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setCheckingIn(false);
        }
    }

    async function handleDischarge() {
        if (!selected) return;
        setDischarging(true);
        setError("");
        try {
            await dischargeEncounter(selected);
            setSelected(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setDischarging(false);
        }
    }

    const isEnded = sim?.status === "ended";
    const expected = encounters.filter(e => e.status === "expected").sort((a, b) =>
        (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
    const checkedIn = encounters.filter(e =>
        ["checked_in", "in_progress", "med_complete", "discharged"].includes(e.status));
    const selectedEnc = encounters.find(e => e.id === selected);

    return (
        <div className="emr-app">
            <main className="dashboard-main">
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationLobby", simId)}>
                        ← Lobby
                    </button>
                    <div>
                        <p className="section-title">Front Desk</p>
                        <h2 style={{ margin: 0 }}>{sim?.title ?? "…"}</h2>
                    </div>
                    {isEnded && (
                        <span style={{
                            marginLeft: "auto", background: "#f1f5f9", color: "#64748b",
                            padding: "0.4rem 0.9rem", borderRadius: "6px", fontWeight: 600, fontSize: "0.875rem"
                        }}>
                            Simulation ended — read only
                        </span>
                    )}
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                <div style={{ display: "grid", gridTemplateColumns: selectedEnc ? "1fr 320px" : "1fr", gap: "1.25rem" }}>

                    {/* ── Left column ── */}
                    <div>
                        {/* Expected patients */}
                        <section className="course-detail-section" style={{ marginBottom: "1.25rem" }}>
                            <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                <h4 style={{ margin: 0 }}>Expected patients ({expected.length})</h4>
                                <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    Select a patient to check them in.
                                </p>
                            </div>
                            {expected.length === 0 ? (
                                <p style={{ padding: "1.25rem", color: "var(--text-muted)", margin: 0, fontSize: "0.875rem" }}>
                                    No more expected patients.
                                </p>
                            ) : (
                                expected.map(enc => (
                                    <button key={enc.id} type="button"
                                        onClick={() => !isEnded && setSelected(selected === enc.id ? null : enc.id)}
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "60px 1fr",
                                            gap: "0.75rem",
                                            padding: "0.9rem 1.25rem",
                                            borderBottom: "1px solid var(--border)",
                                            background: selected === enc.id ? "#eff6ff" : "#fff",
                                            border: "none",
                                            width: "100%",
                                            textAlign: "left",
                                            cursor: isEnded ? "default" : "pointer",
                                            borderLeft: selected === enc.id ? "3px solid #2563eb" : "3px solid transparent",
                                        }}>
                                        <span style={{ fontWeight: 700, color: "#2563eb", fontSize: "1rem", paddingTop: "2px" }}>
                                            {formatTime(enc.scheduled_time)}
                                        </span>
                                        <span>
                                            <strong style={{ display: "block" }}>{patientName(enc)}</strong>
                                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                {enc.patient_templates?.age && `${enc.patient_templates.age}y `}
                                                {enc.patient_templates?.sex && `${enc.patient_templates.sex} · `}
                                                {enc.patient_templates?.chief_complaint}
                                            </span>
                                        </span>
                                    </button>
                                ))
                            )}
                        </section>

                        {/* Checked-in log */}
                        <section className="course-detail-section">
                            <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                                <h4 style={{ margin: 0 }}>Checked-in log ({checkedIn.length})</h4>
                            </div>
                            {checkedIn.length === 0 ? (
                                <p style={{ padding: "1.25rem", color: "var(--text-muted)", margin: 0, fontSize: "0.875rem" }}>
                                    No patients checked in yet.
                                </p>
                            ) : (
                                <>
                                    <div style={{
                                        display: "grid", gridTemplateColumns: "1fr 100px 100px",
                                        padding: "0.5rem 1.25rem", background: "#f8fafc",
                                        fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
                                        letterSpacing: "0.04em", color: "var(--text-muted)",
                                        borderBottom: "1px solid var(--border)"
                                    }}>
                                        <span>Patient</span>
                                        <span>Checked in</span>
                                        <span>Room</span>
                                    </div>
                                    {checkedIn.map(enc => {
                                        const canDischarge = enc.status === "med_complete";
                                        const isDischarged = enc.status === "discharged";
                                        const isSelected = selected === enc.id;
                                        const assignment = roomAssignments.find(a => a.encounter_id === enc.id);
                                        const assignedRoom = assignment ? simulationRooms.find(
                                            room => room.id === assignment.simulation_room_id
                                        ) : null;
                                        return (
                                            <div key={enc.id}
                                                onClick={() => !isEnded && (enc.status === "checked_in" || canDischarge) && setSelected(isSelected ? null : enc.id)}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "1fr 100px 110px",
                                                    padding: "0.75rem 1.25rem",
                                                    borderBottom: "1px solid var(--border)",
                                                    alignItems: "center", fontSize: "0.875rem",
                                                    background: isSelected ? "#eff6ff" : canDischarge ? "#f0fdf4" : "#fff",
                                                    borderLeft: isSelected ? "3px solid #2563eb" : canDischarge ? "3px solid #15803d" : "3px solid transparent",
                                                    cursor: (enc.status === "checked_in" || canDischarge) && !isEnded ? "pointer" : "default",
                                                }}>
                                                <span>
                                                    <strong>{patientName(enc)}</strong>
                                                    <span style={{
                                                        marginLeft: "0.5rem", fontSize: "0.72rem", fontWeight: 600,
                                                        color: isDischarged ? "#64748b" : canDischarge ? "#15803d" : "var(--text-muted)"
                                                    }}>
                                                        {isDischarged ? "Discharged" : canDischarge ? "Ready for discharge" : enc.status.replace(/_/g, " ")}
                                                    </span>
                                                </span>
                                                <span style={{ color: "var(--text-muted)" }}>
                                                    {formatCheckedInTime(enc.checked_in_at)}
                                                </span>
                                                <span style={{
                                                    color: assignedRoom ? "#15803d":"var(--text-muted)",
                                                    fontSize: "0.8rem",
                                                    fontWeight: assignedRoom ? 600 : 400,
                                                }}>
                                                    {assignedRoom ? `Room ${assignedRoom.room_number}` : "—"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </section>
                    </div>

                    {/* ── Patient detail panel ── */}
                    {selectedEnc && (
                        <aside style={{
                            background: "#fff", border: "1px solid var(--border)",
                            borderRadius: "12px", padding: "1.25rem", alignSelf: "start"
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                                <h4 style={{ margin: 0 }}>
                                    {selectedEnc.status === "med_complete"
                                    ? "Discharge"
                                    : selectedEnc.status === "check_in" ? "Room Assignment" : "Check-in"}
                                </h4>
                                <button type="button" onClick={() => setSelected(null)}
                                    style={{
                                        background: "none", border: "none", cursor: "pointer",
                                        fontSize: "1.1rem", color: "var(--text-muted)"
                                    }}>✕</button>
                            </div>

                            <div style={{ marginBottom: "1rem" }}>
                                <p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "1rem" }}>
                                    {patientName(selectedEnc)}
                                </p>
                                <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                                    {selectedEnc.patient_templates?.age && `Age ${selectedEnc.patient_templates.age} · `}
                                    {selectedEnc.patient_templates?.sex && `${selectedEnc.patient_templates.sex}`}
                                </p>
                                {selectedEnc.patient_templates?.chief_complaint && (
                                    <p style={{
                                        margin: 0, fontSize: "0.875rem",
                                        background: "#f8fafc", padding: "0.5rem 0.75rem",
                                        borderRadius: "6px", color: "var(--text)"
                                    }}>
                                        <strong>Chief complaint:</strong>{" "}
                                        {selectedEnc.patient_templates.chief_complaint}
                                    </p>
                                )}
                            </div>

                            {selectedEnc.status === "med_complete" ? (
                                <>
                                    <div style={{
                                        display: "flex", flexDirection: "column", gap: "0.4rem",
                                        marginBottom: "1.25rem", fontSize: "0.875rem"
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ color: "var(--text-muted)" }}>Checked in</span>
                                            <span>{formatCheckedInTime(selectedEnc.checked_in_at)}</span>
                                        </div>
                                        {selectedEnc.med_completed_at && (
                                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ color: "var(--text-muted)" }}>Seen by provider</span>
                                                <span>{formatCheckedInTime(selectedEnc.med_completed_at)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{
                                        background: "#f0fdf4", border: "1px solid #bbf7d0",
                                        borderRadius: "8px", padding: "0.75rem 1rem",
                                        marginBottom: "1.25rem", fontSize: "0.875rem", color: "#15803d", fontWeight: 500
                                    }}>
                                        Provider has completed the visit. Patient is ready to be discharged.
                                    </div>
                                    <button
                                        type="button"
                                        className="primary-button"
                                        style={{ width: "100%" }}
                                        onClick={handleDischarge}
                                        disabled={discharging || isEnded}
                                    >
                                        {discharging ? "Discharging…" : "Discharge patient"}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={{ marginBottom: "1rem" }}>
                                        <p style={{
                                            margin: "0 0 0.5rem", fontSize: "0.8rem", fontWeight: 600,
                                            textTransform: "uppercase", letterSpacing: "0.04em",
                                            color: "var(--text-muted)"
                                        }}>
                                            Scheduled time
                                        </p>
                                        <p style={{ margin: 0, fontWeight: 700, color: "#2563eb" }}>
                                            {formatTime(selectedEnc.scheduled_time)}
                                        </p>
                                    </div>

                                    <div style={{ marginBottom: "1rem" }}>
                                        <p style={{
                                            margin: "0 0 0.5rem", fontSize: "0.8rem", fontWeight: 600,
                                            textTransform: "uppercase", letterSpacing: "0.04em",
                                            color: "var(--text-muted)"
                                        }}>
                                            Room
                                        </p>
                                        <RoomsSlot
                                            encounterId={selectedEnc.id}
                                            simulationId={simId}
                                            round={sim?.current_round}
                                            encounterStatus={selectedEnc.status}
                                            isEnded={isEnded}
                                        />
                                    </div>

                                    {/* ── Patient look-up [placeholder] ── */}
                                    <div style={{ marginBottom: "1rem", opacity: 0.4, pointerEvents: "none" }}>
                                        <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                                            Patient look-up
                                        </p>
                                        <input className="form-input" type="text" placeholder="Search by name or DOB…" disabled />
                                    </div>

                                    {/* ── Visit history [placeholder] ── */}
                                    <div style={{ marginBottom: "1rem", opacity: 0.4, pointerEvents: "none" }}>
                                        <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                                            Visit history
                                        </p>
                                        <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.6rem 0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                            No prior visits on record.
                                        </div>
                                    </div>

                                    {/* ── Assigned provider [placeholder] ── */}
                                    <div style={{ marginBottom: "1.25rem", opacity: 0.4, pointerEvents: "none" }}>
                                        <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                                            Assigned provider
                                        </p>
                                        <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.6rem 0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                            Not yet assigned.
                                        </div>
                                    </div>

                                    {selectedEnc.status === "expected" &&(
                                        <button
                                            type="button"
                                            className="primary-button"
                                            style={{ width: "100%" }}
                                            onClick={handleCheckIn}
                                            disabled={checkingIn || isEnded}
                                        >
                                            {checkingIn ? "Checking in…" : "Check in patient"}
                                        </button>)}
                                </>
                            )}
                        </aside>
                    )}
                </div>
            </main>
        </div>
    );
}
