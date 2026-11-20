import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import DynamicClinicalNoteForm from "./DynamicClinicalNoteForm.jsx";
import { getClinicalNoteTemplatesForCase } from "../services/clinicalNoteTemplateService.js";
import { saveCaseNotes, submitCase, signCase } from "../services/studentCaseService.js";

function serialize(template, data) {
    return JSON.stringify({
        format: "clinical-note-v1",
        template: {
            id: template.id,
            name: template.name,
            description: template.description,
            fields: template.fields,
        },
        data,
    });
}

export default function NotesPanel({ caseId, simMode = false, locked = false }) {
    const [templates, setTemplates] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [noteData, setNoteData] = useState({});
    const [encounterStatus, setEncounterStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;
    const isSigned = encounterStatus === "completed" || encounterStatus === "pending review";

    useEffect(() => {
        if (!caseId) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");
            try {
                // Load case encounter_notes + status
                const { data: caseRow, error: caseErr } = await supabase
                    .from("assigned_cases")
                    .select("encounter_notes, encounter_status")
                    .eq("id", caseId)
                    .single();
                if (caseErr) throw caseErr;

                // Load available templates for this case's discipline
                const { templates: tmplList } = await getClinicalNoteTemplatesForCase(caseId);

                if (cancelled) return;

                // Restore saved note if present
                let savedData = {};
                let savedTemplateId = "";
                try {
                    const parsed = JSON.parse(caseRow.encounter_notes);
                    if (parsed?.format === "clinical-note-v1") {
                        savedData = parsed.data ?? {};
                        // Prefer saved template so it stays selected even if removed from list
                        const inList = tmplList.find(t => t.id === parsed.template?.id);
                        if (!inList && parsed.template) tmplList.push(parsed.template);
                        savedTemplateId = parsed.template?.id ?? "";
                    }
                } catch { /* no saved note */ }

                setTemplates(tmplList);
                setSelectedId(savedTemplateId || tmplList[0]?.id || "");
                setNoteData(savedData);
                setEncounterStatus(caseRow.encounter_status);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [caseId]);

    async function handleSaveDraft() {
        if (!selectedTemplate || saving) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            await saveCaseNotes(caseId, serialize(selectedTemplate, noteData));
            setSuccess("Draft saved.");
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleSign() {
        if (!selectedTemplate || saving) return;
        // Check required fields
        const missing = (selectedTemplate.fields ?? []).filter(f => {
            if (!f.required) return false;
            const val = f.key.split(".").reduce((o, k) => o?.[k], noteData);
            return !String(val ?? "").trim();
        });
        if (missing.length) {
            setError(`Please complete: ${missing.map(f => f.label).join(", ")}.`);
            return;
        }
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const serialized = serialize(selectedTemplate, noteData);
            if (simMode) {
                await signCase(caseId, serialized);
                setEncounterStatus("completed");
                setSuccess("Note signed.");
            } else {
                await submitCase(caseId, serialized);
                setEncounterStatus("pending review");
                setSuccess("Submitted for instructor review.");
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <p style={{ padding: "1.25rem", color: "var(--text-muted)" }}>Loading notes…</p>;

    if (!templates.length) return (
        <p style={{ padding: "1.25rem", color: "var(--text-muted)" }}>
            No clinical note templates are configured for this discipline.
        </p>
    );

    const readOnly = locked || isSigned;

    return (
        <div style={{ padding: "1.25rem", maxWidth: "800px" }}>
            {error && <p className="form-message form-message-error" role="alert">{error}</p>}
            {success && <p className="form-message form-message-success" role="status">{success}</p>}

            {isSigned && (
                <div style={{
                    background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px",
                    padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem",
                    color: "#15803d", fontWeight: 500
                }}>
                    {encounterStatus === "completed"
                        ? "✓ Note signed — no further edits allowed."
                        : "Note submitted for instructor review."}
                </div>
            )}

            {/* Template selector — only show if multiple */}
            {templates.length > 1 && !readOnly && (
                <div style={{ marginBottom: "1rem" }}>
                    <label className="form-label">Note type</label>
                    <select className="form-input" value={selectedId}
                        onChange={e => { setSelectedId(e.target.value); setNoteData({}); }}>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
            )}

            <DynamicClinicalNoteForm
                template={selectedTemplate}
                value={noteData}
                onChange={setNoteData}
                readOnly={readOnly}
                disabled={saving}
            />

            {!readOnly && (
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                    <button type="button" className="secondary-action-button"
                        disabled={saving} onClick={handleSaveDraft}>
                        {saving ? "Saving…" : "Save Draft"}
                    </button>
                    <button type="button" className="primary-button"
                        disabled={saving} onClick={handleSign}>
                        {saving ? "Saving…" : simMode ? "Sign Note" : "Submit for Review"}
                    </button>
                </div>
            )}
        </div>
    );
}
