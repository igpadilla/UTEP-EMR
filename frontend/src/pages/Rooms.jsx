export default function Rooms() {
    return (
        <main className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-2">Facility Management</p>

                <h1 className="text-2xl font-semibold text-slate-900">Rooms</h1>

                <p className="text-sm text-slate-500 mt-2">View room availability, patient assignments, and occupancy history.</p>
            </div>

            <div className="border border-slate-200 bg-white p-8">
                <h2 className="text-sm font-semibold text-slate-900 mb-2">Room Management</h2>

                <p className="text-sm text-slate-500">Room information and occupancy management will appear here.</p>
            </div>
        </main>
    );
}
