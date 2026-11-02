import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), TEACHER = id(2), ALICE = id(3), BOB = id(4), STUDENT = id(5);
const PATIENT_A = id(10), PATIENT_B = id(11), VISIT = id(20);

async function as(db, user, sql, params = []) {
    await db.query("select set_config('test.user_id', $1, false)", [user]);
    await db.exec("set role authenticated");
    try { return (await db.query(sql, params)).rows; }
    finally { await db.exec("reset role"); }
}

test("patient portal isolates records and exposes only released patient-facing content", async (t) => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create role service_role;
            create schema auth; create table auth.users(id uuid primary key, email text);
            create function auth.uid() returns uuid language sql stable as
                $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
            grant usage on schema auth, public to authenticated;
            grant execute on function auth.uid() to authenticated;
            alter default privileges in schema public grant all on tables to authenticated;
        `);
        const dir = new URL("../supabase/migrations/", import.meta.url);
        for (const name of (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()) {
            await db.exec(await readFile(new URL(name, dir), 'utf8'));
        }
        await db.exec(`insert into auth.users values ('${ADMIN}','admin@example.edu'),('${TEACHER}','teacher@example.edu'),
            ('${ALICE}','alice@example.edu'),('${BOB}','bob@example.edu'),('${STUDENT}','student@example.edu');
            update profiles set account_type = 'admin' where user_id = '${ADMIN}';
            update profiles set account_type = 'instructor' where user_id = '${TEACHER}';
            insert into patients(id,first_name,last_name,age,current_medications) values
                ('${PATIENT_A}','Alice','Demo',30,'[{"medicine":{"name":"Recorded medicine","unit":"mg","secret":"internal"},"dosage":5,"frequency":2,"internal":"private"}]'),
                ('${PATIENT_B}','Bob','Demo',40,'[]');
            select finish_patient_portal_account('${ALICE}','${PATIENT_A}');
            select finish_patient_portal_account('${BOB}','${PATIENT_B}');
            insert into visits(id,patient_id,visit_type,notes,created_at) values
                ('${VISIT}','${PATIENT_A}','Follow-up','INTERNAL NOTES NEVER SHARE','2026-01-02');
            insert into courses(instructor_id,course_number,crn) values ('${TEACHER}','DEMO','1');
            insert into profile_roles(user_id,role_id) select '${ALICE}',role_id from roles where role_name = 'front_desk';
        `);

        const portal = async (who) => (await as(db, who, 'select get_my_patient_portal() as result'))[0].result;
        await t.test("two patient logins cannot see one another's records or internal fields", async () => {
            const alice = await portal(ALICE), bob = await portal(BOB);
            assert.equal(alice.patient.first_name, 'Alice');
            assert.equal(bob.patient.first_name, 'Bob');
            assert.deepEqual(alice.labs, []);
            assert.deepEqual(bob.labs, []);
            assert.equal(alice.last_visit, null);
            assert.equal(alice.medications[0].name, 'Recorded medicine');
            assert.ok(!JSON.stringify(alice).includes('internal'));
            assert.ok(!JSON.stringify(alice).includes('INTERNAL NOTES'));
            for (const table of ['patients','visits','courses','profile_roles','assigned_cases','patient_templates','clinical_notes','referrals','appointments']) {
                assert.equal((await as(db, ALICE, `select * from ${table}`)).length, 0, table);
            }
            await assert.rejects(as(db, ALICE, 'select get_my_patient_portal($1)', [PATIENT_B]), /does not exist/);
        });

        await t.test("portal access stays read-only even with a leftover front desk role", async () => {
            await assert.rejects(as(db, ALICE, `insert into patients(first_name,last_name,age) values ('X','Y',5)`), /row-level security/);
            await assert.rejects(as(db, ALICE, `insert into visits(patient_id,notes) values ('${PATIENT_A}','bad')`), /row-level security/);
            assert.equal((await as(db, ALICE, `update patients set first_name='bad' where id='${PATIENT_A}' returning id`)).length, 0);
            await assert.rejects(as(db, ALICE, `select release_patient_visit_summary('${VISIT}','bad')`), /Only active staff/);
            await assert.rejects(as(db, TEACHER, `select set_patient_portal_access('${PATIENT_A}',false)`), /Only active admins/);
            await assert.rejects(as(db, STUDENT, `select patient_portal_account_status('${PATIENT_A}')`), /Only active admins/);
            await assert.rejects(as(db, ALICE, `select finish_patient_portal_account('${STUDENT}','${PATIENT_B}')`), /permission denied/);
        });

        await t.test("staff explicitly release the summary and the latest released visit wins", async () => {
            await as(db, TEACHER, `select release_patient_visit_summary('${VISIT}','Summary shared with patient')`);
            await db.exec(`insert into visits(patient_id,notes,created_at) values ('${PATIENT_A}','Newer private draft','2026-01-03')`);
            const alice = await portal(ALICE);
            assert.equal(alice.last_visit.summary, 'Summary shared with patient');
            assert.equal((await portal(BOB)).last_visit, null);
            assert.ok(!JSON.stringify(alice).includes('Newer private'));
            await assert.rejects(as(db, TEACHER, `select release_patient_visit_summary('${VISIT}','   ')`), /Enter a visit summary/);
        });

        await t.test("admin deactivation revokes access immediately and reactivation keeps records", async () => {
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',false)`);
            await assert.rejects(portal(ALICE), /not available/);
            assert.equal((await as(db, ADMIN, `select patient_portal_account_status('${PATIENT_A}') as result`))[0].result.active, false);
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',true)`);
            assert.equal((await portal(ALICE)).last_visit.summary, 'Summary shared with patient');
            await assert.rejects(portal(STUDENT), /not available/);
            await assert.rejects(portal(TEACHER), /not available/);
            await db.exec('set role anon');
            await assert.rejects(db.query('select get_my_patient_portal()'), /permission denied/);
            await db.exec('reset role');
        });
    } finally { await db.close(); }
});
