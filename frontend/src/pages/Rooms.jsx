import { useEffect, useState } from "react";
import { getRooms, 
    getPatientsForRoomAssignment, 
    assignPatientToRoom, 
    dismissPatientFromRoom, 
    getRoomOccupancyHistory, 
    createRoom, 
    updateRoom,
    setRoomActive
} from "../services/roomService.js";
import { hasPermission } from "../services/permissionService.js";

export default function Rooms() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [canAssignRooms, setCanAssignRooms] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [canDismissRooms, setCanDismissRooms] = useState(false);
    const [canManageRooms, setCanManageRooms] = useState(false);

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

    const [canReadRoomHistory, setCanReadRoomHistory] = useState(false);
    const [selectedHistoryRoom, setSelectedHistoryRoom] = useState(null);
    const [roomHistory, setRoomHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");

    const [showCreateRoomForm, setShowCreateRoomForm] = useState(false);
    const [newRoomNumber, setNewRoomNumber] = useState("");
    const [newRoomLocation, setNewRoomLocation] = useState("");
    const [creatingRoom, setCreatingRoom] = useState(false);
    const [createRoomError, setCreateRoomError] = useState("");
    const [createRoomSuccess, setCreateRoomSuccess] = useState("");

    const [editingRoomId, setEditingRoomId] = useState(null);
    const [editRoomNumber, setEditRoomNumber] = useState("");
    const [editRoomLocation, setEditRoomLocation] = useState("");
    const [updatingRoom, setUpdatingRoom] = useState(false);
    const [editRoomError, setEditRoomError] = useState("");
    const [editRoomSuccess, setEditRoomSuccess] = useState("");

    const [changingRoomStatusId, setChangingRoomStatusId] = useState(null);
    const [roomStatusError, setRoomStatusError] = useState("");
    const [roomStatusSuccess, setRoomStatusSuccess] = useState("");

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
        let cancelled = false;

        async function checkRoomHistoryPermission() {
            try {
                const allowed = await hasPermission("room.history.read");

                if (!cancelled) {
                    setCanReadRoomHistory(allowed === true);
                }
            } catch (err) {
                console.error("Unable to check room history permission:", err);

                if (!cancelled) {
                    setCanReadRoomHistory(false);
                }
            }
        }

        checkRoomHistoryPermission();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function checkRoomManagementPermission() {
            try {
                const allowed = await hasPermission("room.manage");

                if (!cancelled) {
                    setCanManageRooms(allowed === true);
                }
            } catch (err) {
                console.error("Unable to check room management permission:", err);

                if (!cancelled) {
                    setCanManageRooms(false);
                }
            }
        }

        checkRoomManagementPermission();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedHistoryRoom || !canReadRoomHistory) {
            setRoomHistory([]);
            setHistoryLoading(false);
            setHistoryError("");
            return;
        }

        let cancelled = false;

        async function loadRoomHistory() {
            setHistoryLoading(true);
            setHistoryError("");
            setRoomHistory([]);

            try {
                const history = await getRoomOccupancyHistory(selectedHistoryRoom.id);

                if (!cancelled) {
                    setRoomHistory(history);
                }
            } catch (err) {
                console.error("Unable to load room history:", err);

                if (!cancelled) {
                    setHistoryError(err.message || "Unable to load room occupancy history.");
                }
            } finally {
                if (!cancelled) {
                    setHistoryLoading(false);
                }
            }
        }

        loadRoomHistory();

        return () => {
            cancelled = true;
        };
    }, [selectedHistoryRoom, canReadRoomHistory]);

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

    async function handleCreateRoom(event) {
        event.preventDefault();

        if (!canManageRooms || creatingRoom) {
            return;
        }

        setCreateRoomError("");
        setCreateRoomSuccess("");

        if (!newRoomNumber.trim()) {
            setCreateRoomError("Room number is required.");
            return;
        }

        setCreatingRoom(true);

        try {
            await createRoom(
                newRoomNumber.trim(),
                newRoomLocation.trim()
            );

            setNewRoomNumber("");
            setNewRoomLocation("");
            setShowCreateRoomForm(false);
            setCreateRoomSuccess("Room created successfully.");

            // Refresh the room list.
            const updatedRooms = await getRooms();
            setRooms(updatedRooms);
            setError("");
        } catch (err) {
            console.error("Unable to create room:", err);

            if (err.code === "23505") {
                setCreateRoomError("A room with this number already exists.");
            } else {
                setCreateRoomError(err.message || "Unable to create room.");
            }
        } finally {
            setCreatingRoom(false);
        }
    }

    async function handleEditRoom(event) {
        event.preventDefault();

        if (!canManageRooms || !editingRoomId || updatingRoom) {
            return;
        }

        setEditRoomError("");
        setEditRoomSuccess("");

        if (!editRoomNumber.trim()) {
            setEditRoomError("Room number is required.");
            return;
        }

        setUpdatingRoom(true);

        try {
            await updateRoom(
                editingRoomId,
                editRoomNumber.trim(),
                editRoomLocation.trim()
            );

            setEditingRoomId(null);
            setEditRoomNumber("");
            setEditRoomLocation("");
            setEditRoomSuccess("Room updated successfully.");

            const updatedRooms = await getRooms();
            setRooms(updatedRooms);
            setError("");
        } catch (err) {
            console.error("Unable to update room:", err);

            if (err.code === "23505") {
                setEditRoomError("A room with this number already exists.");
            } else {
                setEditRoomError(err.message || "Unable to update room.");
            }
        } finally {
            setUpdatingRoom(false);
        }
    }

    async function handleRoomStatusChange(room) {
        if (!canManageRooms || changingRoomStatusId !== null) {
            return;
        }

        const newStatus = !room.is_active;

        // Prevent deactivation of occupied rooms.
        if (!newStatus && room.is_occupied) {
            setRoomStatusError(`Cannot deactivate ${room.room_number} because it is occupied.`);
            setRoomStatusSuccess("");
            return;
        }

        setChangingRoomStatusId(room.id);
        setRoomStatusError("");
        setRoomStatusSuccess("");

        try {
            // Update the room's active status in Supabase.
            await setRoomActive(room.id, newStatus);

            // Refresh the room list.
            const updatedRooms = await getRooms();
            setRooms(updatedRooms);
            setError("");

            setRoomStatusSuccess(
                `Room ${room.room_number} ${
                    newStatus ? "reactivated" : "deactivated"
                } successfully.`
            );
        } catch (err) {
            console.error("Unable to change room status:", err);

            setRoomStatusError(err.message || "Unable to change room status.");
        } finally {
            setChangingRoomStatusId(null);
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

                {canManageRooms && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowCreateRoomForm(true);
                                setCreateRoomError("");
                                setCreateRoomSuccess("");
                            }}
                            className="rounded-sm bg-utep-blue px-4 py-2 text-xs font-medium text-white hover:bg-utep-blue-hover transition-colors"
                        >
                            + Create Room
                        </button>
                    )}
            </div>

            {canManageRooms && showCreateRoomForm && (
                <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
                    <h2 className="mb-4 text-lg font-semibold text-slate-900">Create New Room</h2>

                    <form onSubmit={handleCreateRoom}>
                        <div className="mb-4">
                            <label htmlFor="new-room-number" className="mb-2 block text-sm font-medium text-slate-700">Room Number *</label>

                            <input
                                id="new-room-number"
                                type="text"
                                value={newRoomNumber}
                                onChange={(event) => setNewRoomNumber(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. 101"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label htmlFor="new-room-location" className="mb-2 block text-sm font-medium text-slate-700">Location (Optional)</label>

                            <input
                                id="new-room-location"
                                type="text"
                                value={newRoomLocation}
                                onChange={(event) => setNewRoomLocation(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                placeholder="e.g. First Floor"
                            />
                        </div>

                        {createRoomError && (
                            <p role="alert" className="mb-4 text-sm text-red-700">{createRoomError}</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={creatingRoom}
                                className="rounded-sm bg-utep-blue px-4 py-2 text-xs font-medium text-white hover:bg-utep-blue-hover transition-colors disabled:opacity-50"
                            >
                                {creatingRoom ? "Creating..." : "Create Room"}
                            </button>

                            <button
                                type="button"
                                disabled={creatingRoom}
                                onClick={() => {
                                    setShowCreateRoomForm(false);
                                    setCreateRoomError("");
                                    setNewRoomNumber("");
                                    setNewRoomLocation("");
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {createRoomSuccess && (
                <div role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-700">{createRoomSuccess}</p>
                </div>
            )}

            {canManageRooms && editingRoomId && (
                <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
                    <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit Room</h2>

                    <form onSubmit={handleEditRoom}>
                        <div className="mb-4">
                            <label
                                htmlFor="edit-room-number"
                                className="mb-2 block text-sm font-medium text-slate-700"
                            >
                                Room Number *
                            </label>

                            <input
                                id="edit-room-number"
                                type="text"
                                value={editRoomNumber}
                                onChange={(event) => setEditRoomNumber(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label
                                htmlFor="edit-room-location"
                                className="mb-2 block text-sm font-medium text-slate-700"
                            >
                                Location (Optional)
                            </label>

                            <input
                                id="edit-room-location"
                                type="text"
                                value={editRoomLocation}
                                onChange={(event) => setEditRoomLocation(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                        </div>

                        {editRoomError && (
                            <p role="alert" className="mb-4 text-sm text-red-700">{editRoomError}</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={updatingRoom}
                                className="rounded-sm bg-utep-blue px-4 py-2 text-xs font-medium text-white hover:bg-utep-blue-hover transition-colors disabled:opacity-50"
                            >
                                {updatingRoom ? "Saving..." : "Save Changes"}
                            </button>

                            <button
                                type="button"
                                disabled={updatingRoom}
                                onClick={() => {
                                    setEditingRoomId(null);
                                    setEditRoomNumber("");
                                    setEditRoomLocation("");
                                    setEditRoomError("");
                                }}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {editRoomSuccess && (
                <div
                    role="status"
                    className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
                >
                    <p className="text-sm text-emerald-700">
                        {editRoomSuccess}
                    </p>
                </div>
            )}

            {roomStatusError && (
                <div
                    role="alert"
                    className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4"
                >
                    <p className="text-sm text-red-700">
                        {roomStatusError}
                    </p>
                </div>
            )}

            {roomStatusSuccess && (
                <div
                    role="status"
                    className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
                >
                    <p className="text-sm text-emerald-700">
                        {roomStatusSuccess}
                    </p>
                </div>
            )}

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
                                        className="mt-4 rounded-sm px-4 py-2 text-xs font-medium bg-utep-blue text-white hover:bg-utep-blue-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

                    {selectedHistoryRoom && canReadRoomHistory && (
                        <div className="mt-6 border border-slate-200 bg-white p-6">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">Room Occupancy History</h2>
                                    <p className="text-sm text-slate-500 mt-1">Room {selectedHistoryRoom.room_number}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedHistoryRoom(null)}
                                    className="px-4 py-2 text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
                                >
                                    Close
                                </button>
                            </div>

                            {historyLoading ? (
                                <p className="text-sm text-slate-500">Loading occupancy history...</p>
                            ) : historyError ? (
                                <p role="alert" className="text-sm text-red-600">{historyError}</p>
                            ) : roomHistory.length === 0 ? (
                                <p className="text-sm text-slate-500">No occupancy history found for this room.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Patient ID</th>
                                                <th className="px-4 py-3 font-medium">Assigned At</th>
                                                <th className="px-4 py-3 font-medium">Dismissed At</th>
                                                <th className="px-4 py-3 font-medium">Status</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-100">
                                            {roomHistory.map((record) => (
                                                <tr key={record.occupancy_id}>
                                                    <td className="px-4 py-3 font-mono text-xs">{record.patient_id}</td>
                                                    <td className="px-4 py-3">
                                                        {new Date(
                                                            record.assigned_at
                                                        ).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {record.dismissed_at
                                                            ? new Date(
                                                                record.dismissed_at
                                                            ).toLocaleString()
                                                            : "—"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {record.dismissed_at ? (
                                                            <span className="text-slate-600">Dismissed</span>
                                                        ) : (
                                                            <span className="text-emerald-700"> Current</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
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
                                            {(canAssignRooms || canDismissRooms || canReadRoomHistory || canManageRooms) && (
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
                                                    {(canAssignRooms || canDismissRooms || canReadRoomHistory) && (
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                                                                {room.is_active && !room.is_occupied && canAssignRooms && (
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => setSelectedRoomId(room.id)} 
                                                                        className="rounded-sm px-3 py-1.5 text-xs font-medium bg-utep-blue text-white hover:bg-utep-blue-hover transition-colors"
                                                                    >
                                                                        Assign Patient
                                                                    </button>
                                                                )}
                                                                
                                                                {room.is_occupied && room.patient_id && canDismissRooms && (
                                                                    <button
                                                                        type="button"
                                                                        className="px-2 py-1 text-xs font-medium bg-rose-100 text-rose-700 opacity-60 cursor-not-allowed"
                                                                        onClick={() => {
                                                                            setSelectedDismissalRoom(room);
                                                                            setDismissalError("");
                                                                            setDismissalSuccess("");
                                                                        }}
                                                                    >
                                                                        Dismiss Patient
                                                                    </button>
                                                                )}

                                                                {canReadRoomHistory && (
                                                                    <button
                                                                        type="button"
                                                                        className="px-2 py-1 text-xs font-medium border border-slate-300 text-slate-500 opacity-60 cursor-not-allowed"
                                                                        onClick={() => {
                                                                            setSelectedHistoryRoom(room);
                                                                            setRoomHistory([]);
                                                                            setHistoryError("");
                                                                        }}
                                                                    >
                                                                        View History
                                                                    </button>
                                                                )}

                                                                {canManageRooms && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingRoomId(room.id);
                                                                            setEditRoomNumber(room.room_number);
                                                                            setEditRoomLocation(room.location || "");
                                                                            setEditRoomError("");
                                                                            setEditRoomSuccess("");
                                                                        }}
                                                                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                                    >
                                                                        Edit Room
                                                                    </button>
                                                                )}

                                                                {canManageRooms && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRoomStatusChange(room)}
                                                                        disabled={
                                                                            changingRoomStatusId !== null ||
                                                                            (room.is_active && room.is_occupied)
                                                                        }
                                                                        title={
                                                                            room.is_active && room.is_occupied
                                                                                ? "Dismiss or transfer the patient before deactivating this room."
                                                                                : undefined
                                                                        }
                                                                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                                                            room.is_active
                                                                                ? "border border-rose-300 text-rose-700 hover:bg-rose-50"
                                                                                : "bg-emerald-700 text-white hover:bg-emerald-800"
                                                                        }`}
                                                                    >
                                                                        {changingRoomStatusId === room.id
                                                                            ? "Updating..."
                                                                            : room.is_active
                                                                            ? "Deactivate"
                                                                            : "Reactivate"}
                                                                    </button>
                                                                )}

                                                            </div>
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
