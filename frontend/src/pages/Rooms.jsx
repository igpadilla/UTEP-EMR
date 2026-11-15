import { useEffect, useState } from "react";
import { getRooms } from "../services/roomService.js";

export default function Rooms() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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
