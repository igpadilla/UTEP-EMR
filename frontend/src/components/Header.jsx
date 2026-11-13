import React, { useEffect, useRef, useState } from "react";
import { logout } from "../services/auth.js";
import {
    searchPatients,
    getMyAssignedCases as getInstructorAssignedCases,
} from "../services/instructorService.js";
import { getMyAssignedCases as getStudentAssignedCases } from "../services/studentCaseService.js";

export default function Header({ user, onNavigate, canUseLivePatients = false }) {
    const profile = user?.profile ?? {};
    const accountType = profile.account_type ?? "user";
    const isAdmin = accountType === "admin";
    const isInstructor = accountType === "instructor";
    const isStudent = accountType === "student";

    const fullName =
        profile.full_name ||
        profile.name ||
        `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
        user?.email ||
        "User";

    const roleLabel = accountType.charAt(0).toUpperCase() + accountType.slice(1);

    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [patientResults, setPatientResults] = useState([]);
    const [caseResults, setCaseResults] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);

    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const cachedCasesRef = useRef(null);

    // Global Cmd+K / Ctrl+K shortcut to focus search
    useEffect(() => {
        function handleGlobalKeyDown(e) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            } else if (e.key === "Escape" && open) {
                setOpen(false);
                inputRef.current?.blur();
            }
        }
        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [open]);

    // Close search dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Live search across Patients & Cases when opened or query changes
    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        const q = query.trim().toLowerCase();

        async function runQuickSearch() {
            setLoading(true);
            try {
                const canQueryPatients = isAdmin || isInstructor || (isStudent && canUseLivePatients);

                const [patientsData, casesData] = await Promise.all([
                    canQueryPatients
                        ? searchPatients(query.trim()).catch(() => [])
                        : Promise.resolve([]),
                    (async () => {
                        if (!cachedCasesRef.current) {
                            const fetched = isStudent
                                ? await getStudentAssignedCases().catch(() => [])
                                : await getInstructorAssignedCases(false).catch(() => []);
                            cachedCasesRef.current = fetched ?? [];
                        }
                        return cachedCasesRef.current;
                    })(),
                ]);

                if (cancelled) return;

                const filteredCases = (casesData ?? [])
                    .filter((c) => {
                        if (!q) return true;
                        const snap = c.patient_snapshot ?? c.patient_templates ?? {};
                        const patientName = `${snap.first_name ?? ""} ${snap.last_name ?? ""}`.toLowerCase();
                        const complaint = (snap.chief_complaint ?? "").toLowerCase();
                        const studentName = `${c.profiles?.first_name ?? ""} ${c.profiles?.last_name ?? ""}`.toLowerCase();
                        return (
                            patientName.includes(q) ||
                            complaint.includes(q) ||
                            studentName.includes(q)
                        );
                    })
                    .slice(0, 6);

                setPatientResults((patientsData ?? []).slice(0, 6));
                setCaseResults(filteredCases);
                setActiveIndex(0);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        const timer = setTimeout(runQuickSearch, 120);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, open, isAdmin, isInstructor, isStudent, canUseLivePatients]);

    const combinedItems = [
        ...caseResults.map((c) => ({ type: "case", item: c })),
        ...patientResults.map((p) => ({ type: "patient", item: p })),
    ];

    function handleSelectResult(entry) {
        if (!entry || !onNavigate) return;
        setOpen(false);
        setQuery("");

        if (entry.type === "patient") {
            const p = entry.item;
            if (isAdmin || isInstructor) {
                onNavigate("patientChart", p.id, { backTo: "patientManager" });
            } else {
                onNavigate("studentPatientDetail", p.id);
            }
            return;
        }

        if (entry.type === "case") {
            const c = entry.item;
            if (isStudent) {
                onNavigate("studentCases", null, { openCaseId: c.id });
            } else if (c.course_id) {
                onNavigate("courseDetail", c.course_id);
            } else {
                onNavigate("patientChart", null, { caseId: c.id, backTo: "dashboard" });
            }
        }
    }

    function handleInputKeyDown(e) {
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) =>
                combinedItems.length ? (prev + 1) % combinedItems.length : 0
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) =>
                combinedItems.length
                    ? (prev - 1 + combinedItems.length) % combinedItems.length
                    : 0
            );
        } else if (e.key === "Enter" && combinedItems[activeIndex]) {
            e.preventDefault();
            handleSelectResult(combinedItems[activeIndex]);
        }
    }

    async function handleLogout() {
        try {
            await logout();
        } catch (error) {
            console.error("Unable to log out:", error);
        }
    }

    return (
        <header className="h-14 w-full bg-white border-b border-slate-100 px-6 flex items-center justify-between gap-6 sticky top-0 z-30">
            {/* Global Quick-Jump Search (Cmd+K) */}
            <div ref={containerRef} className="relative flex-1 max-w-md">
                <div className="relative flex items-center">
                    <svg
                        className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                    >
                        <circle cx="11" cy="11" r="7" />
                        <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
                    </svg>

                    <input
                        ref={inputRef}
                        type="search"
                        value={query}
                        onFocus={() => setOpen(true)}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                        }}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Search Patients or Cases (Cmd+K)"
                        aria-label="Search Patients or Cases (Cmd+K)"
                        className="w-full h-8 pl-8 pr-16 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 border border-slate-100 focus:border-slate-300 rounded-sm outline-none transition-colors"
                    />

                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] text-slate-400 border border-slate-200 bg-white rounded-sm absolute right-2 pointer-events-none">
                        Cmd+K
                    </kbd>
                </div>

                {/* Quick-Jump Dropdown */}
                {open && (
                    <div
                        role="listbox"
                        aria-label="Quick-jump results"
                        className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-sm overflow-hidden z-50"
                    >
                        {loading ? (
                            <div className="px-4 py-6 text-xs text-slate-400 font-mono">
                                Searching clinical records...
                            </div>
                        ) : combinedItems.length === 0 ? (
                            <div className="px-4 py-6 text-xs text-slate-400">
                                No matching patients or cases found.
                            </div>
                        ) : (
                            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                                {caseResults.length > 0 && (
                                    <div className="py-1.5">
                                        <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                            Cases
                                        </div>
                                        {caseResults.map((c, idx) => {
                                            const snap = c.patient_snapshot ?? c.patient_templates ?? {};
                                            const itemIdx = idx;
                                            const isSelected = activeIndex === itemIdx;
                                            const studentLabel = c.profiles
                                                ? `${c.profiles.first_name ?? ""} ${c.profiles.last_name ?? ""}`.trim()
                                                : null;

                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => handleSelectResult({ type: "case", item: c })}
                                                    onMouseEnter={() => setActiveIndex(itemIdx)}
                                                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 text-xs transition-colors ${
                                                        isSelected ? "bg-slate-50 text-slate-950" : "text-slate-700"
                                                    }`}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-slate-900 truncate">
                                                            {snap.first_name} {snap.last_name}
                                                            {studentLabel && (
                                                                <span className="text-slate-400 font-normal">
                                                                    {" "}· Student: {studentLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {snap.chief_complaint && (
                                                            <div className="text-[11px] text-slate-500 truncate">
                                                                {snap.chief_complaint}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 shrink-0">
                                                        {c.encounter_status}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {patientResults.length > 0 && (
                                    <div className="py-1.5">
                                        <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                            Patients
                                        </div>
                                        {patientResults.map((p, idx) => {
                                            const itemIdx = caseResults.length + idx;
                                            const isSelected = activeIndex === itemIdx;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => handleSelectResult({ type: "patient", item: p })}
                                                    onMouseEnter={() => setActiveIndex(itemIdx)}
                                                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 text-xs transition-colors ${
                                                        isSelected ? "bg-slate-50 text-slate-950" : "text-slate-700"
                                                    }`}
                                                >
                                                    <div className="min-w-0">
                                                        <span className="font-medium text-slate-900">
                                                            {p.first_name} {p.last_name}
                                                        </span>
                                                        {p.occupation && (
                                                            <span className="text-slate-400 ml-2">
                                                                {p.occupation}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                                                        {p.age ? `${p.age}y` : ""}{p.sex ? ` · ${p.sex}` : ""}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right User Identity & Sign Out */}
            <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium text-slate-900">{fullName}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                        {roleLabel}
                    </span>
                </div>

                <div className="h-3.5 w-px bg-slate-100" aria-hidden="true" />

                <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </header>
    );
}
