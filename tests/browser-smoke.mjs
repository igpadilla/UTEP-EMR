import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";

// Run the real React app against an intercepted API; never touch a live project.
const root = fileURLToPath(new URL("../frontend", import.meta.url));
const artifacts = fileURLToPath(new URL("../.cache/verification/", import.meta.url));
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: `${root}/vite.config.js`,
    define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321"),
        "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("test-anon-key"),
    },
    server: { host: "127.0.0.1", port: 5189, strictPort: true },
});
let browser, page;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    });
    page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(10000);
    let accountActive = true;
    let enrolled = false;
    let creationCalls = 0;
    let gradeSaved;
    const listRequests = [];
    const students = Array.from({ length: 31 }, (_, i) => ({
        user_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        first_name: "Student", last_name: String(i + 1).padStart(2, "0"),
        email: `student${i + 1}@example.edu`, active: i % 2 === 0,
    }));
    const criteria = [{ key: "complaint", label: "Chief complaint", maxPoints: 2 }, { key: "history", label: "History", maxPoints: 8 }];
    const assigned = { id: "case-1", encounter_status: "pending review", assigned_at: "2026-10-01",
        encounter_notes: "Student clinical findings", patient_snapshot: {}, rubric_scores: {},
        patient_templates: { first_name: "Test", last_name: "Patient", chief_complaint: "Follow-up",
            rubric_criteria: criteria, expectations_rubric: "Reference guide for the existing review workflow" },
        profiles: { first_name: "Student", last_name: "One" },
    };
    const user = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.edu", role: "authenticated", aud: "authenticated", user_metadata: {}, app_metadata: {} };
    const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`;
    await page.route("http://127.0.0.1:54321/**", async (route) => {
        const request = route.request(), url = new URL(request.url());
        const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (url.pathname.endsWith("/token")) return reply({ access_token: jwt, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user });
        if (url.pathname.endsWith("/user")) return reply(user);
        if (url.pathname.endsWith("/logout")) return reply({});
        if (url.pathname.endsWith("/profiles")) return reply({ user_id: user.id, first_name: "Test", last_name: "Admin", account_type: "admin", active: accountActive });
        if (url.pathname.endsWith("/manage-students")) {
            if (request.method() === "PATCH") {
                const body = request.postDataJSON();
                const student = students.find((s) => s.user_id === body.userId);
                if ("active" in body) student.active = body.active;
                return reply({ student });
            }
            listRequests.push(url.searchParams);
            let matches = students.filter((student) => {
                const search = (url.searchParams.get("search") || "").toLowerCase();
                const status = url.searchParams.get("status");
                return `${student.first_name} ${student.last_name} ${student.email}`.toLowerCase().includes(search)
                    && (status === "all" || student.active === (status === "active"));
            });
            const pageNumber = Math.min(Number(url.searchParams.get("page")), Math.max(1, Math.ceil(matches.length / 25)));
            return reply({ students: matches.slice((pageNumber - 1) * 25, pageNumber * 25), page: pageNumber, total: matches.length, pageSize: 25 });
        }
        if (url.pathname.endsWith("/create-student")) {
            creationCalls++;
            return reply({ student: { id: "created-student", ...request.postDataJSON() } }, 201);
        }
        if (url.pathname.endsWith("/enroll-in-course")) {
            if (!enrolled) { enrolled = true; return reply({ error: "Test enrollment unavailable" }, 500); }
            return reply({ enrolled: true });
        }
        if (url.pathname.endsWith("/patient_templates")) return reply([]);
        if (url.pathname.endsWith("/assigned_cases")) {
            if (request.method() === "PATCH") {
                gradeSaved = request.postDataJSON();
                Object.assign(assigned, gradeSaved);
                return reply(assigned);
            }
            return reply([assigned]);
        }
        if (url.pathname.endsWith("/audit_logs")) return reply([]);
        throw new Error(`Unexpected test API request: ${request.method()} ${url.pathname}`);
    });
    await page.goto("http://127.0.0.1:5189");
    await page.getByLabel("Email", { exact: true }).fill("admin@example.edu");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.getByRole("button", { name: "Students", exact: true }).click();
    await page.getByText("Page 1 of 2").waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Page 2 of 2").waitFor();
    await page.getByLabel("Search by name or email").fill("student31@example.edu");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("1 matching student", { exact: true }).waitFor();
    assert.equal(listRequests.at(-1).get("page"), "1");
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByText("Student deactivated. Their existing work has been kept.").waitFor();
    await page.getByRole("button", { name: "Reactivate", exact: true }).click();
    await page.getByText("Student reactivated. They can sign in again.").waitFor();
    await page.getByLabel("Account status", { exact: true }).selectOption("inactive");
    await page.getByText("No students match your search or status filter.").waitFor();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByText("Page 1 of 2").waitFor();
    console.log("PASS: directory pagination, search, filters, deactivation, and reactivation");

    await page.getByLabel("First Name", { exact: true }).fill("   ");
    await page.getByLabel("Last Name", { exact: true }).fill("Smith");
    await page.getByLabel("Email", { exact: true }).fill("ana@example.edu");
    await page.getByLabel("Temporary Password", { exact: true }).fill("secret1");
    await page.getByLabel("Confirm Temporary Password", { exact: true }).fill("secret1");
    await page.getByRole("button", { name: "Create Student", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "First and last names" }).waitFor();
    assert.equal(creationCalls, 0);

    await page.getByLabel("CSV Data").fill("Ana Smith,invalid,P,1");
    await page.getByRole("button", { name: "Run Bulk Import", exact: true }).click();
    await page.getByText("Row 1: Enter a valid email address.").waitFor();
    assert.equal(creationCalls, 0);
    await page.getByLabel("CSV Data").fill("Ana Smith,ana@example.edu,P,1");
    await page.getByRole("button", { name: "Run Bulk Import", exact: true }).click();
    await page.getByRole("cell").filter({ hasText: "Account created; enrollment failed" }).waitFor();
    assert.equal(await page.locator(".student-import-credentials code").count(), 1);
    const password = await page.locator(".student-import-credentials code").textContent();
    await page.getByRole("button", { name: "Retry unfinished rows", exact: true }).click();
    await page.getByText("Account created and enrolled", { exact: true }).waitFor();
    assert.equal(creationCalls, 1);
    assert.equal(await page.locator(".student-import-credentials code").textContent(), password);
    await page.screenshot({ path: `${artifacts}/student-management-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${artifacts}/student-management-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1366, height: 1000 });
    console.log("PASS: validation, CSV errors, retained credentials, and enrollment-only retry");

    await page.getByRole("button", { name: "Cases", exact: true }).click();
    await page.getByRole("button", { name: "Grade", exact: true }).click();
    await page.getByText("Reference guide for the existing review workflow").waitFor();
    await page.getByLabel("Chief complaint", { exact: true }).fill("3");
    await page.getByLabel("History", { exact: true }).fill("7");
    await page.getByRole("button", { name: "Approve & Sign Off", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Enter a score from 0 to 2" }).waitFor();
    assert.equal(gradeSaved, undefined);
    await page.getByLabel("Chief complaint", { exact: true }).fill("1.5");
    await page.screenshot({ path: `${artifacts}/grading-desktop.png`, fullPage: true });
    await page.getByRole("button", { name: "Approve & Sign Off", exact: true }).click();
    await page.getByRole("button", { name: "View", exact: true }).waitFor();
    assert.equal(gradeSaved.score, 8.5);
    assert.equal(gradeSaved.max_score, 10);
    console.log("PASS: reference guide, score bounds, and correct custom-rubric denominator");

    accountActive = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText("Your account is inactive.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Sign In", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Students", exact: true }).count(), 0);
    assert.deepEqual(pageErrors, []);
    console.log("PASS: an already-open app signs out a deactivated account on focus; no browser errors");
} catch (error) {
    if (page) await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
    console.error(error);
    throw error;
} finally {
    await browser?.close();
    await server.close();
}
