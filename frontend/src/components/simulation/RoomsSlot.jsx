import { useEffect, useState } from "react";
import {
    getSimulationRooms,
    getSimulationRoomAssignments,
    assignSimulationRoom,
    subscribeToSimulationRoomAssignments
} from "../../services/simulationRoomService.js";

export default function RoomsSlot({
    encounterId,
    simulationId,
    round,
    encounterStatus,
    isEnded
}) {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [assignments, setAssignments] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [assigning, setAssigning] = useState(false);
    const [assignmentError, setAssignmentError] = useState("");

    useEffect(() => {
        setSelectedRoomId("");
        setAssignmentError("");
    }, [encounterId, simulationId, round]);

    async function handleAssignRoom() {
        if (!selectedRoomId || !encounterId || assigning) return;

        setAssigning(true);
        setAssignmentError("");

        try {
            await assignSimulationRoom(encounterId, selectedRoomId);

            const [roomData, assignmentData] = await Promise.all([
                getSimulationRooms(simulationId, round),
                getSimulationRoomAssignments(simulationId, round),
            ]);

            setRooms(roomData);
            setAssignments(assignmentData);
            setSelectedRoomId("");
        } catch (err) {
            setAssignmentError(err.message);
        } finally {
            setAssigning(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function loadRooms() {
            setLoading(true);
            setError("");
            setRooms([]);
            setAssignments([]);

            try {
                const [roomData, assignmentData] = await Promise.all([
                    getSimulationRooms(simulationId, round),
                    getSimulationRoomAssignments(simulationId, round),
                ]);

                if (!cancelled) {
                    setRooms(roomData);
                    setAssignments(assignmentData);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        if (simulationId && round != null) {
            loadRooms();
        }
        else {
            setRooms([]);
            setLoading(false);
        }

        return () => {
            cancelled = true;
        };
    }, [simulationId, round]);

    useEffect(() => {
        if (!simulationId || round == null) return;

        let cancelled = false;

        const unsubscribe = subscribeToSimulationRoomAssignments(
            simulationId,
            async () => {
                try {
                    const updatedAssignments =
                        await getSimulationRoomAssignments(simulationId, round);

                    if (!cancelled) {
                        setAssignments(updatedAssignments);
                    }
                } catch (err) {
                    if (!cancelled) {
                        console.error("Failed to refresh simulation room assignments:", err);
                    }
                }
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [simulationId, round]);

    if (loading) {
        return <p>Loading virtual rooms...</p>;
    }

    if (error) {
        return <p role="alert" style={{ color: "#dc2626" }}>{error}</p>;
    }

    const assignedRoomIds = new Set(
        assignments.map(assignment => assignment.simulation_room_id)
    );

    const availableRooms = rooms.filter(
        room =>
            !room.is_background_occupied &&
            !assignedRoomIds.has(room.id)
    );

    const currentAssignment = assignments.find(
        assignment => assignment.encounter_id === encounterId
    );

    const assignedRoom = currentAssignment
        ? rooms.find(room => room.id === currentAssignment.simulation_room_id)
        : null;

    return (
        <div style={{ fontSize: "0.875rem" }}>
            <p style={{ margin: "0 0 0.25rem"}}>
                Virtual rooms loaded: {rooms.length}
            </p>

            <p style={{ margin: "0 0 0.25rem" }}>
                Background occupied: {
                    rooms.filter(room => room.is_background_occupied).length
                }
            </p>

            <p style={{ margin: 0 }}>
                Active room assignments: {assignments.length}
            </p>

            <p style={{ margin: "0.25rem 0 0", fontWeight: 600, color: "#15803d" }}>
                Available rooms: {availableRooms.length}
            </p>

            {currentAssignment ? (
                <div
                    style={{
                        marginTop: "0.75rem",
                        padding: "0.75rem",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "8px",
                    }}
                >
                    <p style={{
                        margin: 0,
                        fontWeight: 600,
                        color: "#15803d",
                    }}>
                        Assigned Room: {assignedRoom
                            ? `Room ${assignedRoom.room_number}`
                            : "Loading room details..."}
                    </p>
                </div>
            ) : encounterStatus === "checked_in" && !isEnded ? (
                <div style={{ marginTop: "0.75rem" }}>
                    <label
                        htmlFor="simulation-room-select"
                        style={{
                            display: "block",
                            marginBottom: "0.35rem",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                        }}
                    >
                        Select an available room
                    </label>

                    <select
                        id="simulation-room-select"
                        className="form-input"
                        value={selectedRoomId}
                        onChange={event => setSelectedRoomId(event.target.value)}
                        disabled={availableRooms.length === 0}
                        style={{ width: "100%" }}
                    >
                        <option value="">Choose a room...</option>

                        {availableRooms.map(room => (
                            <option key={room.id} value={room.id}>Room {room.room_number}</option>
                        ))}
                    </select>

                    <button
                        type="button"
                        className="primary-button"
                        onClick={handleAssignRoom}
                        disabled={
                            !selectedRoomId ||
                            assigning ||
                            assignments.some(a => a.encounter_id === encounterId)
                        }
                        style={{ width: "100%", marginTop: "0.5rem" }}
                    >
                        {assigning ? "Assigning..." : "Assign Room"}
                    </button>

                    {assignmentError && (
                        <p role="alert" style={{
                            color: "#dc2626",
                            fontSize: "0.8rem",
                            marginTop: "0.5rem",
                        }}>
                            {assignmentError}
                        </p>
                    )}
                </div>
            ) : null}
        </div>
    );
}
