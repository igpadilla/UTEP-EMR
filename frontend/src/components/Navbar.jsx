import React, { useState, useEffect } from "react";

const STORAGE_KEY = "emr:sidebarCollapsed";

function NavIcon({ name }) {
    switch (name) {
        case "createPatient":
        case "createStudents":
            return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M3 20v-2a6 6 0 0112 0v2M19 8v8M15 12h8" /></svg>;
        case "aboutUs":
            return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>;
        case "dashboard":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
            );
        case "rooms":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M9 10v10M15 10v10" />
                </svg>
            );
        case "patients":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            );
        case "courses":
        case "myCourses":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h7" />
                </svg>
            );
        case "studentCases":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
            );
        case "students":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            );
        case "appointments":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="1.5" />
                    <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
                </svg>
            );
        case "auditLog":
            return (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h2M6 3h9l3 3v15H6z" />
                </svg>
            );
        default:
            return null;
    }
}

export default function Navbar({
    currentPage,
    onNavigate,
    user,
    canUseLivePatients = false,
    canReadRooms = false,
    canCreatePatient = false,
    autoCollapse = false,
    collapsed: controlledCollapsed,
    onToggleCollapse,
}) {
    const [internalCollapsed, setInternalCollapsed] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === "true";
        } catch {
            return false;
        }
    });
    const [manualOverride, setManualOverride] = useState(null);

    useEffect(() => {
        setManualOverride(null);
    }, [autoCollapse]);

    const isCollapsed =
        controlledCollapsed !== undefined
            ? controlledCollapsed
            : manualOverride !== null
              ? manualOverride
              : autoCollapse
                ? true
                : internalCollapsed;

    useEffect(() => {
        if (!autoCollapse && manualOverride === null) {
            try {
                localStorage.setItem(STORAGE_KEY, String(internalCollapsed));
            } catch {}
        }
    }, [internalCollapsed, autoCollapse, manualOverride]);

    function handleToggle() {
        const next = !isCollapsed;
        if (onToggleCollapse) {
            onToggleCollapse(next);
        } else if (autoCollapse) {
            setManualOverride(next);
        } else {
            setInternalCollapsed(next);
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {}
        }
    }

    const profile = user?.profile ?? {};
    const accountType = profile.account_type ?? "user";
    const isAdmin = accountType === "admin";
    const isInstructor = accountType === "instructor";
    const isStudent = accountType === "student";
    const canManageStudents = isAdmin;
    const showPatients = isAdmin || isInstructor || (isStudent && canUseLivePatients);

    const navItems = [
        { id: "dashboard", label: "Dashboard" },
        ...(isStudent ? [{ id: "studentCases", label: "Assigned Cases" }] : []),
        ...(isStudent
            ? [{ id: "myCourses", label: "Courses" }]
            : isAdmin || isInstructor
              ? [{ id: "courses", label: "Courses" }]
              : []),
        ...(showPatients ? [{ id: "patients", label: "Patient management" }] : []),
        ...(canCreatePatient ? [{ id: "createPatient", label: "Create patient" }] : []),
        ...(canReadRooms ? [{ id: "rooms", label: "Rooms" }] : []),
        ...(canManageStudents ? [{ id: "students", label: "Student management" }, { id: "createStudents", label: "Create students" }] : []),
        ...(isAdmin ? [{ id: "auditLog", label: "Audit Log" }] : []),
        { id: "aboutUs", label: "About us" },
        ...(isStudent && canUseLivePatients ? [{ id: "appointments", label: "Appointments" }] : []),
    ];

    return (
        <aside
            aria-label="Primary navigation"
            className={`flex flex-col shrink-0 bg-white border-r border-slate-100 select-none transition-[width] duration-150 ease-out ${
                isCollapsed ? "w-16" : "w-60"
            }`}
        >
            {/* Brand & Collapse Rail */}
            <div className="h-14 px-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => onNavigate("dashboard")}
                    className={`flex items-center gap-2.5 text-left focus:outline-none ${
                        isCollapsed ? "sr-only" : "min-w-0"
                    }`}
                >
                    <span className="w-6 h-6 border border-utep-blue bg-utep-blue text-white flex items-center justify-center font-mono text-[11px] font-medium tracking-tighter shrink-0">
                        EMR
                    </span>
                    <div className="truncate">
                        <span className="block text-xs font-semibold tracking-tight text-slate-900 leading-none">
                            UTEP Clinical
                        </span>
                        <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">
                            Record System
                        </span>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={handleToggle}
                    aria-label={isCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className={`w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-sm transition-colors ${
                        isCollapsed ? "mx-auto" : ""
                    }`}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 3v18" />
                        {isCollapsed ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3-3 3" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-3 3 3 3" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Section Label */}
            <div className="px-4 pt-5 pb-2">
                {!isCollapsed ? (
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                        Navigation
                    </span>
                ) : (
                    <div className="h-px bg-slate-100 w-full my-1.5" />
                )}
            </div>

            {/* Primary Routes */}
            <nav className="flex-1 px-2.5 space-y-0.5">
                {navItems.map((item) => {
                    const isActive = currentPage === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onNavigate(item.id)}
                            aria-current={isActive ? "page" : undefined}
                            title={isCollapsed ? item.label : undefined}
                            className={`w-full flex items-center gap-3 px-2.5 py-2 text-xs font-medium rounded-sm transition-colors ${
                                isCollapsed ? "justify-center" : "justify-start"
                            } ${
                                isActive
                                    ? "bg-utep-blue text-white"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                        >
                            <NavIcon name={item.id} />
                            <span className={isCollapsed ? "sr-only" : "truncate"}>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* Footer Metadata */}
            <div className="p-3.5 border-t border-slate-100">
                <div className={`text-[11px] font-mono text-slate-400 ${isCollapsed ? "text-center text-[10px]" : "flex items-center justify-between"}`}>
                    {!isCollapsed && <span>UTEP EMR</span>}
                    <span>v2.4</span>
                </div>
            </div>
        </aside>
    );
}
