import { supabase } from "../supabase.js";
import { logCaseAction, ACTION_TYPES } from "./auditService.js";
import { validateGrade } from "../lib/grading.js";

export async function searchPatients(query) {
    let q = supabase
        .from("patients")
        .select("id, first_name, last_name, age, sex, occupation, current_medications, last_visit_notes")
        .order("last_name");

    if (query.trim()) {
        q = q.or(
            `first_name.ilike.%${query}%,last_name.ilike.%${query}%`
        );
    }

    const { data, error } = await q.limit(50);
    if (error) throw error;
    return data;
}

export async function getPatientById(id) {
    const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", id)
        .single();
    if (error) throw error;
    return data;
}

export async function getMyTemplates() {
    const { data, error } = await supabase
        .from("patient_templates")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
}

export async function getTemplateById(id) {
    const { data, error } = await supabase
        .from("patient_templates")
        .select("*")
        .eq("id", id)
        .single();
    if (error) throw error;
    return data;
}

export async function createTemplate(templateData) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from("patient_templates")
        .insert({ ...templateData, instructor_id: user.id })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateTemplate(id, templateData) {
    const { data, error } = await supabase
        .from("patient_templates")
        .update(templateData)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteTemplate(id) {
    const { error } = await supabase
        .from("patient_templates")
        .delete()
        .eq("id", id);
    if (error) throw error;
}

export async function getMyCourses() {
    const { data, error } = await supabase
        .from("courses")
        .select("id, course_number, crn")
        .order("course_number");
    if (error) throw error;
    return data;
}

export async function getCourseStudents(courseId) {
    const { data, error } = await supabase
        .from("course_enrollments")
        .select("profiles!student_id ( user_id, first_name, last_name )")
        .eq("course_id", courseId);
    if (error) throw error;
    return data.map((row) => row.profiles).filter(Boolean);
}

export async function getStudents() {
    const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .eq("account_type", "student")
        .eq("active", true)
        .order("last_name");
    if (error) throw error;
    return data;
}

export async function getMyAssignedCases(includeArchived = false) {
    let query = supabase
        .from("assigned_cases")
        .select(`
            *,
            patient_templates ( first_name, last_name, chief_complaint, traps, rubric_criteria, expectations_rubric ),
            profiles!student_id ( first_name, last_name )
        `)
        .order("assigned_at", { ascending: false });

    if (!includeArchived) {
        query = query.eq("is_archived", false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function archiveCase(caseId) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function unarchiveCase(caseId) {
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({ is_archived: false, updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function signOffCase(caseId, instructorFeedback) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({ encounter_status: "completed", instructor_feedback: instructorFeedback, updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    await logCaseAction(caseId, user.id, ACTION_TYPES.CASE_SIGNED_OFF, "pending review", "completed").catch(() => {});
    if (instructorFeedback?.trim()) {
        await logCaseAction(caseId, user.id, ACTION_TYPES.FEEDBACK_ADDED, null, instructorFeedback.trim()).catch(() => {});
    }
    return data;
}

export async function returnCase(caseId, instructorFeedback) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from("assigned_cases")
        .update({ encounter_status: "revision_requested", instructor_feedback: instructorFeedback, updated_at: new Date().toISOString() })
        .eq("id", caseId)
        .select()
        .single();
    if (error) throw error;
    await logCaseAction(caseId, user.id, ACTION_TYPES.CASE_RETURNED, "pending review", "revision_requested").catch(() => {});
    if (instructorFeedback?.trim()) {
        await logCaseAction(caseId, user.id, ACTION_TYPES.FEEDBACK_ADDED, null, instructorFeedback.trim()).catch(() => {});
    }
    return data;
}

export async function gradeCase(caseId, { criteria, rubricScores, chartAnnotations, feedback, decision }) {
    if (!["approve", "return"].includes(decision)) throw new Error("Choose sign-off or return for revision.");
    const grade = validateGrade(criteria, rubricScores);
    const { data: { user } } = await supabase.auth.getUser();
    const newStatus = decision === "approve" ? "completed" : "revision_requested";

    const { data, error } = await supabase
        .from("assigned_cases")
        .update({
            encounter_status: newStatus,
            rubric_scores: grade.rubricScores,
            chart_annotations: chartAnnotations,
            score: grade.score,
            max_score: grade.maxScore,
            instructor_feedback: feedback,
            updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .select()
        .single();

    if (error) throw error;

    const actionType = decision === "approve" ? ACTION_TYPES.CASE_SIGNED_OFF : ACTION_TYPES.CASE_RETURNED;
    await logCaseAction(caseId, user.id, actionType, "pending review", newStatus).catch(() => {});
    if (feedback?.trim()) {
        await logCaseAction(caseId, user.id, ACTION_TYPES.FEEDBACK_ADDED, null, feedback.trim()).catch(() => {});
    }

    return data;
}

export async function assignCase(templateId, studentId, patientSnapshot, dueDate = null, assignmentNotes = null) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from("assigned_cases")
        .insert({
            template_id: templateId,
            student_id: studentId,
            assigned_by: user.id,
            patient_snapshot: patientSnapshot,
            due_date: dueDate || null,
            assignment_notes: assignmentNotes || null,
        })
        .select()
        .single();
    if (error) throw error;
    await logCaseAction(data.id, user.id, ACTION_TYPES.CASE_ASSIGNED, null, studentId).catch(() => {});

    if (patientSnapshot?.initial_referral?.target_discipline) {
        const priority = patientSnapshot.initial_referral.priority || "routine";
        const reason = patientSnapshot.initial_referral.reason?.trim() || "Initial consult requested";
        const { error: refError } = await supabase.from("referrals").insert({
            case_id: data.id,
            referring_user_id: user.id,
            target_discipline: patientSnapshot.initial_referral.target_discipline,
            priority,
            reason,
            notes: patientSnapshot.initial_referral.notes?.trim() || null,
        });
        if (refError) {
            console.error("Failed to seed initial referral:", refError);
        } else {
            const detail = `${patientSnapshot.initial_referral.target_discipline} (${priority.toUpperCase()}) — ${reason}`;
            await logCaseAction(data.id, user.id, ACTION_TYPES.REFERRAL_REQUESTED, null, detail).catch(() => {});
        }
    }

    return data;
}
