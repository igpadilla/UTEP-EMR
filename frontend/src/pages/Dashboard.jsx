import React, { useEffect, useMemo, useState } from "react";
import {
    getMyAssignedCases as getInstructorCases,
    getMyCourses,
    getAllCourses,
} from "../services/instructorService.js";
import { getMyAssignedCases as getStudentCases } from "../services/studentCaseService.js";

const STATUS_META = {
    "not started": {
        label: "Assigned",
        badgeClass: "border-slate-200 text-slate-600 bg-white",
    },
    "in progress": {
        label: "In Progress",
        badgeClass: "border-slate-300 text-slate-900 bg-slate-50",
    },
    revision_requested: {
        label: "Revision Requested",
        badgeClass: "border-amber-300 text-amber-900 bg-amber-50/50",
    },
    "pending review": {
        label: "Awaiting Grading",
        badgeClass: "border-slate-900 text-slate-900 bg-white font-medium",
    },
    completed: {
        label: "Completed",
        badgeClass: "border-slate-200 text-slate-500 bg-slate-50/50",
    },
};

function formatDate(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    });
}

function isOverdueDate(dateString, status) {
    if (!dateString || status === "completed" || status === "pending review") return false;
    const due = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
}

export default function Dashboard({ user, onNavigate }) {
    const profile = user?.profile ?? {};
    const accountType = profile.account_type ?? "student";
    const isStudent = accountType === "student";
    const isAdmin = accountType === "admin";

    const firstName =
        profile.first_name ||
        profile.firstName ||
        profile.full_name?.split(" ")[0] ||
        "Clinician";

    const [cases, setCases] = useState([]);
    const [courseMap, setCourseMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filterTab, setFilterTab] = useState("primary");
    const [searchFilter, setSearchFilter] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function loadTasks() {
            setLoading(true);
            setError("");
            try {
                if (isStudent) {
                    const data = await getStudentCases();
                    if (!cancelled) setCases(data ?? []);
                } else {
                    const [casesData, coursesData] = await Promise.all([
                        getInstructorCases(false),
                        isAdmin ? getAllCourses().catch(() => []) : getMyCourses().catch(() => []),
                    ]);
                    if (!cancelled) {
                        setCases(casesData ?? []);
                        const map = {};
                        (coursesData ?? []).forEach((course) => {
                            map[course.id] = course;
                        });
                        setCourseMap(map);
                    }
                }
            } catch (err) {
                console.error("Failed to load dashboard tasks:", err);
                if (!cancelled) {
                    setError("Unable to load pending clinical tasks.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadTasks();
        return () => {
            cancelled = true;
        };
    }, [isStudent, isAdmin]);

    const metrics = useMemo(() => {
        const active = cases.filter((c) =>
            ["not started", "in progress", "revision_requested"].includes(c.encounter_status)
        ).length;
        const pendingReview = cases.filter((c) => c.encounter_status === "pending review").length;
        const revisions = cases.filter((c) => c.encounter_status === "revision_requested").length;
        const completed = cases.filter((c) => c.encounter_status === "completed").length;

        return { active, pendingReview, revisions, completed, total: cases.length };
    }, [cases]);

    const visibleCases = useMemo(() => {
        const q = searchFilter.trim().toLowerCase();

        return cases
            .filter((c) => {
                if (isStudent) {
                    if (filterTab === "primary") {
                        return ["not started", "in progress", "revision_requested"].includes(
                            c.encounter_status
                        );
                    }
                    if (filterTab === "submitted") {
                        return ["pending review", "completed"].includes(c.encounter_status);
                    }
                    return true;
                } else {
                    if (filterTab === "primary") {
                        return c.encounter_status === "pending review";
                    }
                    if (filterTab === "active") {
                        return ["not started", "in progress", "revision_requested"].includes(
                            c.encounter_status
                        );
                    }
                    if (filterTab === "completed") {
                        return c.encounter_status === "completed";
                    }
                    return true;
                }
            })
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
            });
    }, [cases, isStudent, filterTab, searchFilter]);

    return (
        <main className="w-full max-w-6xl mx-auto px-8 py-10">
            {/* Page Header */}
            <header className="pb-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-slate-400">
                        {isStudent ? "Student Clinical Queue" : "Instructor Grading Queue"}
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">
                        {firstName}&rsquo;s Workspace
                    </h1>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                    <span>
                        {new Date().toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                        })}
                    </span>
                </div>
            </header>

            {/* Minimalist Metric Strip */}
            <section
                aria-label="Task summary metrics"
                className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100 divide-y sm:divide-y-0 sm:divide-x divide-slate-100"
            >
                {isStudent ? (
                    <>
                        <div className="py-5 pr-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Active Cases
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.active}
                            </span>
                        </div>
                        <div className="py-5 sm:px-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Revisions Requested
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.revisions}
                            </span>
                        </div>
                        <div className="py-5 pr-6 sm:px-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Pending Review
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.pendingReview}
                            </span>
                        </div>
                        <div className="py-5 sm:pl-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Signed Off
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.completed}
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="py-5 pr-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Awaiting Grading
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.pendingReview}
                            </span>
                        </div>
                        <div className="py-5 sm:px-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                In Progress
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.active}
                            </span>
                        </div>
                        <div className="py-5 pr-6 sm:px-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Returned for Revision
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.revisions}
                            </span>
                        </div>
                        <div className="py-5 sm:pl-6">
                            <span className="block font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                Completed
                            </span>
                            <span className="block font-mono text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                                {metrics.completed}
                            </span>
                        </div>
                    </>
                )}
            </section>

            {/* Queue Controls */}
            <section className="pt-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-1" role="tablist" aria-label="Task queue filter">
                        {isStudent ? (
                            <>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "primary"}
                                    onClick={() => setFilterTab("primary")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "primary"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    Active Cases ({metrics.active})
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "submitted"}
                                    onClick={() => setFilterTab("submitted")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "submitted"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    Submitted & Graded ({metrics.pendingReview + metrics.completed})
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "all"}
                                    onClick={() => setFilterTab("all")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "all"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    All ({metrics.total})
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "primary"}
                                    onClick={() => setFilterTab("primary")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "primary"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    Awaiting Grading ({metrics.pendingReview})
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "active"}
                                    onClick={() => setFilterTab("active")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "active"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    In Progress ({metrics.active})
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={filterTab === "completed"}
                                    onClick={() => setFilterTab("completed")}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                        filterTab === "completed"
                                            ? "bg-slate-900 text-white"
                                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                    }`}
                                >
                                    Completed ({metrics.completed})
                                </button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="search"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            placeholder={
                                isStudent
                                    ? "Filter by patient or complaint..."
                                    : "Filter by student, patient, or complaint..."
                            }
                            aria-label="Filter tasks"
                            className="h-8 w-full sm:w-64 px-3 bg-white text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-slate-400 rounded-sm outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div
                        role="alert"
                        className="mt-4 px-4 py-3 border border-red-200 bg-red-50/40 text-xs text-red-800"
                    >
                        {error}
                    </div>
                )}

                {/* Pending Tasks Table */}
                {loading ? (
                    <div className="py-16 text-center font-mono text-xs text-slate-400">
                        Loading clinical queue...
                    </div>
                ) : visibleCases.length === 0 ? (
                    <div className="py-16 border-b border-slate-100 text-center">
                        <p className="text-sm font-medium text-slate-900">
                            {isStudent
                                ? filterTab === "primary"
                                    ? "No active cases require your attention."
                                    : "No matching cases in this view."
                                : filterTab === "primary"
                                  ? "All submitted cases have been graded."
                                  : "No matching cases in this view."}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                            {isStudent
                                ? "Assigned clinical scenarios will appear here automatically."
                                : "Switch tabs above to inspect active student encounters or completed sign-offs."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                                    {!isStudent && <th className="py-3 pr-4 font-normal">Student</th>}
                                    <th className="py-3 pr-4 font-normal">Patient</th>
                                    {!isStudent && <th className="py-3 pr-4 font-normal">Course</th>}
                                    <th className="py-3 pr-4 font-normal">Chief Complaint</th>
                                    <th className="py-3 pr-4 font-normal">Status</th>
                                    <th className="py-3 pr-4 font-normal">Due Date</th>
                                    <th className="py-3 pl-4 font-normal text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {visibleCases.map((c) => {
                                    const snap = c.patient_snapshot ?? c.patient_templates ?? {};
                                    const statusInfo = STATUS_META[c.encounter_status] ?? {
                                        label: c.encounter_status,
                                        badgeClass: "border-slate-200 text-slate-600 bg-white",
                                    };
                                    const overdue = isOverdueDate(c.due_date, c.encounter_status);
                                    const course = c.course_id ? courseMap[c.course_id] : null;
                                    const studentName = c.profiles
                                        ? `${c.profiles.first_name ?? ""} ${c.profiles.last_name ?? ""}`.trim()
                                        : "—";

                                    return (
                                        <tr
                                            key={c.id}
                                            className="hover:bg-slate-50/70 transition-colors group"
                                        >
                                            {!isStudent && (
                                                <td className="py-3.5 pr-4 font-medium text-slate-900 whitespace-nowrap">
                                                    {studentName || "—"}
                                                </td>
                                            )}

                                            <td className="py-3.5 pr-4 whitespace-nowrap">
                                                <div className="font-medium text-slate-900">
                                                    {snap.first_name || "Unnamed"} {snap.last_name || "Patient"}
                                                </div>
                                                <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                                                    {snap.age ? `${snap.age}y` : ""}
                                                    {snap.sex ? ` · ${snap.sex}` : ""}
                                                    {snap.occupation ? ` · ${snap.occupation}` : ""}
                                                </div>
                                            </td>

                                            {!isStudent && (
                                                <td className="py-3.5 pr-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                                    {course ? course.course_number : "Unassigned"}
                                                </td>
                                            )}

                                            <td className="py-3.5 pr-4 text-slate-600 max-w-xs truncate">
                                                {snap.chief_complaint || "—"}
                                            </td>

                                            <td className="py-3.5 pr-4 whitespace-nowrap">
                                                <span
                                                    className={`inline-block font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-sm ${statusInfo.badgeClass}`}
                                                >
                                                    {statusInfo.label}
                                                </span>
                                                {c.score != null && (
                                                    <span className="ml-2 font-mono text-[11px] text-slate-500 tabular-nums">
                                                        {c.score}/{c.max_score ?? 100}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="py-3.5 pr-4 font-mono text-[11px] tabular-nums whitespace-nowrap">
                                                <span className={overdue ? "text-red-700 font-medium" : "text-slate-500"}>
                                                    {formatDate(c.due_date)}
                                                </span>
                                                {overdue && (
                                                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-red-700">
                                                        Overdue
                                                    </span>
                                                )}
                                            </td>

                                            <td className="py-3.5 pl-4 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onNavigate("patientChart", null, {
                                                                caseId: c.id,
                                                                backTo: "dashboard",
                                                            })
                                                        }
                                                        className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 bg-white rounded-sm transition-colors"
                                                    >
                                                        Chart
                                                    </button>

                                                    {isStudent ? (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onNavigate("studentCases", null, {
                                                                    openCaseId: c.id,
                                                                })
                                                            }
                                                            className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-sm transition-colors"
                                                        >
                                                            {c.encounter_status === "revision_requested"
                                                                ? "Revise"
                                                                : c.encounter_status === "in progress"
                                                                  ? "Continue"
                                                                  : c.encounter_status === "not started"
                                                                    ? "Start Case"
                                                                    : "View Note"}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                c.course_id
                                                                    ? onNavigate("courseDetail", c.course_id)
                                                                    : onNavigate("instructorCases")
                                                            }
                                                            className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-sm transition-colors"
                                                        >
                                                            {c.encounter_status === "pending review"
                                                                ? "Grade"
                                                                : "Inspect"}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}
