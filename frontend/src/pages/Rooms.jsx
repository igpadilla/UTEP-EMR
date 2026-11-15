import { useEffect, useState } from "react";
import { getRooms, getPatientsForRoomAssignment, assignPatientToRoom } from "../services/roomService.js";
import { hasPermission } from "../services/permissionService.js";

export default function Rooms() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [canAssignRooms, setCanAssignRooms] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState(null);

    const [patients, setPatients] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState("");
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [patientsError, setPatientsError] = useState("");

    const [assigning, setAssigning] = useState(false);
    const [assignmentError, setAssignmentError] = useState("");
    const [assignmentSuccess, setAssignmentSuccess] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadRooms() {
            try {
                const data = await getRooms();

                if (!cancelled) {
                    setRooms(data);
                    setError("");
                }
            } catch (err) {
                console.error("Unable to load rooms:", err);

                if (!cancelled) {
                    setError("Unable to load room information.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadRooms();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function checkAssignmentPermission() {
            try {
                const allowed = await hasPermission("room.assign");

                if (!cancelled) {
                    setCanAssignRooms(allowed === true);
                }
            } catch (err) {
                console.error("Unable to check room assignment permission:", err);

                if (!cancelled) {
                    setCanAssignRooms(false);
                }
            }
        }

        checkAssignmentPermission();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedRoomId || !canAssignRooms) {
            return;
        }

        let cancelled = false;

        async function loadPatients() {
            setPatientsLoading(true);
            setPatientsError("");
            setPatients([]);
            setSelectedPatientId("");

            try {
                const data = await getPatientsForRoomAssignment();

                if (!cancelled) {
                    const assignedPatientIds = new Set(
                        rooms
                            .filter((room) => room.is_occupied && room.patient_id)
                            .map((room) => room.patient_id)
                    );

                    setPatients(
                        data.filter(
                            (patient) => !assignedPatientIds.has(patient.id)
                        )
                    );
                }
            } catch (err) {
                console.error("Unable to load patients:", err);

                if (!cancelled) {
                    setPatientsError("Unable to load eligible patients.");
                }
            } finally {
                if (!cancelled) {
                    setPatientsLoading(false);
                }
            }
        }

        loadPatients();

        return () => {
            cancelled = true;
        };
    }, [selectedRoomId, canAssignRooms, rooms]);

    async function handleAssignPatient() {
        if (!selectedRoomId || !selectedPatientId || assigning) {
            return;
        }

        setAssigning(true);
        setAssignmentError("");
        setAssignmentSuccess("");

        try {
            await assignPatientToRoom(selectedRoomId, selectedPatientId);

            const updatedRooms = await getRooms();

            setRooms(updatedRooms);
            setSelectedRoomId(null);
            setSelectedPatientId("");

            setAssignmentSuccess("Patient assigned to room successfully.");
        } catch (err) {
            console.error("Unable to assign patient:", err);

            setAssignmentError(err.message || "Unable to assign patient to room.");
        } finally {
            setAssigning(false);
        }
    }

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter(
        (room) => room.is_active && room.is_occupied
    ).length;
    const availableRooms = rooms.filter(
        (room) => room.is_active && !room.is_occupied
    ).length;
    const inactiveRooms = rooms.filter(
        (room) => !room.is_active
    ).length;

    return (
        <main className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">Facility Management</p>

                <h1 className="text-2xl font-semibold text-slate-900">Rooms</h1>

                <p className="text-sm text-slate-500 mt-2">View room availability, patient assignments, and occupancy history.</p>
            </div>

            {assignmentSuccess && (
                <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 mb-6">
                    <p className="text-sm text-emerald-700">{assignmentSuccess}</p>
                </div>
            )}

            {loading ? (
                <div className="border border-slate-200 bg-white p-8">
                    <p className="text-sm text-slate-500">Loading rooms...</p>
                </div>
            ) : error ? (
                <div role="alert" className="border border-red-200 bg-red-50 p-6">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            ) : (
                <>
                    {selectedRoomId && canAssignRooms && (
                        <section className="border border-slate-200 bg-white p-6 mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900">Assign Patient</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Select a patient for room{" "}
                                        {rooms.find((room) => room.id === selectedRoomId)?.room_number}
                                    </p>
                                </div>

                                <button 
                                    type="button" 
                                    onClick={() => setSelectedRoomId(null)} 
                                    className="text-sm text-slate-500 hover:text-slate-900"
                                    disabled={assigning}
                                >
                                    Cancel
                                </button>
                            </div>

                            {patientsLoading ? (
                                <p className="text-sm text-slate-500">Loading patients...</p>
                            ) : patientsError ? (
                                <p role="alert" className="text-sm text-red-700">{patientsError}</p>
                            ) : patients.length === 0 ? (
                                <p className="text-sm text-slate-500">No eligible patients are available.</p>
                            ) : (
                                <div className="max-w-md">
                                    <label htmlFor="room-patient-select" className="block text-sm font-medium text-slate-700 mb-2">Patient</label>

                                    <select
                                        id="room-patient-select"
                                        value={selectedPatientId}
                                        onChange={(event) =>
                                            setSelectedPatientId(event.target.value)
                                        }
                                        className="w-full border border-slate-300 bg-white px-3 py-2 text-sm"
                                    >
                                        <option value="">Select a patient</option>

                                        {patients.map((patient) => (
                                            <option key={patient.id} value={patient.id}>{patient.last_name}, {patient.first_name}</option>
                                        ))}
                                    </select>

                                    {assignmentError && (
                                        <p role="alert" className="text-sm text-red-700 mt-3">{assignmentError}</p>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleAssignPatient}
                                        disabled={!selectedPatientId || assigning}
                                        className="mt-4 px-4 py-2 text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {assigning ? "Assigning..." : "Confirm Assignment"}
                                    </button>
                                </div>
                            )}
                        </section>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {[
                            { label: "Total Rooms", value: totalRooms },
                            { label: "Available", value: availableRooms },
                            { label: "Occupied", value: occupiedRooms },
                            { label: "Inactive", value: inactiveRooms },
                        ].map((stat) => (
                            <div key={stat.label} className="border border-slate-200 bg-white p-5">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                                <p className="text-3xl font-semibold text-slate-900 mt-2">{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="border border-slate-200 bg-white">
                        <div className="p-6 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-900">Room Management</h2>
                            <p className="text-sm text-slate-500 mt-1">Current room availability and assignments</p>
                        </div>

                        {rooms.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-sm text-slate-500">No rooms have been added yet.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 font-medium">Room</th>
                                            <th className="px-6 py-4 font-medium">Location</th>
                                            <th className="px-6 py-4 font-medium">Status</th>
                                            <th className="px-6 py-4 font-medium">Patient Assignment</th>
                                            {canAssignRooms && (
                                                <th className="px-6 py-4 font-medium">Actions</th>
                                            )}
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                        {rooms.map((room) => {
                                            const status = !room.is_active
                                                ? "Inactive"
                                                : room.is_occupied
                                                  ? "Occupied"
                                                  : "Available";

                                            const statusStyle = !room.is_active
                                                ? "bg-slate-100 text-slate-600"
                                                : room.is_occupied
                                                  ? "bg-amber-50 text-amber-700"
                                                  : "bg-emerald-50 text-emerald-700";

                                            return (
                                                <tr key={room.id}>
                                                    <td className="px-6 py-4 font-medium text-slate-900">{room.room_number}</td>
                                                    <td className="px-6 py-4 text-slate-600">{room.location || "—"}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusStyle}`}>{status}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-600">
                                                        {room.patient_id
                                                            ? `Patient ID: ${room.patient_id}`
                                                            : "Unassigned"}
                                                    </td>
                                                    {canAssignRooms && (
                                                        <td className="px-6 py-4">
                                                            {room.is_active && !room.is_occupied ? (
                                                                <button type="button" onClick={() => setSelectedRoomId(room.id)} className="px-4 py-2 text-xs font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors">Assign Patient</button>
                                                            ) : (
                                                                <span className="text-xs text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </main>
    );
}
