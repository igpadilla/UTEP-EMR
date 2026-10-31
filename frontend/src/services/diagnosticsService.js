import { supabase } from "../supabase.js";
import { logCaseAction, ACTION_TYPES } from "./auditService.js";
import localCatalog from "../data/diagnosticsCatalog.json";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000";
const BUCKET = "diagnostic-attachments";

function formatRange(low, high) {
    if (low != null && high != null) return `${low}–${high}`;
    if (high != null) return `≤ ${high}`;
    if (low != null) return `≥ ${low}`;
    return "—";
}

export function classifyAnalyteValue(val, spec = {}) {
    const num = Number(val);
    if (!Number.isFinite(num)) return "normal";
    if (spec.critical_low != null && num <= spec.critical_low) return "critical_low";
    if (spec.critical_high != null && num >= spec.critical_high) return "critical_high";
    if (spec.low != null && num < spec.low) return "low";
    if (spec.high != null && num > spec.high) return "high";
    return "normal";
}

export function evaluateLabValuesLocal(testCode, values = []) {
    const code = String(testCode || "").toLowerCase();
    const item = localCatalog.items.find((i) => i.code.toLowerCase() === code);
    const map = new Map((item?.analytes || []).map((a) => [a.code.toLowerCase(), a]));

    let hasAbnormal = false;
    let hasCritical = false;

    const analytes = values.map((entry) => {
        const spec = map.get(String(entry.code || "").toLowerCase()) || {};
        const value = Number(entry.value);
        const flag = classifyAnalyteValue(value, spec);
        if (flag === "critical_low" || flag === "critical_high") {
            hasCritical = true;
            hasAbnormal = true;
        } else if (flag === "low" || flag === "high") {
            hasAbnormal = true;
        }
        return {
            code: spec.code || entry.code,
            name: spec.name || entry.name || entry.code,
            value,
            unit: spec.unit || entry.unit || "",
            reference_range: formatRange(spec.low, spec.high),
            flag,
        };
    });

    return {
        test_code: testCode,
        overall_flag: hasCritical ? "critical" : hasAbnormal ? "abnormal" : "normal",
        has_abnormal: hasAbnormal,
        has_critical: hasCritical,
        analytes,
    };
}

async function fetchBackend(path, options = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("No session token");

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
    if (!response.ok) throw new Error(`Backend error: ${response.status}`);
    return response.json();
}

export async function getDiagnosticsCatalog({ category, q } = {}) {
    try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (q) params.set("q", q);
        const qs = params.toString();
        const res = await fetchBackend(`/api/diagnostics/catalog${qs ? `?${qs}` : ""}`);
        return res.items;
    } catch {
        let items = localCatalog.items;
        if (category) items = items.filter((i) => i.category === category);
        if (q) {
            const query = q.trim().toLowerCase();
            items = items.filter((i) =>
                i.name.toLowerCase().includes(query) ||
                i.code.toLowerCase().includes(query) ||
                i.clinical_code.toLowerCase().includes(query) ||
                (i.aliases || []).some((a) => a.toLowerCase().includes(query))
            );
        }
        return items;
    }
}

export async function evaluateLabValues(testCode, values) {
    try {
        return await fetchBackend("/api/diagnostics/evaluate-lab", {
            method: "POST",
            body: JSON.stringify({ test_code: testCode, values }),
        });
    } catch {
        return evaluateLabValuesLocal(testCode, values);
    }
}

export async function getDiagnosticOrders({ patientId, caseId } = {}) {
    let query = supabase
        .from("diagnostic_orders")
        .select("*, profiles:ordered_by(first_name, last_name), diagnostic_results(*, profiles:resulted_by(first_name, last_name))")
        .order("created_at", { ascending: false });

    if (caseId) query = query.eq("case_id", caseId);
    else if (patientId) query = query.eq("patient_id", patientId);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

export async function createDiagnosticOrder({
    patientId, caseId, category, testCode, testName, codingSystem, clinicalCode,
    specimenOrModality, priority = "routine", clinicalIndication, notes,
}) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
        .from("diagnostic_orders")
        .insert({
            patient_id: patientId || null,
            case_id: caseId || null,
            category,
            test_code: testCode,
            test_name: testName,
            coding_system: codingSystem,
            clinical_code: clinicalCode,
            specimen_or_modality: specimenOrModality || null,
            priority,
            clinical_indication: clinicalIndication,
            notes: notes || null,
            ordered_by: user.id,
        })
        .select()
        .single();

    if (error) throw error;

    if (caseId) {
        const action = category === "imaging" ? ACTION_TYPES.IMAGING_ORDERED : ACTION_TYPES.LAB_ORDERED;
        const detail = `${testName} (${clinicalCode}) — ${priority.toUpperCase()}: ${clinicalIndication}`;
        await logCaseAction(caseId, user.id, action, null, detail).catch(() => {});
    }

    return data;
}

export async function addDiagnosticResult({
    order, structuredValues = [], reportFindings = null, reportImpression = null,
    overallFlag = "normal", file = null,
}) {
    const { data: { user } } = await supabase.auth.getUser();
    let fileMeta = {};

    if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const scope = order.case_id || order.patient_id || "general";
        const filePath = `${scope}/${order.id}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(filePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        fileMeta = {
            file_path: filePath,
            file_name: file.name,
            file_mime_type: file.type || "application/octet-stream",
            file_size_bytes: file.size || null,
        };
    }

    const { data: result, error: resultError } = await supabase
        .from("diagnostic_results")
        .insert({
            order_id: order.id,
            structured_values: structuredValues,
            report_findings: reportFindings || null,
            report_impression: reportImpression || null,
            overall_flag: overallFlag,
            resulted_by: user.id,
            ...fileMeta,
        })
        .select()
        .single();

    if (resultError) throw resultError;

    const { error: updateError } = await supabase
        .from("diagnostic_orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", order.id);

    if (updateError) throw updateError;

    if (order.case_id) {
        const detail = `${order.test_name} — ${overallFlag.toUpperCase()}${file ? ` (${file.name})` : ""}`;
        await logCaseAction(order.case_id, user.id, ACTION_TYPES.DIAGNOSTIC_RESULT_ADDED, order.status, detail).catch(() => {});
    }

    return result;
}

export async function cancelDiagnosticOrder(order, reason = null) {
    const { data: { user } } = await supabase.auth.getUser();
    const updatedNotes = reason
        ? [order.notes, `Cancelled: ${reason}`].filter(Boolean).join(" | ")
        : order.notes;

    const { error } = await supabase
        .from("diagnostic_orders")
        .update({ status: "cancelled", notes: updatedNotes, updated_at: new Date().toISOString() })
        .eq("id", order.id);

    if (error) throw error;

    if (order.case_id && user) {
        const detail = `${order.test_name}${reason ? `: ${reason}` : ""}`;
        await logCaseAction(order.case_id, user.id, ACTION_TYPES.DIAGNOSTIC_ORDER_CANCELLED, order.status, detail).catch(() => {});
    }
}

export async function getAttachmentUrl(filePath) {
    if (!filePath) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data?.signedUrl || null;
}

