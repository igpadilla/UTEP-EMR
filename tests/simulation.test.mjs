// Simulation feature: RPC transitions, RLS access control, and event logging.
// Covers spec §4 (RPCs) and §5 (RLS) for the first commit scope.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);

// Fixed UUIDs
const INSTRUCTOR = "aa000000-0000-4000-8000-000000000001";
const OTHER_INSTR = "aa000000-0000-4000-8000-000000000002";
const FRONT_DESK = "aa000000-0000-4000-8000-000000000003";
const MED_A = "aa000000-0000-4000-8000-000000000004";
const MED_B = "aa000000-0000-4000-8000-000000000005";
const ACTOR = "aa000000-0000-4000-8000-000000000006";
const OBSERVER = "aa000000-0000-4000-8000-000000000007";
const OUTSIDER = "aa000000-0000-4000-8000-000000000008"; // enrolled in course but not in sim
const OTHER_FRONT = "aa000000-0000-4000-8000-000000000009"; // front_desk in a different sim
const COURSE = "bb000000-0000-4000-8000-000000000001";
const OTHER_COURSE = "bb000000-0000-4000-8000-000000000002";
const TEMPLATE_1 = "cc000000-0000-4000-8000-000000000001";
const TEMPLATE_2 = "cc000000-0000-4000-8000-000000000002";
const TEMPLATE_3 = "cc000000-0000-4000-8000-000000000003";

async function setup() {
    const db = new PGlite();
    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;
        create table auth.users (id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
        grant usage on schema auth, public to authenticated;
        grant execute on function auth.uid() to authenticated;
        alter default privileges in schema public grant all on tables to authenticated;
    `);

    const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith(".sql")).sort();
    for (const file of files) {
        await db.exec(await readFile(new URL(file, MIGRATIONS), "utf8"));
    }

    // Users
    await db.exec(`
        insert into auth.users values
            ('${INSTRUCTOR}',  'instr@x'),
            ('${OTHER_INSTR}', 'other@x'),
            ('${FRONT_DESK}',  'fd@x'),
            ('${MED_A}',       'ma@x'),
            ('${MED_B}',       'mb@x'),
            ('${ACTOR}',       'ac@x'),
            ('${OBSERVER}',    'ob@x'),
            ('${OUTSIDER}',    'out@x'),
            ('${OTHER_FRONT}', 'of@x');

        update profiles set account_type = 'instructor', active = true
            where user_id in ('${INSTRUCTOR}', '${OTHER_INSTR}');

        -- Students
        insert into courses (id, instructor_id, course_number, crn, discipline)
            values ('${COURSE}', '${INSTRUCTOR}', 'SIM 1', '1', 'nursing');
        insert into courses (id, instructor_id, course_number, crn, discipline)
            values ('${OTHER_COURSE}', '${OTHER_INSTR}', 'SIM 2', '2', 'nursing');

        insert into course_enrollments (course_id, student_id, enrolled_by) values
            ('${COURSE}', '${FRONT_DESK}', '${INSTRUCTOR}'),
            ('${COURSE}', '${MED_A}',      '${INSTRUCTOR}'),
            ('${COURSE}', '${MED_B}',      '${INSTRUCTOR}'),
            ('${COURSE}', '${ACTOR}',      '${INSTRUCTOR}'),
            ('${COURSE}', '${OBSERVER}',   '${INSTRUCTOR}'),
            ('${COURSE}', '${OUTSIDER}',   '${INSTRUCTOR}');

        insert into patient_templates (id, instructor_id, first_name, last_name, age, chief_complaint) values
            ('${TEMPLATE_1}', '${INSTRUCTOR}', 'Alice', 'A', 30, 'cough'),
            ('${TEMPLATE_2}', '${INSTRUCTOR}', 'Bob',   'B', 40, 'pain'),
            ('${TEMPLATE_3}', '${INSTRUCTOR}', 'Carol', 'C', 50, 'fever');
    `);

    return db;
}

// Run SQL as a signed-in user; returns rows or throws.
async function as(db, userId, sql) {
    await db.exec(`set test.user_id = '${userId}'; set role authenticated;`);
    try {
        return (await db.query(sql)).rows;
    } finally {
        await db.exec("reset role;");
    }
}

// Helper: call an RPC as a user.
async function rpc(db, userId, fn, ...args) {
    const argList = args.map(a =>
        a === null ? "null"
            : typeof a === "number" ? String(a)
                : typeof a === "object" ? `'${JSON.stringify(a)}'::jsonb`
                    : `'${a}'`
    ).join(", ");
    return as(db, userId, `select ${fn}(${argList})`);
}

// ── Happy path ────────────────────────────────────────────────────────────────

test("happy path: create → participants → encounters → start → check_in → stop", async () => {
    const db = await setup();
    try {
        // create
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation",
            COURSE, "Test Sim", "standard", "timer", 30
        );
        assert.ok(simId, "should return a sim id");

        // set participants
        const participants = [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: MED_B, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
            { user_id: OBSERVER, sim_role: "observer" },
        ];
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, participants);

        // set encounters
        const encounters = [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
            { template_id: TEMPLATE_2, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:15" },
            { template_id: TEMPLATE_3, patient_actor_id: ACTOR, assigned_med_id: MED_B, arrival_type: "scheduled", scheduled_time: "09:30" },
        ];
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, encounters);

        // start
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);
        const [sim] = (await db.query(`select status, started_at from simulations where id = '${simId}'`)).rows;
        assert.equal(sim.status, "active");
        assert.ok(sim.started_at, "started_at set");

        // check in one encounter (as front desk)
        const [enc] = (await db.query(
            `select id, status from simulation_encounters where simulation_id = '${simId}' order by scheduled_time limit 1`
        )).rows;
        assert.equal(enc.status, "expected");

        await rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id);
        const [updated] = (await db.query(
            `select status, checked_in_at, checked_in_by from simulation_encounters where id = '${enc.id}'`
        )).rows;
        assert.equal(updated.status, "checked_in");
        assert.ok(updated.checked_in_at);
        assert.equal(updated.checked_in_by, FRONT_DESK);

        // stop
        await rpc(db, INSTRUCTOR, "public.stop_simulation", simId);
        const [stopped] = (await db.query(`select status, end_reason from simulations where id = '${simId}'`)).rows;
        assert.equal(stopped.status, "ended");
        assert.equal(stopped.end_reason, "stopped");
    } finally {
        await db.close();
    }
});

// ── simulation_events written for each transition ─────────────────────────────

test("simulation_events written for each transition", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Events Test", "standard", "workflow", null
        );

        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);

        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);

        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;
        await rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id);
        await rpc(db, INSTRUCTOR, "public.stop_simulation", simId);

        const events = (await db.query(
            `select event_type from simulation_events where simulation_id = '${simId}' order by id`
        )).rows.map(r => r.event_type);

        assert.ok(events.includes("sim_created"), "sim_created event");
        assert.ok(events.includes("participants_set"), "participants_set event");
        assert.ok(events.includes("encounters_set"), "encounters_set event");
        assert.ok(events.includes("sim_started"), "sim_started event");
        assert.ok(events.includes("checked_in"), "checked_in event");
        assert.ok(events.includes("sim_ended"), "sim_ended event");
    } finally {
        await db.close();
    }
});

// ── start rejections ──────────────────────────────────────────────────────────

test("start rejected: no encounters", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "No Enc", "standard", "workflow", null
        );
        await assert.rejects(
            rpc(db, INSTRUCTOR, "public.start_simulation", simId),
            /at least one encounter/
        );
    } finally {
        await db.close();
    }
});

test("start rejected: encounter missing actor or med", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Missing Roles", "standard", "workflow", null
        );
        // Insert participants (need med to be valid for set_sim_encounters)
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);

        // Directly null out patient_actor_id to simulate missing actor (bypass RPC validation)
        await db.exec(`update simulation_encounters set patient_actor_id = null where simulation_id = '${simId}'`);
        await assert.rejects(
            rpc(db, INSTRUCTOR, "public.start_simulation", simId),
            /patient actor and a med student/
        );
    } finally {
        await db.close();
    }
});

test("setup RPCs rejected once simulation is active", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Lock Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        await assert.rejects(
            rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, []),
            /locked once the simulation starts/
        );
        await assert.rejects(
            rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, []),
            /locked once the simulation starts/
        );
        await assert.rejects(
            rpc(db, INSTRUCTOR, "public.start_simulation", simId),
            /draft status/
        );
    } finally {
        await db.close();
    }
});

// ── check_in_encounter rejections ─────────────────────────────────────────────

test("check_in rejected: caller is not front_desk in that sim", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Reject Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        // Med student trying to check in
        await assert.rejects(
            rpc(db, MED_A, "public.check_in_encounter", enc.id),
            /front desk participants/
        );
        // Observer trying to check in
        await assert.rejects(
            rpc(db, OBSERVER, "public.check_in_encounter", enc.id),
            /front desk participants/
        );
        // Non-participant trying to check in
        await assert.rejects(
            rpc(db, OUTSIDER, "public.check_in_encounter", enc.id),
            /front desk participants/
        );
    } finally {
        await db.close();
    }
});

test("check_in rejected: front_desk from a different sim", async () => {
    const db = await setup();
    try {
        // Build sim 1 (INSTRUCTOR owns it, FRONT_DESK is front_desk)
        const [{ create_simulation: sim1 }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Sim 1", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", sim1, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", sim1, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", sim1);

        // Build sim 2 (OTHER_INSTR owns it, OTHER_FRONT is front_desk there)
        await db.exec(`insert into course_enrollments (course_id, student_id, enrolled_by) values ('${OTHER_COURSE}', '${OTHER_FRONT}', '${OTHER_INSTR}') on conflict do nothing`);
        await db.exec(`insert into course_enrollments (course_id, student_id, enrolled_by) values ('${OTHER_COURSE}', '${MED_B}', '${OTHER_INSTR}') on conflict do nothing`);
        await db.exec(`insert into course_enrollments (course_id, student_id, enrolled_by) values ('${OTHER_COURSE}', '${ACTOR}', '${OTHER_INSTR}') on conflict do nothing`);

        const [{ create_simulation: sim2 }] = await rpc(
            db, OTHER_INSTR, "public.create_simulation", OTHER_COURSE, "Sim 2", "standard", "workflow", null
        );
        await rpc(db, OTHER_INSTR, "public.set_sim_participants", sim2, [
            { user_id: OTHER_FRONT, sim_role: "front_desk" },
            { user_id: MED_B, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, OTHER_INSTR, "public.set_sim_encounters", sim2, [
            { template_id: TEMPLATE_2, patient_actor_id: ACTOR, assigned_med_id: MED_B, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, OTHER_INSTR, "public.start_simulation", sim2);

        // Get an encounter from sim 1
        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${sim1}'`
        )).rows;

        // OTHER_FRONT is front_desk in sim 2, not sim 1 — must be rejected
        await assert.rejects(
            rpc(db, OTHER_FRONT, "public.check_in_encounter", enc.id),
            /front desk participants/
        );
    } finally {
        await db.close();
    }
});

test("check_in rejected: wrong status", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Status Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        // Check in once — OK
        await rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id);

        // Check in again — wrong status
        await assert.rejects(
            rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id),
            /current status/
        );
    } finally {
        await db.close();
    }
});

test("check_in rejected: sim is not active (draft)", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Draft Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        // Do NOT start — still draft

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        await assert.rejects(
            rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id),
            /not active/
        );
    } finally {
        await db.close();
    }
});

test("check_in rejected: inactive account", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Inactive Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        // Deactivate front desk account
        await db.exec(`update profiles set active = false where user_id = '${FRONT_DESK}'`);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        await assert.rejects(
            rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id),
            /inactive/
        );
    } finally {
        await db.close();
    }
});

// ── RLS access control ────────────────────────────────────────────────────────

test("RLS: participants see their sim's encounters; non-participants see nothing", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "RLS Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
            { user_id: OBSERVER, sim_role: "observer" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
            { template_id: TEMPLATE_2, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:15" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        // front_desk sees all encounters in the sim
        const fdSees = await as(db, FRONT_DESK, `select id from simulation_encounters where simulation_id = '${simId}'`);
        assert.equal(fdSees.length, 2, "front_desk sees all encounters");

        // med sees all encounters in the sim
        const medSees = await as(db, MED_A, `select id from simulation_encounters where simulation_id = '${simId}'`);
        assert.equal(medSees.length, 2, "med sees all encounters");

        // observer sees all encounters
        const obsSees = await as(db, OBSERVER, `select id from simulation_encounters where simulation_id = '${simId}'`);
        assert.equal(obsSees.length, 2, "observer sees all encounters");

        // patient_actor sees only their own encounter row
        const actorSees = await as(db, ACTOR, `select id from simulation_encounters where simulation_id = '${simId}'`);
        assert.equal(actorSees.length, 2, "actor sees their own encounters (they are actor for both)");

        // Non-participant sees nothing
        const outsiderSees = await as(db, OUTSIDER, `select id from simulation_encounters where simulation_id = '${simId}'`);
        assert.equal(outsiderSees.length, 0, "outsider sees no encounters");
    } finally {
        await db.close();
    }
});

test("RLS: students cannot directly insert/update sim tables", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Direct Write Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        // Student cannot directly update encounter status
        const result = await as(db, FRONT_DESK,
            `update simulation_encounters set status = 'checked_in' where id = '${enc.id}' returning id`
        );
        assert.equal(result.length, 0, "direct update returns 0 rows (blocked by RLS — no permissive insert/update policy)");

        // Student cannot directly insert a simulation
        await assert.rejects(
            as(db, FRONT_DESK,
                `insert into simulations (course_id, instructor_id, title, end_mode)
                 values ('${COURSE}', '${FRONT_DESK}', 'Hacked', 'workflow')`
            ),
            /row-level security/
        );

        // Student cannot directly insert events
        await assert.rejects(
            as(db, FRONT_DESK,
                `insert into simulation_events (simulation_id, actor_id, event_type)
                 values ('${simId}', '${FRONT_DESK}', 'fake_event')`
            ),
            /row-level security/
        );
    } finally {
        await db.close();
    }
});

test("RLS: instructor sees their sim; other instructor sees nothing", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Visibility Test", "standard", "workflow", null
        );

        // INSTRUCTOR can see it
        const mine = await as(db, INSTRUCTOR, `select id from simulations where id = '${simId}'`);
        assert.equal(mine.length, 1);

        // OTHER_INSTR cannot
        const theirs = await as(db, OTHER_INSTR, `select id from simulations where id = '${simId}'`);
        assert.equal(theirs.length, 0);
    } finally {
        await db.close();
    }
});

test("RLS: boards go read-only after stop — events still visible, no new check-ins", async () => {
    const db = await setup();
    try {
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Ended Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);
        await rpc(db, INSTRUCTOR, "public.start_simulation", simId);
        await rpc(db, INSTRUCTOR, "public.stop_simulation", simId);

        const [enc] = (await db.query(
            `select id from simulation_encounters where simulation_id = '${simId}'`
        )).rows;

        // check_in rejected because sim is ended
        await assert.rejects(
            rpc(db, FRONT_DESK, "public.check_in_encounter", enc.id),
            /not active/
        );

        // Events still readable
        const events = await as(db, FRONT_DESK, `select id from simulation_events where simulation_id = '${simId}'`);
        assert.ok(events.length > 0, "events visible after end");
    } finally {
        await db.close();
    }
});

test("RLS: sim participants cannot read hidden template fields; get_sim_patients returns only safe fields", async () => {
    const db = await setup();
    try {
        await db.exec(`update patient_templates set hidden_diagnosis = 'Pneumonia', answer_key = 'Order chest X-ray' where id = '${TEMPLATE_1}'`);
        const [{ create_simulation: simId }] = await rpc(
            db, INSTRUCTOR, "public.create_simulation", COURSE, "Template Leak Test", "standard", "workflow", null
        );
        await rpc(db, INSTRUCTOR, "public.set_sim_participants", simId, [
            { user_id: FRONT_DESK, sim_role: "front_desk" },
            { user_id: MED_A, sim_role: "med", discipline: "nursing" },
            { user_id: ACTOR, sim_role: "patient_actor" },
            { user_id: OBSERVER, sim_role: "observer" },
        ]);
        await rpc(db, INSTRUCTOR, "public.set_sim_encounters", simId, [
            { template_id: TEMPLATE_1, patient_actor_id: ACTOR, assigned_med_id: MED_A, arrival_type: "scheduled", scheduled_time: "09:00" },
        ]);

        // Students in the sim cannot read template rows directly (hidden diagnosis, answer key...)
        for (const user of [FRONT_DESK, MED_A, ACTOR, OBSERVER]) {
            const rows = await as(db, user, `select hidden_diagnosis, answer_key from patient_templates`);
            assert.equal(rows.length, 0, `participant ${user} must not read patient_templates`);
        }

        // get_sim_patients gives participants only the fields the sim screens show
        const [patient, ...rest] = await as(db, MED_A, `select * from public.get_sim_patients('${simId}')`);
        assert.equal(rest.length, 0);
        assert.equal(patient.first_name, "Alice");
        assert.equal(patient.chief_complaint, "cough");
        assert.equal(patient.hidden_diagnosis, undefined);
        assert.equal(patient.answer_key, undefined);

        // The instructor running the sim gets the patients; outsiders get nothing
        assert.equal((await as(db, INSTRUCTOR, `select * from public.get_sim_patients('${simId}')`)).length, 1);
        assert.equal((await as(db, OUTSIDER, `select * from public.get_sim_patients('${simId}')`)).length, 0);
    } finally {
        await db.close();
    }
});

test("get_course_student_emails: only the course's instructor gets the emails", async () => {
    const db = await setup();
    try {
        const owner = await as(db, INSTRUCTOR, `select * from public.get_course_student_emails('${COURSE}')`);
        assert.equal(owner.length, 6, "course instructor sees all enrolled students");
        assert.ok(owner.some((r) => r.email === "fd@x"));

        const otherInstructor = await as(db, OTHER_INSTR, `select * from public.get_course_student_emails('${COURSE}')`);
        assert.equal(otherInstructor.length, 0, "another instructor gets no emails");

        const student = await as(db, MED_A, `select * from public.get_course_student_emails('${COURSE}')`);
        assert.equal(student.length, 0, "a student gets no emails");
    } finally {
        await db.close();
    }
});
