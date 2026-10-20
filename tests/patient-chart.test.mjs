import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { demographicsToForm, demographicsToUpdate, historyToForm, historyToUpdate } from "../frontend/src/components/patient-chart/patientChartForm.js";

const patient = {
    id: "patient-one", first_name: "Ana", last_name: "Smith", age: 38,
    date_of_birth: "1988-05-20", sex: "Female", updated_at: "2026-10-01T00:00:00Z",
    allergies: ["Penicillin"], medical_history: ["Asthma"], current_medications: [{ name: "Saved medicine" }],
    emergency_contacts: [{ name: "Pat", phone: "123", relationship: "Sibling" }, { name: "Sam", phone: "456" }],
};

test("demographic edits keep extra contacts and do not overwrite other sections", () => {
    const form = { ...demographicsToForm(patient), first_name: " Ana Maria ", contact_phone: " 999 " };
    const update = demographicsToUpdate(form, patient, "2026-10-19");
    assert.equal(update.first_name, "Ana Maria");
    assert.deepEqual(update.emergency_contacts, [
        { name: "Pat", phone: "999", relationship: "Sibling" }, { name: "Sam", phone: "456" },
    ]);
    for (const key of ["id", "allergies", "medical_history", "current_medications", "encounter_status"]) assert.ok(!(key in update));
    assert.deepEqual(patient.allergies, ["Penicillin"]);
});

test("demographics validate whole ages, names, email, and real dates", () => {
    const good = demographicsToForm(patient);
    for (const age of ["", " ", "12oops", "1.5", "-1", "151"]) {
        assert.throws(() => demographicsToUpdate({ ...good, age }, patient), /Age/);
    }
    assert.throws(() => demographicsToUpdate({ ...good, first_name: " " }, patient), /names/);
    assert.throws(() => demographicsToUpdate({ ...good, email: "ana@" }, patient), /email/);
    for (const date_of_birth of ["2026-02-30", "2028-01-01", "wrong"]) {
        assert.throws(() => demographicsToUpdate({ ...good, date_of_birth }, patient, "2026-10-19"), /date of birth/);
    }
    assert.equal(demographicsToUpdate({ ...good, age: "0", date_of_birth: "", email: "" }, patient).age, 0);
});

test("empty optional fields do not create a fake emergency contact", () => {
    const blankContactPatient = { ...patient, emergency_contacts: [] };
    const form = demographicsToForm(blankContactPatient);
    assert.deepEqual(demographicsToUpdate(form, blankContactPatient).emergency_contacts, []);
    assert.equal(demographicsToUpdate(form, blankContactPatient).address, null);
    assert.equal(demographicsToForm({ age: 0 }).age, "0");
});

test("allergies and history round-trip with commas intact and remove blank or repeated lines", () => {
    const form = historyToForm({ allergies: ["Peanuts, tree nuts"], medical_history: null });
    assert.equal(form.allergies, "Peanuts, tree nuts");
    assert.deepEqual(historyToUpdate({ allergies: " Latex \r\n\nlatex\nPeanuts, tree nuts", medical_history: " Asthma\nAsthma " }), {
        allergies: ["Latex", "Peanuts, tree nuts"], medical_history: ["Asthma"],
    });
    assert.deepEqual(historyToUpdate({ allergies: "", medical_history: "" }), { allergies: [], medical_history: [] });
});

const calls = [];
let response;
globalThis.chartTestClient = {
    from(table) {
        const query = { table, filters: [], update: null };
        calls.push(query);
        const chain = {
            select: (columns) => { query.columns = columns; return chain; },
            eq: (field, value) => { query.filters.push([field, value]); return chain; },
            update: (update) => { query.update = update; return chain; },
            single: async () => response,
            maybeSingle: async () => response,
        };
        return chain;
    },
};
registerHooks({ resolve(specifier, context, next) {
    if (specifier === "../supabase.js" && context.parentURL.endsWith("/patientChartService.js")) {
        return { url: "data:text/javascript,export const supabase=globalThis.chartTestClient", shortCircuit: true };
    }
    return next(specifier, context);
} });
const { loadPatientChart, saveDemographics, saveAllergiesAndHistory } = await import("../frontend/src/services/patientChartService.js");

test("case charts use their saved snapshot without fetching the live patient", async () => {
    calls.length = 0;
    response = { data: { patient_snapshot: { first_name: "Case patient" }, encounter_status: "pending review" } };
    const chart = await loadPatientChart({ patientId: patient.id, caseId: "case-one" });
    assert.equal(chart.patient.first_name, "Case patient");
    assert.equal(chart.caseStatus, "pending review");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "assigned_cases");
});

test("demographics save uses the original update time and returns server data", async () => {
    calls.length = 0;
    response = { data: { ...patient, first_name: "Updated" } };
    const saved = await saveDemographics(patient, { ...demographicsToForm(patient), first_name: "Updated" });
    assert.equal(saved.first_name, "Updated");
    assert.deepEqual(calls[0].filters, [["id", patient.id], ["updated_at", patient.updated_at]]);
    assert.ok(calls[0].update.updated_at);
    assert.ok(!("allergies" in calls[0].update));
});

test("history save writes only its own fields and refuses empty update results", async () => {
    calls.length = 0;
    response = { data: { ...patient, allergies: ["Latex"] } };
    await saveAllergiesAndHistory(patient, { allergies: "Latex", medical_history: "Asthma" });
    assert.deepEqual(Object.keys(calls[0].update).sort(), ["allergies", "medical_history", "updated_at"]);
    response = { data: null, error: null };
    await assert.rejects(saveAllergiesAndHistory(patient, historyToForm(patient)), /changed or you no longer have edit access/);
});

test("load and save failures return useful errors instead of staying in loading state", async () => {
    response = { data: null, error: { message: "Denied" } };
    await assert.rejects(loadPatientChart({ patientId: patient.id }), /Could not load/);
    await assert.rejects(saveDemographics(patient, demographicsToForm(patient)), /edits are still here/);
    await assert.rejects(saveAllergiesAndHistory({}, {}), /Case copies/);
});
