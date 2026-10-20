import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Execute the real handlers; replace only the Supabase runtime wrapper.
registerHooks({
    resolve(specifier, context, next) {
        if (specifier === "@supabase/server") return {
            url: "data:text/javascript,export const withSupabase = (options, handler) => handler;", shortCircuit: true,
        };
        if (specifier === "@supabase/functions-js/edge-runtime.d.ts") return {
            url: "data:text/javascript,export {};", shortCircuit: true,
        };
        return next(specifier, context);
    },
});
const { default: create } = await import("../supabase/functions/create-student/index.ts");
const { default: manage } = await import("../supabase/functions/manage-students/index.ts");
const studentId = "11111111-1111-4111-8111-111111111111";

function context({ role = "admin", active = true, createError = null, records = 0, recordsByTable = {} } = {}) {
    const calls = [];
    const target = { user_id: studentId, active: true, first_name: "Ana", last_name: "Smith" };
    const resolve = (q) => {
        calls.push({ table: q.table, op: q.op, changes: q.changes });
        if (q.op === "update") { Object.assign(target, q.changes); return { data: target }; }
        if (q.table !== "profiles") return { count: recordsByTable[q.table] ?? records, error: null };
        if (q.filters.user_id === "caller") return { data: { account_type: role, active } };
        return { data: target };
    };
    const ctx = {
        supabase: { auth: { getUser: async () => ({ data: { user: { id: "caller" } } }) } },
        supabaseAdmin: {
            from(table) {
                const q = { table, op: "select", filters: {} };
                for (const method of ["select", "or"]) q[method] = () => q;
                q.eq = (key, value) => { q.filters[key] = value; return q; };
                q.update = (changes) => { q.op = "update"; q.changes = changes; return q; };
                q.single = q.maybeSingle = async () => resolve(q);
                q.then = (ok, fail) => Promise.resolve(resolve(q)).then(ok, fail);
                return q;
            },
            rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: { students: [], total: 0, page: 1, pageSize: 25 } }; },
            auth: { admin: {
                createUser: async (input) => { calls.push({ create: input }); return { data: { user: createError ? null : { id: studentId } }, error: createError }; },
                deleteUser: async (id) => { calls.push({ deleted: id }); return {}; },
                updateUserById: async (id, input) => { calls.push({ email: input }); return { data: { user: { id, ...input } } }; },
            } },
        },
    };
    return { ctx, calls, target };
}
function request(method, body, query = "") {
    return new Request(`http://localhost/manage-students${query}`, { method,
        ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    });
}

test("search is admin-only, and inactive callers cannot create or manage students", async () => {
    for (const options of [{ role: "student" }, { role: "instructor" }, { active: false }]) {
        const { ctx, calls } = context(options);
        assert.equal((await manage.fetch(request("GET"), ctx)).status, 403);
        assert.ok(!calls.some((call) => call.rpc));
    }
    const { ctx } = context({ active: false });
    assert.equal((await create.fetch(request("POST", {}), ctx)).status, 403);
});

test("search forwards validated filters and rejects invalid page/status values", async () => {
    const { ctx, calls } = context();
    assert.equal((await manage.fetch(request("GET", undefined, "?search=Ana%40example.edu&status=inactive&page=2"), ctx)).status, 200);
    assert.deepEqual(calls.find((call) => call.rpc)?.args, { p_search: "Ana@example.edu", p_status: "inactive", p_page: 2 });
    for (const query of ["?page=-1", "?page=1.2", "?page=2147483648", "?status=bogus"]) {
        assert.equal((await manage.fetch(request("GET", undefined, query), ctx)).status, 400);
    }
});

test("create rejects malformed bodies before creating an Auth account", async () => {
    for (const body of [null, [], { firstName: 42 }, { firstName: "Ana", lastName: "Smith", email: "bad@", password: "secret" }]) {
        const { ctx, calls } = context();
        assert.equal((await create.fetch(request("POST", body), ctx)).status, 400);
        assert.ok(!calls.some((call) => call.create));
    }
});

test("instructors retain account-creation permission and duplicate email returns a clear conflict", async () => {
    const body = { firstName: " Ana ", lastName: " Smith ", email: " ANA@EXAMPLE.EDU ", password: "secret" };
    const { ctx, calls } = context({ role: "instructor" });
    assert.equal((await create.fetch(request("POST", body), ctx)).status, 201);
    assert.equal(calls.find((call) => call.create).create.email, "ana@example.edu");
    const duplicate = context({ createError: { code: "email_exists", message: "User already registered" } });
    const response = await create.fetch(request("POST", body), duplicate.ctx);
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already in use/);
});

test("deactivation and reactivation only change the existing profile, preserving identity and records", async () => {
    const { ctx, calls, target } = context();
    for (const active of [false, true]) {
        const response = await manage.fetch(request("PATCH", { userId: studentId, active }), ctx);
        assert.equal(response.status, 200);
        assert.equal(target.active, active);
        assert.equal(target.user_id, studentId);
    }
    assert.equal(calls.filter((call) => call.op === "update").length, 2);
    assert.ok(calls.every((call) => call.table === "profiles"));
    assert.equal((await manage.fetch(request("PATCH", { userId: studentId, active: "false" }), ctx)).status, 400);
});

test("deleting a student with historical records is refused", async () => {
    const { ctx, target, calls } = context({ records: 1 });
    target.active = false;
    const response = await manage.fetch(request("DELETE", { userId: studentId }), ctx);
    assert.equal(response.status, 409);
    assert.ok(!calls.some((call) => call.deleted));
    assert.ok(calls.some((call) => call.table === "clinical_notes"));
});

for (const table of ["referrals", "vital_sign_sets"]) {
    test(`a student with only ${table} history cannot be deleted`, async () => {
        const { ctx, target, calls } = context({ recordsByTable: { [table]: 1 } });
        target.active = false;
        const response = await manage.fetch(request("DELETE", { userId: studentId }), ctx);
        assert.equal(response.status, 409);
        assert.ok(!calls.some((call) => call.deleted));
        assert.equal(target.user_id, studentId);
    });
}
