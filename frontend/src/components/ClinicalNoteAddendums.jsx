import React, { useState } from "react";

const REASON_OPTIONS = [
    { value: "clarification", label: "Clarification" },
    { value: "correction", label: "Correction" },
    { value: "late_entry", label: "Late Entry" },
    { value: "preceptor_requested", label: "Preceptor Follow-Up" },
];

const REASON_LABELS = {
    clarification: "Clarification",
    correction: "Correction",
    late_entry: "Late Entry",
    preceptor_requested: "Preceptor Follow-Up",
    other: "Addendum",
};

function formatTimestamp(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ClinicalNoteAddendums({
    addendums = [],
    canAdd = false,
    encounterStatus = "",
    onSubmitAddendum,
}) {
    const list = Array.isArray(addendums) ? addendums : [];
    const [composing, setComposing] = useState(false);
    const [reason, setReason] = useState("clarification");
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    if (list.length === 0 && !canAdd) {
        return null;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (submitting) return;
        if (!content.trim()) {
            setError("Enter addendum clinical details before signing.");
            return;
        }

        setError("");
        setSubmitting(true);
        try {
            await onSubmitAddendum({ reason, content: content.trim() });
            setContent("");
            setReason("clarification");
            setComposing(false);
        } catch (err) {
            setError(err.message || "Unable to submit addendum. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section
            aria-label="Clinical Note Addendums"
            className="mt-6 pt-5 border-t border-slate-100"
        >
            {/* Header Bar */}
            <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500 font-medium">
                        Clinical Addendums
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 border border-slate-200 rounded-sm text-slate-500 tabular-nums">
                        {list.length}
                    </span>
                    <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                        · Original signed note is immutable
                    </span>
                </div>

                {canAdd && !composing && (
                    <button
                        type="button"
                        onClick={() => {
                            setError("");
                            setComposing(true);
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-200 hover:border-slate-400 rounded-sm transition-colors"
                    >
                        + Add Addendum
                    </button>
                )}
            </div>

            {/* Existing Addendums Stream */}
            {list.length > 0 && (
                <div className="border border-slate-200 rounded-sm bg-white divide-y divide-slate-100 mb-3">
                    {list.map((item, idx) => {
                        const isLatest = idx === list.length - 1;
                        const isPendingSignOff =
                            isLatest && encounterStatus === "pending review";
                        const isSignedOff = encounterStatus === "completed" || !isLatest;

                        return (
                            <article key={item.id || idx} className="px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] uppercase tracking-wider font-medium text-slate-900">
                                            Addendum #{idx + 1}
                                        </span>
                                        <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-600 rounded-sm">
                                            {REASON_LABELS[item.reason] || "Clarification"}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2.5">
                                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                                            {formatTimestamp(item.created_at)}
                                        </span>
                                        {isPendingSignOff ? (
                                            <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-slate-900 text-slate-900 bg-white rounded-sm">
                                                Awaiting Sign-Off
                                            </span>
                                        ) : isSignedOff ? (
                                            <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-slate-200 text-slate-500 bg-slate-50/60 rounded-sm">
                                                Signed Off
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <p className="mt-2 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed m-0">
                                    {item.content}
                                </p>
                            </article>
                        );
                    })}
                </div>
            )}

            {/* Inline Addendum Composer */}
            {canAdd && composing && (
                <form
                    onSubmit={handleSubmit}
                    className="border border-slate-200 bg-slate-50/40 rounded-sm p-4 space-y-3"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                            New Addendum Entry
                        </span>
                        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Addendum reason">
                            {REASON_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setReason(opt.value)}
                                    className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border rounded-sm transition-colors ${
                                        reason === opt.value
                                            ? "border-utep-blue bg-utep-blue text-white"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="addendum-narrative" className="sr-only">
                            Addendum Narrative
                        </label>
                        <textarea
                            id="addendum-narrative"
                            rows={3}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            disabled={submitting}
                            placeholder="Document supplemental clinical findings, corrections, or follow-up details..."
                            className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-200 focus:border-slate-400 rounded-sm outline-none transition-colors"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <p role="alert" className="text-xs text-red-700 m-0">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        <span className="font-mono text-[10px] text-slate-400">
                            Permanent append-only entry · Routes to instructor for sign-off
                        </span>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setComposing(false);
                                    setError("");
                                }}
                                disabled={submitting}
                                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 bg-white rounded-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-3 py-1 text-xs font-medium text-white bg-utep-blue hover:bg-utep-blue-hover rounded-sm transition-colors"
                            >
                                {submitting ? "Signing..." : "Sign & Submit Addendum"}
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </section>
    );
}

