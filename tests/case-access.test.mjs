// Replays every migration into an empty database, then checks who can do what
// on assigned cases as a real signed-in student, instructor, or admin would.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const TEACHER = "00000000-0000-4000-8000-00000000000b";
const OTHER_TEACHER = "00000000-0000-4000-8000-00000000000e";
const NURSE_STUDENT = "00000000-0000-4000-8000-00000000000c";
const PT_STUDENT = "00000000-0000-4000-8000-00000000000d";
const NURSING_COURSE = "30000000-0000-4000-8000-000000000001";
const PT_COURSE = "30000000-0000-4000-8000-000000000002";
const TEMPLATE = "10000000-0000-4000-8000-000000000001";
const NURSE_CASE = "20000000-0000-4000-8000-000000000001";
const PT_CASE = "20000000-0000-4000-8000-000000000002";
const PATIENT = "40000000-0000-4000-8000-000000000001";

async function setup() {
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create table auth.users(id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
        grant usage on schema auth, public to authenticated;
        grant execute on function auth.uid() to authenticated;
        alter default privileges in schema public grant all on tables to authenticated;
    `);
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) await db.exec(await readFile(new URL(file, MIGRATIONS), "utf8"));

    await db.exec(`
        insert into auth.users values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${OTHER_TEACHER}','o@x'),
            ('${NURSE_STUDENT}','n@x'),('${PT_STUDENT}','p@x');
        update profiles set account_type = 'admin' where user_id = '${ADMIN}';
        update profiles set account_type = 'instructor' where user_id in ('${TEACHER}','${OTHER_TEACHER}');
        insert into courses(id, instructor_id, course_number, crn, discipline) values
            ('${NURSING_COURSE}','${TEACHER}','NURS 1','1','nursing'),
            ('${PT_COURSE}','${TEACHER}','PT 1','2','physical_therapy');
        insert into course_enrollments(course_id, student_id, enrolled_by) values
            ('${NURSING_COURSE}','${NURSE_STUDENT}','${ADMIN}'),
            ('${PT_COURSE}','${PT_STUDENT}','${ADMIN}');
        insert into patient_templates(id, instructor_id, first_name, last_name, age, chief_complaint, hidden_diagnosis, traps)
            values ('${TEMPLATE}','${TEACHER}','Maria','G',58,'chest pain','NSTEMI','[{"t":"trap"}]');
        -- Cases an admin assigned before admins lost that right; the course instructor manages them through the course.
        insert into assigned_cases(id, template_id, student_id, assigned_by, course_id, patient_snapshot) values
            ('${NURSE_CASE}','${TEMPLATE}','${NURSE_STUDENT}','${ADMIN}','${NURSING_COURSE}','{"first_name":"Maria","traps":[1],"rubric_criteria":[1]}'),
            ('${PT_CASE}','${TEMPLATE}','${PT_STUDENT}','${ADMIN}','${PT_COURSE}','{"first_name":"Maria"}');
        insert into patients(id, first_name, last_name, age) values ('${PATIENT}','John','Doe',45);
    `);
    return db;
}

// Run one statement as a signed-in user. Returns rows, or throws the database error.
async function as(db, userId, sql) {
    await db.exec(`set test.user_id = '${userId}'; set role authenticated;`);
    try {
        return (await db.query(sql)).rows;
    } finally {
        await db.exec("reset role;");
    }
}

test("students work only on their own open case and cannot grade it", async () => {
    const db = await setup();
    try {
        await as(db, NURSE_STUDENT, `update assigned_cases set encounter_status = 'in progress' where id = '${NURSE_CASE}'`);
        await as(db, NURSE_STUDENT, `update assigned_cases set encounter_notes = 'draft' where id = '${NURSE_CASE}'`);

        await assert.rejects(as(db, NURSE_STUDENT, `update assigned_cases set score = 100 where id = '${NURSE_CASE}'`), /only change their case notes/);
        await assert.rejects(as(db, NURSE_STUDENT, `update assigned_cases set encounter_status = 'completed' where id = '${NURSE_CASE}'`), /start or submit/);

        // The other student cannot see or touch this case.
        assert.equal((await as(db, PT_STUDENT, `update assigned_cases set encounter_notes = 'x' where id = '${NURSE_CASE}' returning id`)).length, 0);

        await as(db, NURSE_STUDENT, `update assigned_cases set encounter_status = 'pending review', encounter_notes = 'final' where id = '${NURSE_CASE}'`);
        await assert.rejects(as(db, NURSE_STUDENT, `update assigned_cases set encounter_notes = 'late edit' where id = '${NURSE_CASE}'`), /submitted/);

        // The course instructor grades it even though the admin assigned it.
        const graded = await as(db, TEACHER, `update assigned_cases set score = 90, encounter_status = 'completed' where id = '${NURSE_CASE}' returning score`);
        assert.equal(Number(graded[0].score), 90);
        assert.equal((await as(db, OTHER_TEACHER, `select id from assigned_cases`)).length, 0);
    } finally {
        await db.close();
    }
});

test("students never see the answer key", async () => {
    const db = await setup();
    try {
        assert.equal((await as(db, NURSE_STUDENT, `select hidden_diagnosis from patient_templates`)).length, 0);
        const [row] = await as(db, NURSE_STUDENT, `select patient_snapshot from assigned_cases where id = '${NURSE_CASE}'`);
        assert.deepEqual(row.patient_snapshot, { first_name: "Maria" });
    } finally {
        await db.close();
    }
});

test("cases go only to enrolled students, one open copy per template", async () => {
    const db = await setup();
    try {
        const assign = (student, course) => as(db, TEACHER, `insert into assigned_cases(template_id, student_id, assigned_by, course_id)
            values ('${TEMPLATE}','${student}','${TEACHER}','${course}') returning id`);
        await assert.rejects(assign(PT_STUDENT, NURSING_COURSE), /row-level security/);   // not enrolled there
        await assert.rejects(assign(NURSE_STUDENT, NURSING_COURSE), /row-level security/); // already has this case
        await db.exec(`update assigned_cases set is_archived = true where id = '${NURSE_CASE}'`);
        assert.equal((await assign(NURSE_STUDENT, NURSING_COURSE)).length, 1);
        await assert.rejects(as(db, OTHER_TEACHER, `insert into assigned_cases(template_id, student_id, assigned_by, course_id)
            values ('${TEMPLATE}','${PT_STUDENT}','${OTHER_TEACHER}','${PT_COURSE}')`), /row-level security/);
    } finally {
        await db.close();
    }
});

test("vitals follow the case's course discipline, not a global role", async () => {
    const db = await setup();
    try {
        const record = (student, caseId) => as(db, student,
            `insert into vital_sign_sets(assigned_case_id, heart_rate) values ('${caseId}', 80) returning id`);
        // Neither student has a profile_roles row; the Nursing course grants vitals.write, PT does not.
        assert.equal((await record(NURSE_STUDENT, NURSE_CASE)).length, 1);
        await assert.rejects(record(PT_STUDENT, PT_CASE), /row-level security/);
        await assert.rejects(record(PT_STUDENT, NURSE_CASE), /row-level security/);
        assert.equal((await as(db, TEACHER, `select id from vital_sign_sets`)).length, 1);
        assert.equal((await as(db, PT_STUDENT, `select id from vital_sign_sets`)).length, 0);

        // Vitals close when the case is submitted and open again when the instructor returns it.
        await db.exec(`set test.user_id = ''; update assigned_cases set encounter_status = 'pending review' where id = '${NURSE_CASE}'`); // as the system, not a signed-in user
        await assert.rejects(record(NURSE_STUDENT, NURSE_CASE), /row-level security/);
        await db.exec(`set test.user_id = ''; update assigned_cases set encounter_status = 'revision_requested' where id = '${NURSE_CASE}'`); // as the system, not a signed-in user
        assert.equal((await record(NURSE_STUDENT, NURSE_CASE)).length, 1);
    } finally {
        await db.close();
    }
});

test("live patients, referrals and audit logs are scoped", async () => {
    const db = await setup();
    try {
        assert.equal((await as(db, NURSE_STUDENT, `select id from patients`)).length, 0);
        assert.equal((await as(db, TEACHER, `select id from patients`)).length, 1);
        await assert.rejects(as(db, NURSE_STUDENT, `insert into visits(patient_id, created_by) values ('${PATIENT}','${NURSE_STUDENT}')`), /row-level security/);
        await assert.rejects(as(db, TEACHER, `insert into visits(patient_id, created_by) values ('${PATIENT}','${ADMIN}')`), /row-level security/);
        assert.equal((await as(db, TEACHER, `insert into visits(patient_id, created_by) values ('${PATIENT}','${TEACHER}') returning id`)).length, 1);

        await as(db, NURSE_STUDENT, `insert into referrals(case_id, referring_user_id, target_discipline, reason)
            values ('${NURSE_CASE}','${NURSE_STUDENT}','pharmacy','meds')`);
        assert.equal((await as(db, PT_STUDENT, `select id from referrals`)).length, 0);
        assert.equal((await as(db, PT_STUDENT, `update referrals set status = 'cancelled' returning id`)).length, 0);
        assert.equal((await as(db, TEACHER, `select id from referrals`)).length, 1);

        await as(db, NURSE_STUDENT, `insert into audit_logs(case_id, actor_id, action_type) values ('${NURSE_CASE}','${NURSE_STUDENT}','NOTES_SAVED')`);
        await assert.rejects(as(db, NURSE_STUDENT, `insert into audit_logs(case_id, actor_id, action_type)
            values ('${NURSE_CASE}','${NURSE_STUDENT}','CASE_SIGNED_OFF')`), /row-level security/);
        await as(db, TEACHER, `insert into audit_logs(case_id, actor_id, action_type) values ('${NURSE_CASE}','${TEACHER}','CASE_SIGNED_OFF')`);
    } finally {
        await db.close();
    }
});

test("clinical notes: student drafts and submits, instructor finalizes", async () => {
    const db = await setup();
    try {
        const [note] = await as(db, NURSE_STUDENT, `insert into clinical_notes(assigned_case_id, author_id, discipline, note_type)
            values ('${NURSE_CASE}','${NURSE_STUDENT}','nursing','admission') returning note_id`);
        const id = note.note_id;
        await assert.rejects(as(db, NURSE_STUDENT, `update clinical_notes set status = 'final' where note_id = '${id}'`), /row-level security/);
        await as(db, NURSE_STUDENT, `update clinical_notes set status = 'pending_review' where note_id = '${id}'`);
        assert.equal((await as(db, NURSE_STUDENT, `update clinical_notes set note_data = '{"x":1}' where note_id = '${id}' returning note_id`)).length, 0);
        assert.equal((await as(db, PT_STUDENT, `select note_id from clinical_notes`)).length, 0);
        assert.equal((await as(db, TEACHER, `update clinical_notes set status = 'final', reviewed_by = '${TEACHER}' where note_id = '${id}' returning status`))[0].status, "final");
    } finally {
        await db.close();
    }
});

test("enrollments belong to the course owner", async () => {
    const db = await setup();
    try {
        // The admin enrolled these students; the course owner still sees them.
        assert.equal((await as(db, TEACHER, `select id from course_enrollments`)).length, 2);
        assert.equal((await as(db, OTHER_TEACHER, `select id from course_enrollments`)).length, 0);
        await assert.rejects(as(db, OTHER_TEACHER, `insert into course_enrollments(course_id, student_id, enrolled_by)
            values ('${NURSING_COURSE}','${PT_STUDENT}','${OTHER_TEACHER}')`), /row-level security/);
    } finally {
        await db.close();
    }
});

test("only instructors create and manage cases and templates", async () => {
    const db = await setup();
    try {
        await assert.rejects(as(db, ADMIN, `insert into assigned_cases(template_id, student_id, assigned_by, course_id)
            values ('${TEMPLATE}','${PT_STUDENT}','${ADMIN}','${PT_COURSE}')`), /row-level security/);
        assert.equal((await as(db, ADMIN, `select id from assigned_cases`)).length, 0);
        assert.equal((await as(db, ADMIN, `update assigned_cases set is_archived = true returning id`)).length, 0);
        assert.equal((await as(db, ADMIN, `select id from patient_templates`)).length, 0);
        assert.equal((await as(db, NURSE_STUDENT, `select id from patient_templates`)).length, 0);

        await assert.rejects(as(db, ADMIN, `insert into patient_templates(instructor_id, first_name, last_name, age, chief_complaint)
            values ('${ADMIN}','A','B',30,'x')`), /row-level security/);
        // The course instructor still sees and manages the case the admin assigned earlier.
        assert.equal((await as(db, TEACHER, `select id from assigned_cases`)).length, 2);
        // A course owner reads the template behind a case in their course even though
        // another instructor built it, so grading keeps the rubric and traps.
        assert.equal((await as(db, OTHER_TEACHER, `select id from patient_templates`)).length, 0);
        const OTHER_COURSE = "30000000-0000-4000-8000-000000000009";
        await db.exec(`
            set test.user_id = '';
            insert into courses(id, instructor_id, course_number, crn, discipline)
                values ('${OTHER_COURSE}','${OTHER_TEACHER}','NURS 9','9','nursing');
            update assigned_cases set course_id = '${OTHER_COURSE}' where id = '${NURSE_CASE}';
        `);
        const [tpl] = await as(db, OTHER_TEACHER, `select traps, rubric_criteria from patient_templates where id = '${TEMPLATE}'`);
        assert.ok(tpl.traps);
    } finally {
        await db.close();
    }
});

test("front desk and biller keep Patient Lookup; clinical students do not", async () => {
    const db = await setup();
    try {
        const FRONT = "00000000-0000-4000-8000-0000000000f1";
        const BILLER = "00000000-0000-4000-8000-0000000000f2";
        const BILLING_COURSE = "30000000-0000-4000-8000-000000000003";
        await db.exec(`
            insert into auth.users values ('${FRONT}','f@x'),('${BILLER}','b@x');
            -- Front desk through the student's profile role, biller through the course discipline.
            insert into profile_roles(user_id, role_id) select '${FRONT}', role_id from roles where role_name = 'front_desk';
            insert into courses(id, instructor_id, course_number, crn, discipline)
                values ('${BILLING_COURSE}','${OTHER_TEACHER}','BILL 1','3','biller');
            insert into course_enrollments(course_id, student_id, enrolled_by) values ('${BILLING_COURSE}','${BILLER}','${ADMIN}');
        `);
        const access = async (user) => (await as(db, user, `select public.my_live_patient_access() as a`))[0].a;
        assert.deepEqual(await access(FRONT), { read: true, register: true, schedule: true, checkIn: true });
        // A biller reads; the app hides the buttons they cannot use.
        assert.deepEqual(await access(BILLER), { read: true, register: false, schedule: false, checkIn: false });
        assert.deepEqual(await access(TEACHER), { read: true, register: true, schedule: true, checkIn: true });
        assert.deepEqual(await access(ADMIN), { read: true, register: true, schedule: true, checkIn: true });
        assert.deepEqual(await access(NURSE_STUDENT), { read: false, register: false, schedule: false, checkIn: false });

        // Front desk schedules and checks in.
        assert.equal((await as(db, FRONT, `select id from patients`)).length, 1);
        await as(db, FRONT, `insert into appointments(patient_id, scheduled_date) values ('${PATIENT}', current_date)`);
        await as(db, FRONT, `insert into visits(patient_id) values ('${PATIENT}')`);

        // Biller reads patients and visits but changes nothing.
        assert.equal((await as(db, BILLER, `select id from patients`)).length, 1);
        assert.equal((await as(db, BILLER, `select id from visits`)).length, 1);
        await assert.rejects(as(db, BILLER, `insert into visits(patient_id) values ('${PATIENT}')`), /row-level security/);
        await assert.rejects(as(db, BILLER, `insert into appointments(patient_id, scheduled_date) values ('${PATIENT}', current_date)`), /row-level security/);
        await assert.rejects(as(db, BILLER, `insert into patients(first_name, last_name, age) values ('C','D',40)`), /row-level security/);
        assert.equal((await as(db, BILLER, `select id from appointments`)).length, 0);

        // Front desk registers a patient; the biller sees it and still cannot add one.
        assert.equal((await as(db, FRONT, `insert into patients(first_name, last_name, age) values ('A','B',30) returning id`)).length, 1);
        assert.equal((await as(db, BILLER, `select id from patients`)).length, 2);

        // Nursing students still see nothing.
        assert.equal((await as(db, NURSE_STUDENT, `select id from visits`)).length, 0);
        assert.equal((await as(db, NURSE_STUDENT, `select id from appointments`)).length, 0);
    } finally {
        await db.close();
    }
});

test("a case built from a patient snapshots the whole chart into the student's case", async () => {
    const db = await setup();
    const CHART_TEMPLATE = "10000000-0000-4000-8000-000000000002";
    const CHART_CASE = "20000000-0000-4000-8000-000000000003";
    try {
        // The instructor builds the patient's chart: allergies, then two readings, one later marked as an error.
        await db.exec(`update patients set allergies = '{penicillin}', current_medications = '[{"name":"Metformin"}]' where id = '${PATIENT}'`);
        await as(db, TEACHER, `insert into vital_sign_sets(patient_id, systolic_bp, diastolic_bp, heart_rate, measured_at)
            values ('${PATIENT}', 158, 94, 88, now() - interval '1 day'), ('${PATIENT}', 150, 90, 84, now())`);
        await as(db, TEACHER, `insert into vital_sign_sets(patient_id, heart_rate) values ('${PATIENT}', 200)`);
        await as(db, TEACHER, `update vital_sign_sets set status = 'entered_in_error', correction_reason = 'typo' where heart_rate = 200`);

        await as(db, TEACHER, `insert into patient_templates(id, instructor_id, first_name, last_name, age, chief_complaint, patient_id)
            values ('${CHART_TEMPLATE}','${TEACHER}','John','Doe',45,'headache','${PATIENT}')`);
        await as(db, TEACHER, `insert into assigned_cases(id, template_id, student_id, assigned_by, course_id, patient_snapshot)
            values ('${CHART_CASE}','${CHART_TEMPLATE}','${NURSE_STUDENT}','${TEACHER}','${NURSING_COURSE}','{"first_name":"Old copy","chief_complaint":"headache"}')`);

        // The record comes from the chart as it is now, and the case's own fields are kept.
        const [{ patient_snapshot: snap }] = await as(db, NURSE_STUDENT, `select patient_snapshot from assigned_cases where id = '${CHART_CASE}'`);
        assert.equal(snap.first_name, "John");
        assert.equal(snap.last_name, "Doe");
        assert.deepEqual(snap.allergies, ["penicillin"]);
        assert.deepEqual(snap.current_medications, [{ name: "Metformin" }]);
        assert.equal(snap.chief_complaint, "headache");
        assert.equal(snap.id, undefined);

        // The student sees both current readings on their own case, as baseline rows; the error is not copied.
        const copied = await as(db, NURSE_STUDENT, `select source, systolic_bp, recorded_by from current_vital_sign_sets
            where assigned_case_id = '${CHART_CASE}' order by measured_at`);
        assert.deepEqual(copied.map((v) => [v.source, v.systolic_bp]), [["baseline", 158], ["baseline", 150]]);
        assert.ok(copied.every((v) => v.recorded_by === TEACHER));

        // Baseline rows are the instructor's: the student cannot remove them, and they are not logged as the student's work.
        assert.equal((await as(db, NURSE_STUDENT, `update vital_sign_sets set status = 'entered_in_error', correction_reason = 'x'
            where assigned_case_id = '${CHART_CASE}' returning id`)).length, 0);
        assert.equal((await db.query(`select 1 from audit_logs where case_id = '${CHART_CASE}' and action_type like 'VITALS%'`)).rows.length, 0);

        // Later chart edits do not change the case that was already assigned.
        await as(db, TEACHER, `insert into vital_sign_sets(patient_id, systolic_bp) values ('${PATIENT}', 120)`);
        await db.exec(`update patients set allergies = '{sulfa}' where id = '${PATIENT}'`);
        assert.equal((await db.query(`select 1 from vital_sign_sets where assigned_case_id = '${CHART_CASE}'`)).rows.length, 2);
        assert.deepEqual((await db.query(`select patient_snapshot->'allergies' a from assigned_cases where id = '${CHART_CASE}'`)).rows[0].a, ["penicillin"]);

        // Older templates with no patient keep the snapshot they were given and copy no vitals.
        assert.equal((await db.query(`select 1 from vital_sign_sets where assigned_case_id in ('${NURSE_CASE}','${PT_CASE}')`)).rows.length, 0);
        assert.equal((await db.query(`select patient_snapshot->>'first_name' f from assigned_cases where id = '${PT_CASE}'`)).rows[0].f, "Maria");

        // A patient that a template is built from cannot be deleted out from under it.
        await db.exec(`insert into patients(id, first_name, last_name, age) values ('40000000-0000-4000-8000-000000000002','Ana','Ruiz',30);
            update patient_templates set patient_id = '40000000-0000-4000-8000-000000000002' where id = '${TEMPLATE}'`);
        await assert.rejects(db.query(`delete from patients where id = '40000000-0000-4000-8000-000000000002'`), /patient_templates_patient_id_fkey/);
    } finally {
        await db.close();
    }
});

test("referrals on a patient's chart are copied into a case built from that patient", async () => {
    const db = await setup();
    const REF_TEMPLATE = "10000000-0000-4000-8000-000000000003";
    const REF_CASE = "20000000-0000-4000-8000-000000000004";
    try {
        // The instructor records two referrals on the chart; one is already accepted.
        await as(db, TEACHER, `insert into referrals(patient_id, referring_user_id, target_discipline, priority, status, reason, notes)
            values ('${PATIENT}', '${TEACHER}', 'Physical Therapy', 'urgent', 'pending', 'gait training', 'uses a cane'),
                   ('${PATIENT}', '${TEACHER}', 'Pharmacy', 'routine', 'accepted', 'med review', null)`);

        await as(db, TEACHER, `insert into patient_templates(id, instructor_id, first_name, last_name, age, chief_complaint, patient_id)
            values ('${REF_TEMPLATE}','${TEACHER}','John','Doe',45,'headache','${PATIENT}')`);
        await as(db, TEACHER, `insert into assigned_cases(id, template_id, student_id, assigned_by, course_id, patient_snapshot)
            values ('${REF_CASE}','${REF_TEMPLATE}','${NURSE_STUDENT}','${TEACHER}','${NURSING_COURSE}','{"chief_complaint":"headache"}')`);

        // The student sees both on their own case, as they stood on the chart.
        const copied = await as(db, NURSE_STUDENT, `select target_discipline, priority, status, reason, notes from referrals
            where case_id = '${REF_CASE}' order by target_discipline`);
        assert.deepEqual(copied.map((r) => [r.target_discipline, r.priority, r.status, r.reason, r.notes]), [
            ["Pharmacy", "routine", "accepted", "med review", null],
            ["Physical Therapy", "urgent", "pending", "gait training", "uses a cane"],
        ]);

        // The chart's own referrals are untouched, and later chart changes do not reach the case.
        await as(db, TEACHER, `insert into referrals(patient_id, referring_user_id, target_discipline, reason)
            values ('${PATIENT}', '${TEACHER}', 'Nursing', 'wound care')`);
        assert.equal((await db.query(`select 1 from referrals where case_id = '${REF_CASE}'`)).rows.length, 2);
        assert.equal((await db.query(`select 1 from referrals where patient_id = '${PATIENT}'`)).rows.length, 3);

        // Older templates with no patient copy nothing.
        assert.equal((await db.query(`select 1 from referrals where case_id in ('${NURSE_CASE}','${PT_CASE}')`)).rows.length, 0);
    } finally {
        await db.close();
    }
});
