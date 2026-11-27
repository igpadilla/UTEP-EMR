import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), TEACHER = id(2), ALICE = id(3), BOB = id(4), STUDENT = id(5);
const PATIENT_A = id(10), PATIENT_B = id(11), VISIT = id(20);
const LAB_A = id(30), LAB_B = id(31), PRIVATE_LAB = id(32), IMAGING = id(33), CANCELLED = id(34), CASE_LAB = id(35);

async function as(db, user, sql, params = []) {
    await db.query("select set_config('test.user_id', $1, false)", [user]);
    await db.exec("set role authenticated");
    try { return (await db.query(sql, params)).rows; }
    finally { await db.exec("reset role"); }
}

test("lab sharing refuses an out-of-date database before changing its schema", async () => {
    const db = new PGlite();
    try {
        await db.exec('create table public.diagnostic_results(id uuid primary key)');
        const migration = await readFile(new URL('../supabase/migrations/20261115120000_share_patient_lab_results.sql',import.meta.url),'utf8');
        await assert.rejects(db.exec(migration), /Apply the team audit-log migrations/);
        const { rows } = await db.query("select column_name from information_schema.columns where table_name='diagnostic_results'");
        assert.deepEqual(rows.map((row) => row.column_name), ['id']);
    } finally { await db.close(); }
});

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
            insert into diagnostic_orders(id,patient_id,category,test_code,test_name,coding_system,clinical_code,clinical_indication,status,ordered_by) values
                ('${LAB_A}','${PATIENT_A}','lab','demo','Shared panel','LOINC','demo','Fictional teaching record','completed','${TEACHER}'),
                ('${LAB_B}','${PATIENT_B}','lab','demo','Other patient panel','LOINC','demo','Fictional teaching record','completed','${TEACHER}'),
                ('${PRIVATE_LAB}','${PATIENT_A}','lab','demo','PRIVATE TEST','LOINC','demo','Fictional teaching record','completed','${TEACHER}'),
                ('${IMAGING}','${PATIENT_A}','imaging','demo','Private image','CPT','demo','Fictional teaching record','completed','${TEACHER}'),
                ('${CANCELLED}','${PATIENT_A}','lab','demo','Cancelled panel','LOINC','demo','Fictional teaching record','cancelled','${TEACHER}');
            insert into diagnostic_results(id,order_id,structured_values,report_findings,report_impression,file_path,resulted_by)
                select id,id,'[{"code":"demo","name":"Example value","value":0,"unit":"units","reference_range":"0–1","flag":"normal","internal":"PRIVATE VALUE METADATA"}]',
                    'PRIVATE TECHNICIAN NOTES','PRIVATE INTERPRETATION','private/report.pdf','${TEACHER}'
                from diagnostic_orders;
            insert into patient_templates(id,instructor_id,first_name,last_name,age,chief_complaint)
                values ('${id(40)}','${TEACHER}','Case','Copy',40,'Practice');
            insert into assigned_cases(id,template_id,student_id,assigned_by,course_id,patient_snapshot)
                select '${id(41)}','${id(40)}','${STUDENT}','${TEACHER}',id,'{}' from courses limit 1;
            insert into diagnostic_orders(id,case_id,category,test_code,test_name,coding_system,clinical_code,clinical_indication,status,ordered_by)
                values ('${CASE_LAB}','${id(41)}','lab','demo','Case panel','LOINC','demo','Practice','completed','${TEACHER}');
            insert into diagnostic_results(id,order_id,resulted_by) values ('${CASE_LAB}','${CASE_LAB}','${TEACHER}');
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

        await t.test("only staff release completed live-patient labs; other patients and private reports remain hidden", async () => {
            for (const who of [ALICE, STUDENT]) {
                await assert.rejects(as(db, who, 'select set_diagnostic_result_portal_release($1,true,$2)', [LAB_A,'Public summary']), /Only active staff/);
            }
            for (const resultId of [IMAGING, CANCELLED, CASE_LAB, id(99)]) {
                await assert.rejects(as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,true,$2)', [resultId,'Public summary']), /completed lab result on a patient/);
            }
            await assert.rejects(as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,null,null)', [LAB_A]), /Choose shared or private/);
            await as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,true,$2)', [LAB_A,'Summary explicitly shared by staff']);
            await as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,true,null)', [LAB_B]);
            const alice = await portal(ALICE), bob = await portal(BOB);
            assert.deepEqual(alice.labs.map((lab) => lab.id), [LAB_A]);
            assert.deepEqual(bob.labs.map((lab) => lab.id), [LAB_B]);
            assert.equal(alice.labs[0].values[0].value, '0');
            assert.equal(alice.labs[0].result_note, 'Summary explicitly shared by staff');
            assert.equal(alice.labs[0].values[0].reference_range, '0–1');
            assert.ok(!JSON.stringify(alice).includes('PRIVATE'));
            assert.ok(!JSON.stringify(alice).includes('private/report.pdf'));
            assert.equal((await as(db, ALICE, 'select * from diagnostic_results')).length, 0);
            await as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,false,null)', [LAB_A]);
            assert.deepEqual((await portal(ALICE)).labs, []);
            await db.query("update diagnostic_results set portal_released_at = now() + interval '1 day' where id = $1", [LAB_A]);
            assert.deepEqual((await portal(ALICE)).labs, []);
            await db.query("update diagnostic_results set structured_values = '[]' where id = $1", [LAB_A]);
            await assert.rejects(as(db, TEACHER, 'select set_diagnostic_result_portal_release($1,true,null)', [LAB_A]), /Add lab values or a patient summary/);
            await as(db, ADMIN, 'select set_diagnostic_result_portal_release($1,true,$2)', [LAB_A,'Staff summary without structured values']);
            assert.deepEqual((await portal(ALICE)).labs[0].values, []);
        });

        await t.test("portal reads and staff sharing are audited without storing health details in the audit entry", async () => {
            await portal(ALICE);
            const entries = await as(db, ADMIN, `select * from phi_audit_log where actor_id='${ALICE}' and action='VIEW' and table_name='patient_portal_accounts'`);
            assert.ok(entries.length > 0);
            assert.ok(entries.every((entry) => entry.patient_id === PATIENT_A && entry.record_id === ALICE));
            const sharing = await as(db, ADMIN, `select changed_fields from phi_audit_log where record_id='${LAB_A}' and action='UPDATE'`);
            assert.ok(sharing.some((entry) => entry.changed_fields.includes('portal_released_at')));
            assert.equal((await as(db, ALICE, 'select * from phi_audit_log')).length, 0);
        });

        await t.test("prescription alerts require staff, saved medications and active portal access", async () => {
            const send = (who, patient = PATIENT_A, medication = 'Recorded medicine', pharmacy = 'Demo Pharmacy') =>
                as(db, who, 'select notify_patient_prescription($1,$2,$3)', [patient, medication, pharmacy]);
            const alerts = async (who) => (await as(db, who, 'select get_my_prescription_alerts() as result'))[0].result;
            for (const who of [ALICE, BOB, STUDENT]) await assert.rejects(send(who), /Only active staff/);
            await assert.rejects(send(TEACHER, PATIENT_A, 'Not saved'), /saved medication/);
            await assert.rejects(send(TEACHER, PATIENT_A, 'Recorded medicine', '  '), /pharmacy name/);
            await assert.rejects(send(TEACHER, PATIENT_A, 'Recorded medicine', 'x'.repeat(201)), /pharmacy name/);
            await db.query('update patients set archived_at = now() where id = $1', [PATIENT_A]);
            await assert.rejects(send(TEACHER), /active patient/);
            await db.query('update patients set archived_at = null where id = $1', [PATIENT_A]);
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',false)`);
            await assert.rejects(send(TEACHER), /active portal access/);
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',true)`);
            await send(TEACHER);
            const own = await alerts(ALICE);
            assert.equal(own.length, 1);
            assert.equal(own[0].medication_name, 'Recorded medicine');
            assert.equal(own[0].pharmacy_name, 'Demo Pharmacy');
            assert.equal(own[0].read_at, null);
            assert.deepEqual(Object.keys(own[0]).sort(), ['id','medication_name','pharmacy_name','created_at','read_at'].sort());
            assert.deepEqual(await alerts(BOB), []);
            await assert.rejects(as(db, BOB, 'select read_my_prescription_alert($1)', [own[0].id]), /not available/);
            await assert.rejects(as(db, ALICE, 'select * from patient_prescription_alerts'), /permission denied/);
            await as(db, ALICE, 'select read_my_prescription_alert($1)', [own[0].id]);
            const readAt = (await alerts(ALICE))[0].read_at;
            assert.ok(readAt);
            await as(db, ALICE, 'select read_my_prescription_alert($1)', [own[0].id]);
            assert.equal((await alerts(ALICE))[0].read_at, readAt);
            const audit = await as(db, ADMIN, 'select * from phi_audit_log where table_name = $1 and record_id = $2', ['patient_prescription_alerts', own[0].id]);
            assert.equal(audit.length, 1);
            assert.equal(audit[0].patient_id, PATIENT_A);
            await db.query('update profiles set active=false where user_id=$1', [TEACHER]);
            await assert.rejects(send(TEACHER), /Only active staff/);
            await db.query('update profiles set active=true where user_id=$1', [TEACHER]);
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',false)`);
            await assert.rejects(alerts(ALICE), /not available/);
            await assert.rejects(as(db, ALICE, 'select read_my_prescription_alert($1)', [own[0].id]), /not available/);
            await as(db, ADMIN, `select set_patient_portal_access('${PATIENT_A}',true)`);
            await db.exec('set role anon');
            await assert.rejects(db.query('select get_my_prescription_alerts()'), /permission denied/);
            await db.exec('reset role');
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
