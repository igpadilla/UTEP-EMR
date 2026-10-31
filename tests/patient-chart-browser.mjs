import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const output = fileURLToPath(new URL("../.cache/patient-chart/", import.meta.url));
await mkdir(output, { recursive: true });

//     Show the real chart on a small test page, without signing into a live project
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div>
<script type="module" src="/__chart-entry.js"></script></body></html>`;
const fixtureScript = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import PatientChart from '/src/pages/PatientChart.jsx';
import '/src/styles.css';
const params = new URLSearchParams(location.search);
const caseId = params.get('case') ? 'case-one' : null;
createRoot(document.getElementById('root')).render(React.createElement(PatientChart, {
 id: caseId ? null : 'patient-one', caseId,
 canEditPatient: ['admin','instructor'].includes(params.get('role')),
 backTo: caseId ? 'studentCases' : 'patientDetail',
 onNavigate: (...args) => { window.lastNavigation = args; }
}));
`;

const server = await createServer({ root, configFile: `${root}/vite.config.js`,
    define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321"),
        "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
    },
    optimizeDeps: { include: ["react", "react-dom/client"] },
    plugins: [{ name: "chart-test-page",
        resolveId(id) { if (id === "/__chart-entry.js") return "\0chart-test-entry"; },
        load(id) { if (id === "\0chart-test-entry") return fixtureScript; },
        configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
            if (!req.url.startsWith("/__chart-check")) return next();
            try {
                const html = await vite.transformIndexHtml(req.url, fixture);
                res.setHeader("Content-Type", "text/html");
                res.end(html);
            } catch (error) { next(error); }
        });
    } }],
    server: { host: "127.0.0.1", port: 5191, strictPort: true },
});

let browser, page;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    });
    page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    let patient = {
        id: "patient-one", first_name: "Ana", last_name: "Smith", age: 38, date_of_birth: "1988-05-20", sex: "Female",
        occupation: "Teacher", phone_number: "555-0100", email: "ana@example.edu", address: "123 Example Street",
        emergency_contacts: [{ name: "Pat", phone: "555-0101", relationship: "Sibling" }, { name: "Sam", phone: "555-0102" }],
        allergies: ["Penicillin"], medical_history: ["Asthma"], current_medications: [{ name: "Existing medicine" }],
        updated_at: "2026-10-01T00:00:00.000Z",
    };
    let failLoad = true, failSave = false, conflict = false;
    let caseStatus = "in progress";
    const patches = [], reads = [];
    const casePatient = { first_name: "Case", last_name: "Patient", age: 70, sex: "Male", allergies: ["Case pollen"], medical_history: ["Case condition"] };

    await page.route("http://127.0.0.1:54321/**", async (route) => {
        const request = route.request(), url = new URL(request.url());
        const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        reads.push({ path: url.pathname, method: request.method(), search: url.search });
        if (url.pathname.endsWith("/patients")) {
            if (request.method() === "PATCH") {
                patches.push(request.postDataJSON());
                if (failSave) { failSave = false; return reply({ message: "Test save failure" }, 500); }
                if (conflict) { conflict = false; return reply(null); }
                assert.ok(url.searchParams.get("updated_at"), "Save must check the original update time");
                patient = { ...patient, ...request.postDataJSON() };
                return reply(patient);
            }
            if (failLoad) { failLoad = false; return reply({ message: "Test load failure" }, 500); }
            return reply(patient);
        }
        if (url.pathname.endsWith("/assigned_cases")) return reply({ patient_snapshot: casePatient, encounter_status: caseStatus });
        if (url.pathname.endsWith("/rpc/has_permission")) return reply(true);
        if (url.pathname.endsWith("/rpc/can_record_case_vitals")) return reply(true);
        if (["current_vital_sign_sets", "vital_sign_sets", "referrals", "diagnostic_orders"].some((table) => url.pathname.endsWith(`/${table}`))) return reply([]);
        throw new Error(`Unexpected chart test request: ${request.method()} ${url.pathname}`);
    });

    const visit = (query) => page.goto(`http://127.0.0.1:5191/__chart-check?${query}`, { waitUntil: "domcontentloaded" });
    await visit("role=admin");
    await page.getByRole("alert").filter({ hasText: "Could not load this patient chart" }).waitFor();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("heading", { name: "Patient summary", exact: true }).waitFor();
    await page.getByText("123 Example Street", { exact: true }).waitFor();
    await page.getByText("Sam", { exact: true }).waitFor();
    console.log("PASS: Summary loads saved demographics and all contacts; failed loads can be retried");

    await page.getByRole("button", { name: "Edit demographics", exact: true }).click();
    await page.getByLabel("First name", { exact: false }).fill("   ");
    await page.getByRole("button", { name: "Save demographics", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "First and last names are required" }).waitFor();
    assert.equal(patches.length, 0);
    await page.getByLabel("First name", { exact: false }).fill("Ana Maria");
    await page.getByLabel("Phone", { exact: true }).fill("555-0199");
    assert.ok(await page.getByRole("tab", { name: "Vitals", exact: true }).isDisabled());
    failSave = true;
    await page.getByRole("button", { name: "Save demographics", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Your edits are still here" }).waitFor();
    assert.equal(await page.getByLabel("First name", { exact: false }).inputValue(), "Ana Maria");
    await page.getByRole("button", { name: "Save demographics", exact: true }).click();
    await page.getByText("Patient demographics saved.", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Ana Maria Smith", exact: true }).waitFor();
    assert.equal(patient.phone_number, "555-0199");
    assert.equal(patient.emergency_contacts[0].relationship, "Sibling");
    assert.equal(patient.emergency_contacts[1].name, "Sam");
    assert.deepEqual(patient.current_medications, [{ name: "Existing medicine" }]);

    await page.getByRole("button", { name: "Edit demographics", exact: true }).click();
    await page.getByLabel("Last name", { exact: false }).fill("Discard this");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(patient.last_name, "Smith");
    console.log("PASS: demographic validation, save failures, successful updates, and cancel preserve other fields");

    await page.getByRole("tab", { name: "Allergies & History", exact: true }).click();
    await page.getByRole("button", { name: "Edit allergies and history", exact: true }).click();
    await page.getByLabel("Allergies", { exact: true }).fill("Latex\n Penicillin \nlatex\nPeanuts, tree nuts");
    await page.getByLabel("Medical history", { exact: true }).fill("Asthma\nHypertension");
    await page.getByRole("button", { name: "Save allergies and history", exact: true }).click();
    await page.getByText("Allergies and medical history saved.", { exact: true }).waitFor();
    assert.deepEqual(patient.allergies, ["Latex", "Penicillin", "Peanuts, tree nuts"]);
    assert.equal(patient.first_name, "Ana Maria");
    assert.deepEqual(Object.keys(patches.at(-1)).sort(), ["allergies", "medical_history", "updated_at"]);
    await page.locator(".chart-allergies").filter({ hasText: "Latex, Penicillin, Peanuts, tree nuts" }).waitFor();

    await page.getByRole("button", { name: "Edit allergies and history", exact: true }).click();
    conflict = true;
    await page.getByRole("button", { name: "Save allergies and history", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "The patient changed" }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Refresh chart", exact: true }).click();
    await page.getByText("Peanuts, tree nuts", { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/allergies-desktop.png`, fullPage: true });
    await page.getByRole("tab", { name: "Allergies & History", exact: true }).focus();
    await page.keyboard.press("Home");
    await page.getByRole("heading", { name: "Patient summary", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/summary-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${output}/summary-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile chart must fit the viewport");
    await page.getByRole("tab", { name: "Allergies & History", exact: true }).click();
    await page.screenshot({ path: `${output}/allergies-mobile.png`, fullPage: true });
    console.log("PASS: allergies/history save independently, banner updates, conflicts are shown, and mobile layout fits");

    await page.setViewportSize({ width: 1280, height: 950 });
    await page.getByRole("tab", { name: "Allergies & History", exact: true }).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("heading", { name: "Vitals flowsheet", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Labs & Imaging", exact: true }).click();
    await page.getByRole("heading", { name: "Labs & Imaging", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Referrals", exact: true }).click();
    await page.getByRole("heading", { name: "Specialty Referrals", exact: true }).waitFor();
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.lastNavigation), ["patientDetail", "patient-one"]);
    console.log("PASS: keyboard tab navigation, Vitals, Referrals, and back navigation still work");

    await visit("role=instructor");
    await page.getByRole("button", { name: "Edit demographics", exact: true }).waitFor();
    await visit("role=student");
    await page.getByRole("heading", { name: "Patient summary", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Edit demographics", exact: true }).count(), 0);
    const patchCount = patches.length;
    for (const status of ["in progress", "pending review", "completed"]) {
        caseStatus = status;
        const before = reads.filter((r) => r.path.endsWith("/patients")).length;
        await visit("role=admin&case=1");
        await page.getByRole("heading", { name: "Case Patient", exact: false }).waitFor();
        assert.equal(reads.filter((r) => r.path.endsWith("/patients")).length, before);
        assert.equal(await page.getByRole("button", { name: "Edit demographics", exact: true }).count(), 0);
        await page.getByRole("tab", { name: "Allergies & History", exact: true }).click();
        await page.getByText("Case pollen", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Edit allergies and history", exact: true }).count(), 0);
        await page.getByRole("tab", { name: "Vitals", exact: true }).click();
        if (status === "in progress") await page.getByRole("button", { name: "+ Record vitals", exact: true }).waitFor();
        else {
            await page.getByText("This case has been submitted, so its vitals are read-only.").waitFor();
            assert.equal(await page.getByRole("button", { name: "+ Record vitals", exact: true }).count(), 0);
        }
    }
    assert.equal(patches.length, patchCount);
    assert.deepEqual(errors, []);
    console.log("PASS: edit controls follow account role, case copies stay read-only, and submitted-case vitals remain locked");
} catch (error) {
    if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    throw error;
} finally {
    await browser?.close();
    await server.close();
}
