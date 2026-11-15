import { useEffect, useState } from "react";
import { getRooms, getPatientsForRoomAssignment, assignPatientToRoom, dismissPatientFromRoom } from "../services/roomService.js";
import { hasPermission } from "../services/permissionService.js";

export default function Rooms() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [canAssignRooms, setCanAssignRooms] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [canDismissRooms, setCanDismissRooms] = useState(false);

    const [selectedDismissalRoom, setSelectedDismissalRoom] = useState(null);
    const [dismissing, setDismissing] = useState(false);
    const [dismissalError, setDismissalError] = useState("");
    const [dismissalSuccess, setDismissalSuccess] = useState("");

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
        let cancelled = false;

        async function checkDismissalPermission() {
            try {
                const allowed = await hasPermission("room.dismiss");

                if (!cancelled) {
                    setCanDismissRooms(allowed === true);
                }
            } catch (err) {
                console.error("Unable to check room dismissal permission:", err);

                if (!cancelled) {
                    setCanDismissRooms(false);
                }
            }
        }

        checkDismissalPermission();

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

    async function handleDismissPatient() {
        if (
            !selectedDismissalRoom ||
            !selectedDismissalRoom.patient_id ||
            !canDismissRooms ||
            dismissing
        ) {
            return;
        }

        setDismissing(true);
        setDismissalError("");
        setDismissalSuccess("");

        try {
            await dismissPatientFromRoom(selectedDismissalRoom.patient_id);

            // Close the confirmation panel after a successful dismissal.
            setSelectedDismissalRoom(null);
            setDismissalSuccess("Patient dismissed from room successfully.");

            // Refresh room occupancy information.
            try {
                const updatedRooms = await getRooms();
                setRooms(updatedRooms);
            } catch (refreshError) {
                console.error("Dismissal succeeded, but rooms could not be refreshed:", refreshError);
                setDismissalError("Dismissal succeeded, but room information could not be refreshed. Please reload the page.");
            }
        } catch (err) {
            console.error("Unable to dismiss patient:", err);

            setDismissalError(err.message || "Unable to dismiss patient from room.");
        } finally {
            setDismissing(false);
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

            {dismissalSuccess && (
                <div role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{dismissalSuccess}</div>
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

                    {selectedDismissalRoom && (
                        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-6">
                            <h3 className="text-lg font-semibold text-slate-900">Confirm Patient Dismissal</h3>

                            <p className="mt-2 text-sm text-slate-600">Are you sure you want to dismiss this patient from their assigned room?</p>

                            <div className="mt-4 space-y-2 text-sm text-slate-700">
                                <p>
                                    <span className="font-semibold">Room:</span>{" "}
                                    {selectedDismissalRoom.room_number}
                                </p>

                                <p>
                                    <span className="font-semibold">Patient ID:</span>{" "}
                                    {selectedDismissalRoom.patient_id}
                                </p>
                            </div>

                            {dismissalError && (
                                <p role="alert" className="mt-4 text-sm text-rose-700">{dismissalError}</p>
                            )}

                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedDismissalRoom(null);
                                        setDismissalError("");
                                    }}
                                    disabled={dismissing}
                                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDismissPatient}
                                    disabled={dismissing}
                                    className="rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
                                >
                                    {dismissing ? "Dismissing..." : "Confirm Dismissal"}
                                </button>
                            </div>
                        </div>
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
                                            {(canAssignRooms || canDismissRooms) && (
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
                                                    {(canAssignRooms || canDismissRooms) && (
                                                        <td className="px-6 py-4">
                                                            {room.is_active && !room.is_occupied && canAssignRooms? (
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setSelectedRoomId(room.id)} 
                                                                    className="px-4 py-2 text-xs font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                                                                >
                                                                    Assign Patient
                                                                </button>
                                                            ) : room.is_occupied && room.patient_id && canDismissRooms ? (
                                                                <button
                                                                    type="button"
                                                                    className="px-4 py-2 text-xs font-medium bg-rose-100 text-rose-700 opacity-60 cursor-not-allowed"
                                                                    onClick={() => {
                                                                        setSelectedDismissalRoom(room);
                                                                        setDismissalError("");
                                                                        setDismissalSuccess("");
                                                                    }}
                                                                >
                                                                    Dismiss Patient
                                                                </button>
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
