import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const sql = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("migration versions are unique and student changes follow the course migrations", async () => {
    const names = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql"));
    const versions = names.map((name) => name.split("_")[0]);
    assert.equal(new Set(versions).size, versions.length, "Supabase migration timestamps must be unique");
    const courseVersion = "20261020000002";
    for (const name of names.filter((name) => /_(search_student_accounts|enforce_active_course_access|enforce_active_clinical_access)\.sql$/.test(name))) {
        assert.ok(name.split("_")[0] > courseVersion, `${name} must run after the course changes`);
    }
});

test("student directory searches the complete roster before paginating and restricts RPC execution", async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated; create role service_role;
            create schema auth;
            create table auth.users(id uuid primary key, email text);
            create table public.profiles(user_id uuid primary key, first_name text, last_name text,
                active boolean, account_type text, created_at timestamptz);
            insert into auth.users select md5(i::text)::uuid, 'student' || i || '@example.edu' from generate_series(1,60) i;
            insert into public.profiles select id, 'Student', split_part(email, '@', 1),
                row_number() over () % 2 = 0, 'student', '2026-01-01'::timestamptz from auth.users;
            insert into auth.users values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin@example.edu');
            insert into profiles values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Admin','Account',true,'admin',now());
        `);
        await db.exec(await sql("20261020000003_search_student_accounts.sql"));
        const search = async (term = "", status = "all", page = 1) => {
            const { rows } = await db.query("select search_student_accounts($1,$2,$3) as result", [term, status, page]);
            return rows[0].result;
        };
        const first = await search();
        const second = await search("", "all", 2);
        assert.equal(first.total, 60);
        assert.equal(first.students.length, 25);
        assert.ok(second.students.every((s) => !first.students.some((other) => s.user_id === other.user_id)));
        const match = await search("STUDENT60@EXAMPLE.EDU");
        assert.equal(match.total, 1);
        assert.equal(match.students[0].email, "student60@example.edu");
        assert.equal((await search("Student student60")).total, 1);
        assert.equal((await search("", "active")).total, 30);
        assert.equal((await search("", "inactive")).total, 30);
        for (const special of ["%", "_", "' OR 1=1", "admin@example.edu"]) {
            assert.equal((await search(special)).total, 0);
        }
        const last = await search("", "all", 999999);
        assert.equal(last.page, 3);
        assert.equal(last.students.length, 10);
        const empty = await search("nonexistent", "all", 2);
        assert.equal(empty.page, 1);
        assert.equal(empty.students.length, 0);
        await assert.rejects(search("", "invalid"));
        for (const role of ["anon", "authenticated"]) {
            await db.exec(`set role ${role}`);
            await assert.rejects(search(), /permission denied/);
            await db.exec("reset role");
        }
        await db.exec("set role service_role");
        assert.equal((await search()).total, 60);
    } finally {
        await db.close();
    }
});

test("inactive accounts lose database access while their existing records survive reactivation", async () => {
    const db = new PGlite();
    const tables = ["patients", "visits", "appointments", "patient_templates", "assigned_cases", "audit_logs", "courses", "course_enrollments", "clinical_notes", "referrals", "vital_sign_sets"];
    try {
        await db.exec(`
            create role authenticated;
            create schema auth;
            create function auth.uid() returns uuid language sql stable as
                $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
            grant usage on schema auth to authenticated;
            create table profiles(user_id uuid primary key, active boolean);
            insert into profiles values ('11111111-1111-4111-8111-111111111111', true);
        `);
        for (const table of tables) {
            await db.exec(`create table ${table}(id integer primary key);
                insert into ${table} values(1);
                alter table ${table} enable row level security;
                grant select, insert, update on ${table} to authenticated;
                create policy "Existing access" on ${table} for all to authenticated using(true) with check(true);`);
        }
        await db.exec(await sql("20261002212404_enforce_active_accounts.sql"));
        await db.exec(await sql("20261002232000_enforce_active_audit_logs.sql"));
        await db.exec(await sql("20261020000004_enforce_active_course_access.sql"));
        await db.exec(await sql("20261020000005_enforce_active_clinical_access.sql"));
        await db.exec("set test.user_id = '11111111-1111-4111-8111-111111111111'; set role authenticated;");
        for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length, 1);
        await db.exec("reset role; update profiles set active=false; set role authenticated;");
        for (const table of tables) {
            assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, table);
            await assert.rejects(db.exec(`insert into ${table} values(2)`), /row-level security/, table);
        }
        await db.exec("reset role; update profiles set active=true; set role authenticated;");
        for (const table of tables) assert.deepEqual((await db.query(`select * from ${table}`)).rows, [{ id: 1 }], table);
    } finally {
        await db.close();
    }
});
