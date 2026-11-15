import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import {
    createSimulation,
    setSimParticipants,
    setSimEncounters,
    startSimulation,
    getSimulation,
    getSimParticipants,
    getSimEncounters,
} from "../services/simulationService.js";
import { getCourseStudents, getMyTemplates } from "../services/instructorService.js";

const ROLES = [
    { value: "front_desk", label: "Front Desk" },
    { value: "med", label: "Med Student" },
    { value: "patient_actor", label: "Patient Actor" },
    { value: "observer", label: "Observer" },
];

const DISCIPLINES = [
    "pharmacy", "nursing", "physical_therapy", "occupational_therapy",
    "psychology", "psychiatry", "speech_language_pathology", "social_work", "inpatient_physician",
];

export default function SimulationBuilder({ simId: initialSimId, courseId, courseName, onNavigate }) {
    const [simId, setSimId] = useState(initialSimId ?? null);
    const [title, setTitle] = useState("");
    const [endMode, setEndMode] = useState("workflow");
    const [duration, setDuration] = useState(30);

    // [{userId, simRole, discipline}]
    const [participants, setParticipants] = useState([]);
    // [{templateId, actorId, medId, arrivalType, scheduledTime}]
    const [encounters, setEncounters] = useState([]);

    const [students, setStudents] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                const [studentsData, templatesData] = await Promise.all([
                    getCourseStudents(courseId),
                    getMyTemplates(courseId),
                ]);
                setStudents(studentsData);
                setTemplates(templatesData);
                if (user) setCurrentUser(user);

                if (initialSimId) {
                    const [sim, parts, encs] = await Promise.all([
                        getSimulation(initialSimId),
                        getSimParticipants(initialSimId),
                        getSimEncounters(initialSimId),
                    ]);
                    setTitle(sim.title);
                    setEndMode(sim.end_mode);
                    setDuration(sim.duration_minutes ?? 30);
                    setParticipants(parts.map(p => ({
                        userId: p.participant?.user_id ?? p.user_id,
                        simRole: p.sim_role,
                        discipline: p.discipline ?? "",
                    })));
                    setEncounters(encs.map(e => ({
                        templateId: e.template_id ?? "",
                        actorId: e.actor?.user_id ?? "",
                        medId: e.med_student?.user_id ?? "",
                        arrivalType: e.arrival_type,
                        scheduledTime: e.scheduled_time ? e.scheduled_time.slice(0, 5) : "",
                    })));
                }
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [initialSimId, courseId]);

    function addParticipant() {
        setParticipants(prev => [...prev, { userId: "", simRole: "front_desk", discipline: "" }]);
    }
    function updateParticipant(i, field, value) {
        setParticipants(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
    }
    function removeParticipant(i) {
        setParticipants(prev => prev.filter((_, idx) => idx !== i));
    }

    function addEncounter() {
        setEncounters(prev => [...prev, { templateId: "", actorId: "", medId: "", arrivalType: "scheduled", scheduledTime: "" }]);
    }
    function updateEncounter(i, field, value) {
        setEncounters(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
    }
    function removeEncounter(i) {
        setEncounters(prev => prev.filter((_, idx) => idx !== i));
    }

    function validate() {
        if (!title.trim()) return "Title is required.";
        if (endMode === "timer" && (!duration || duration <= 0)) return "Duration must be a positive number.";
        const userIds = participants.map(p => p.userId).filter(Boolean);
        if (new Set(userIds).size < userIds.length) return "Each person can have only one role.";
        for (const p of participants) {
            if (!p.userId) return "All participant rows must have a user selected.";
            if (p.simRole === "med" && !p.discipline) return "Med participants require a discipline.";
        }
        for (const e of encounters) {
            if (!e.templateId) return "All encounter rows must have a template selected.";
            if (!e.actorId) return "All encounters must have a patient actor assigned.";
            if (!e.medId) return "All encounters must have a med student assigned.";
            if (e.arrivalType === "scheduled" && !e.scheduledTime) return "Scheduled encounters require a time.";
            const actorIsParticipant = participants.some(p => p.userId === e.actorId && p.simRole === "patient_actor")
                || (currentUser && e.actorId === currentUser.id); // instructor auto-added
            if (!actorIsParticipant) return "Patient actor must be assigned the patient_actor role in Participants.";
            const medIsParticipant = participants.some(p => p.userId === e.medId && p.simRole === "med");
            if (!medIsParticipant) return "Med student must be assigned the med role in Participants.";
        }
        return null;
    }

    async function saveToDb() {
        const { data: { user } } = await supabase.auth.getUser();

        // Auto-add instructor as patient_actor if they're used in any encounter
        const instructorUsedAsActor = encounters.some(e => e.actorId === user?.id);
        const instructorAlreadyListed = participants.some(p => p.userId === user?.id);
        const finalParticipants = (instructorUsedAsActor && !instructorAlreadyListed)
            ? [...participants, { userId: user.id, simRole: "patient_actor", discipline: "" }]
            : participants;

        let id = simId;
        if (!id) {
            id = await createSimulation({
                courseId,
                title: title.trim(),
                mode: "standard",
                endMode,
                durationMinutes: endMode === "timer" ? Number(duration) : null,
            });
            setSimId(id);
        }
        await setSimParticipants(id, finalParticipants.map(p => ({
            user_id: p.userId,
            sim_role: p.simRole,
            discipline: p.discipline || undefined,
        })));
        await setSimEncounters(id, encounters.map(e => ({
            template_id: e.templateId,
            patient_actor_id: e.actorId,
            assigned_med_id: e.medId,
            arrival_type: e.arrivalType,
            scheduled_time: e.arrivalType === "scheduled" ? e.scheduledTime : undefined,
        })));
        return id;
    }

    async function handleSaveDraft() {
        const err = validate();
        if (err) { setError(err); return; }
        setError(""); setSaving(true);
        try {
            await saveToDb();
            onNavigate("simulationList", null, { courseId, courseName });
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleStart() {
        const err = validate();
        if (err) { setError(err); return; }
        if (encounters.length === 0) { setError("Add at least one encounter."); return; }
        setError(""); setStarting(true);
        try {
            const id = await saveToDb();
            await startSimulation(id);
            onNavigate("simulationMonitor", id, { courseId, courseName });
        } catch (e) {
            setError(e.message);
        } finally {
            setStarting(false);
        }
    }

    const actorParticipants = participants.filter(p => p.simRole === "patient_actor" && p.userId);
    const medParticipants = participants.filter(p => p.simRole === "med" && p.userId);
    const studentById = Object.fromEntries(students.map(s => [s.user_id, s]));
    // Include instructor as a selectable participant (e.g. for patient actor role)
    const instructorOption = currentUser
        ? { user_id: currentUser.id, first_name: "Instructor", last_name: "(You)", _isInstructor: true }
        : null;
    const allPeople = instructorOption ? [instructorOption, ...students] : students;
    const allPeopleById = Object.fromEntries(allPeople.map(s => [s.user_id, s]));
    // Actor options: explicitly assigned patient_actors + instructor always available
    const actorOptions = [
        ...(instructorOption && !actorParticipants.some(p => p.userId === instructorOption.user_id)
            ? [{ userId: instructorOption.user_id, simRole: "patient_actor" }]
            : []),
        ...actorParticipants,
    ];

    if (loading) return <p className="form-message">Loading…</p>;

    return (
        <div className="emr-app">
            <main className="dashboard-main" style={{ maxWidth: "760px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                    <button type="button" className="back-button"
                        onClick={() => onNavigate("simulationList", null, { courseId, courseName })}>
                        ← Back
                    </button>
                    <div>
                        <p className="section-title">Simulation Builder</p>
                        <h2 style={{ margin: 0 }}>{simId ? title || "Edit simulation" : "New simulation"}</h2>
                    </div>
                </div>

                {error && <p className="form-message form-message--error" role="alert">{error}</p>}

                {/* ── Settings ── */}
                <section className="course-detail-section" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
                    <h4 style={{ marginTop: 0 }}>Settings</h4>
                    <div className="form-group">
                        <label className="form-label" htmlFor="sim-title">Title</label>
                        <input id="sim-title" className="form-input" type="text"
                            value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Week 3 Front Desk Simulation" />
                    </div>
                    <div className="form-row" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label" htmlFor="sim-end-mode">End condition</label>
                            <select id="sim-end-mode" className="form-input"
                                value={endMode} onChange={e => setEndMode(e.target.value)}>
                                <option value="workflow">Workflow — ends when all patients are discharged</option>
                                <option value="timer">Timer — ends at a set duration</option>
                            </select>
                        </div>
                        {endMode === "timer" && (
                            <div className="form-group" style={{ width: "140px" }}>
                                <label className="form-label" htmlFor="sim-duration">Duration (min)</label>
                                <input id="sim-duration" className="form-input" type="number"
                                    min="1" max="120" value={duration}
                                    onChange={e => setDuration(e.target.value)} />
                            </div>
                        )}
                    </div>
                    <div className="form-group" style={{ opacity: 0.5 }}>
                        <label className="form-label">Mode</label>
                        <select className="form-input" disabled>
                            <option>Standard (pre-assigned encounters)</option>
                            <option disabled>Chaos — coming soon</option>
                        </select>
                    </div>
                </section>

                {/* ── Participants ── */}
                <section className="course-detail-section" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h4 style={{ margin: 0 }}>Participants</h4>
                        <button type="button" className="secondary-button" onClick={addParticipant}>
                            + Add person
                        </button>
                    </div>
                    {participants.length === 0 && (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                            No participants yet. Add course students and assign each a role.
                        </p>
                    )}
                    {participants.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                            <div className="form-group" style={{ flex: 2, minWidth: "160px", marginBottom: 0 }}>
                                <label className="form-label">Student</label>
                                <select className="form-input" value={p.userId}
                                    onChange={e => updateParticipant(i, "userId", e.target.value)}>
                                    <option value="">— select —</option>
                                    {allPeople.map(s => (
                                        <option key={s.user_id} value={s.user_id}>
                                            {s.last_name}, {s.first_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                                <label className="form-label">Role</label>
                                <select className="form-input" value={p.simRole}
                                    onChange={e => updateParticipant(i, "simRole", e.target.value)}>
                                    {ROLES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                            {p.simRole === "med" && (
                                <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                                    <label className="form-label">Discipline</label>
                                    <select className="form-input" value={p.discipline}
                                        onChange={e => updateParticipant(i, "discipline", e.target.value)}>
                                        <option value="">— select —</option>
                                        {DISCIPLINES.map(d => (
                                            <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <button type="button" style={{ marginBottom: "0.1rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}
                                onClick={() => removeParticipant(i)} aria-label="Remove">✕</button>
                        </div>
                    ))}
                </section>

                {/* ── Encounters ── */}
                <section className="course-detail-section" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h4 style={{ margin: 0 }}>Scheduled Encounters ({encounters.length})</h4>
                        <button type="button" className="secondary-button" onClick={addEncounter}>
                            + Add encounter
                        </button>
                    </div>
                    {encounters.length === 0 && (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                            No encounters yet. Each encounter is a patient the front desk will check in.
                        </p>
                    )}
                    {encounters.map((e, i) => (
                        <div key={i} style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Encounter {i + 1}</span>
                                <button type="button" style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
                                    onClick={() => removeEncounter(i)}>Remove</button>
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                                <div className="form-group" style={{ flex: 2, minWidth: "160px", marginBottom: "0.5rem" }}>
                                    <label className="form-label">Patient template</label>
                                    <select className="form-input" value={e.templateId}
                                        onChange={ev => updateEncounter(i, "templateId", ev.target.value)}>
                                        <option value="">— select —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.last_name}, {t.first_name} — {t.chief_complaint}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ width: "120px", marginBottom: "0.5rem" }}>
                                    <label className="form-label">Time</label>
                                    <input className="form-input" type="time" value={e.scheduledTime}
                                        onChange={ev => updateEncounter(i, "scheduledTime", ev.target.value)} />
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                                <div className="form-group" style={{ flex: 1, minWidth: "160px", marginBottom: 0 }}>
                                    <label className="form-label">Patient actor</label>
                                    <select className="form-input" value={e.actorId}
                                        onChange={ev => updateEncounter(i, "actorId", ev.target.value)}>
                                        <option value="">— select —</option>
                                        {actorOptions.map(p => {
                                            const s = allPeopleById[p.userId];
                                            return s ? (
                                                <option key={p.userId} value={p.userId}>
                                                    {s.last_name}, {s.first_name}
                                                </option>
                                            ) : null;
                                        })}
                                    </select>
                                </div>
                                <div className="form-group" style={{ flex: 1, minWidth: "160px", marginBottom: 0 }}>
                                    <label className="form-label">Med student</label>
                                    <select className="form-input" value={e.medId}
                                        onChange={ev => updateEncounter(i, "medId", ev.target.value)}>
                                        <option value="">— select —</option>
                                        {medParticipants.map(p => {
                                            const s = studentById[p.userId];
                                            return s ? (
                                                <option key={p.userId} value={p.userId}>
                                                    {s.last_name}, {s.first_name}
                                                </option>
                                            ) : null;
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>

                {/* ── Actions ── */}
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <button type="button" className="secondary-button" onClick={handleSaveDraft} disabled={saving || starting}>
                        {saving ? "Saving…" : "Save draft"}
                    </button>
                    <button type="button" className="primary-button" onClick={handleStart} disabled={saving || starting}>
                        {starting ? "Starting…" : "Start simulation"}
                    </button>
                </div>
            </main>
        </div>
    );
}
