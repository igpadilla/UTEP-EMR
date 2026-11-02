import test from "node:test";
import assert from "node:assert/strict";
import { parseStudentImport, importStudentRows } from "../frontend/src/lib/studentImport.js";
import { validateStudentAccount } from "../supabase/functions/_shared/student-validation.mjs";

test("account validation rejects malformed JSON values without accepting partial identities", () => {
    for (const invalid of [null, [], 7, { firstName: 8 }, { firstName: " ", lastName: "Smith" }]) {
        assert.throws(() => validateStudentAccount(invalid));
    }
    assert.throws(() => validateStudentAccount({ firstName: "Ana", lastName: "Smith", email: "ana@", password: "123456" }), /email/);
    assert.deepEqual(validateStudentAccount({ firstName: " Ana ", lastName: " Smith ", email: " ANA@EXAMPLE.EDU ", password: " secret " }), {
        firstName: "Ana", lastName: "Smith", email: "ana@example.edu", password: " secret ",
    });
});

test("CSV handles optional BOM header, quoted fields, CRLF, and blank lines", () => {
    const input = '\uFEFFFull Name, Email, Course Number, CRN\r\n\r\n"Ana Maria Smith", ANA@EXAMPLE.EDU, "PHARM 4301", 00123\r\n';
    const { rows, errors } = parseStudentImport(input);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowNumber, 3);
    assert.equal(rows[0].lastName, "Maria Smith");
    assert.equal(rows[0].email, "ana@example.edu");
    assert.equal(rows[0].crn, "00123");
});

test("CSV reports malformed first rows instead of guessing that they are headers", () => {
    const { errors } = parseStudentImport("Ana Smith,invalid,PHARM 4301,123\nJohn Doe,john@example.edu,PHARM 4301");
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Row 1.*email/);
    assert.match(errors[1], /Row 2.*4 columns/);
    assert.match(parseStudentImport('"Ana Smith,ana@example.edu,P,1').errors[0], /Unclosed/);
    assert.match(parseStudentImport("Full Name,Email,Course Number,CRN").errors[0], /no student rows/);
});

test("CSV rejects duplicate emails, missing names, and missing course data", () => {
    const { errors } = parseStudentImport("Ana Smith,ana@example.edu,P,1\nAna Smith,ANA@example.edu,P,2\nCher,cher@example.edu,P,1\nJohn Doe,john@example.edu,,1");
    assert.equal(errors.length, 3);
    assert.match(errors[0], /Row 2.*row 1/);
    assert.match(errors[1], /Row 3.*names/);
    assert.match(errors[2], /Row 4.*Course/);
});

test("partial enrollment failure retains credentials, continues other rows, and retries without recreating accounts", async () => {
    const { rows } = parseStudentImport("Ana Smith,ana@example.edu,P,1\nJohn Doe,john@example.edu,P,1");
    const calls = [];
    let failEnrollment = true;
    const api = {
        createStudent: async ({ email }) => { calls.push(["create", email]); return { id: email }; },
        enrollStudent: async (id) => {
            calls.push(["enroll", id]);
            if (id.startsWith("ana") && failEnrollment) throw new Error("Course service unavailable");
        },
    };
    const first = await importStudentRows(rows, api);
    assert.equal(first[0].status, "enrollment_failed");
    assert.ok(first[0].password);
    assert.equal(first[1].status, "completed");
    const password = first[0].password;
    failEnrollment = false;
    const next = await importStudentRows(first, api);
    assert.ok(next.every((row) => row.status === "completed"));
    assert.equal(next[0].password, password);
    assert.equal(calls.filter(([type]) => type === "create").length, 2);
    assert.equal(calls.filter(([type, id]) => type === "enroll" && id.startsWith("john")).length, 1);
});

test("an account-creation error is not reported as a created account or enrolled", async () => {
    const { rows } = parseStudentImport("Ana Smith,ana@example.edu,P,1");
    const results = await importStudentRows(rows, {
        createStudent: async () => { throw new Error("That email is already in use."); },
        enrollStudent: async () => assert.fail("Should not enroll without an account ID"),
    });
    assert.equal(results[0].status, "creation_failed");
    assert.equal(results[0].studentId, undefined);
    assert.equal(results[0].password, undefined);
    assert.match(results[0].error, /already in use/);
});
