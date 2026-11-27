import { validateStudentIdentity, validateStudentEmail } from "../../../supabase/functions/_shared/student-validation.mjs";

// Parse quoted fields, escaped quotes, CRLF, and line breaks inside quoted fields.
// Keep source line numbers so a bad row can be found in the original roster.
export function readCsv(text) {
    const records = [];
    let fields = [], field = "", quoted = false, closedQuote = false;
    let line = 1, rowLine = 1;
    const pushField = () => { fields.push(field.trim()); field = ""; closedQuote = false; };
    for (let i = 0; i <= text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === undefined) throw new Error(`Row ${rowLine}: Unclosed quoted field.`);
            if (char === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { quoted = false; closedQuote = true; }
            } else {
                field += char;
                if (char === "\n") line++;
            }
        } else if (char === ",") {
            pushField();
        } else if (char === "\n" || char === undefined) {
            pushField();
            if (fields.some(Boolean)) records.push({ fields, rowNumber: rowLine });
            fields = [];
            rowLine = ++line;
        } else if (char === '"') {
            if (field.trim() || closedQuote) throw new Error(`Row ${rowLine}: Unexpected quote in CSV data.`);
            field = "";
            quoted = true;
        } else {
            if (closedQuote && char.trim()) throw new Error(`Row ${rowLine}: Unexpected text after a quoted field.`);
            field += char;
        }
    }
    return records;
}

export function parseStudentImport(text) {
    let records;
    try {
        records = readCsv(text.replace(/^\uFEFF/, ""));
    } catch (error) {
        return { rows: [], errors: [error.message] };
    }
    if (!records.length) return { rows: [], errors: ["Enter at least one student row."] };
    const header = records[0].fields.map((value) => value.toLowerCase().replace(/[\s_]/g, ""));
    if (header.join(",") === "fullname,email,coursenumber,crn") records.shift();
    return validateRosterRecords(records);
}

function validateRosterRecords(records) {
    const rows = [], errors = [], emails = new Map();

    for (const { fields, rowNumber } of records) {
        try {
            if (fields.length !== 4) throw new Error("Expected exactly 4 columns: Full Name, Email, Course Number, CRN.");
            const [fullName, rawEmail, courseNumber, crn] = fields;
            const [firstName = "", ...remaining] = fullName.split(/\s+/);
            const names = validateStudentIdentity({ firstName, lastName: remaining.join(" ") });
            if (fullName.includes(",")) throw new Error("Write the full name in First Last order, without a comma.");
            const email = validateStudentEmail(rawEmail);
            if (!courseNumber || !crn) throw new Error("Course number and CRN are required.");
            if (emails.has(email)) throw new Error(`Duplicate email; already listed on row ${emails.get(email)}. Include each student once.`);
            emails.set(email, rowNumber);
            rows.push({ rowNumber, ...names, email, courseNumber, crn, status: "pending" });
        } catch (error) {
            errors.push(`Row ${rowNumber}: ${error.message}`);
        }
    }
    if (!rows.length && !errors.length) errors.push("The file contains a header but no student rows.");
    return { rows, errors };
}

export function parseStudentXml(text) {
    const failure = (message) => ({ rows: [], errors: [message] });
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) return failure("XML rosters cannot contain DOCTYPE or ENTITY declarations.");
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (document.querySelector('parsererror')) return failure("This XML is not valid. Check the opening and closing tags.");
    const root = document.documentElement;
    if (root?.tagName !== 'students' || root.attributes.length) return failure("Use a <students> root with <student> entries.");
    const keys = ['fullName', 'email', 'courseNumber', 'crn'];
    const records = [];
    for (const [index, student] of [...root.children].entries()) {
        if (student.tagName !== 'student' || student.attributes.length) return failure(`Row ${index + 1}: Expected a <student> entry.`);
        const fields = [...student.children];
        if (fields.length !== 4 || keys.some((key) => fields.filter((field) => field.tagName === key).length !== 1)
            || fields.some((field) => field.children.length || field.attributes.length)) {
            return failure(`Row ${index + 1}: Include fullName, email, courseNumber and crn once each, with text values.`);
        }
        records.push({ rowNumber: index + 1, fields: keys.map((key) => fields.find((field) => field.tagName === key).textContent.trim()) });
    }
    if (!records.length) return failure("Add at least one <student> entry.");
    return validateRosterRecords(records);
}

export function parseRoster(text) {
    if (text.length > 2 * 1024 * 1024) return { rows: [], errors: ["Choose a roster smaller than 2 MB."] };
    return text.replace(/^\uFEFF/, '').trimStart().startsWith('<') ? parseStudentXml(text) : parseStudentImport(text);
}

function temporaryPassword() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") + "aA1!";
}

// A retry reuses studentId for accounts already created, and skips completed rows.
export async function importStudentRows(rows, { createStudent, enrollStudent, onProgress = () => {} }) {
    const results = rows.map((row) => ({ ...row }));
    const publish = () => onProgress(results.map((row) => ({ ...row })));
    for (const row of results) {
        if (row.status === "completed") continue;
        row.error = "";
        if (!row.studentId) {
            row.status = "creating";
            publish();
            const password = temporaryPassword();
            try {
                const student = await createStudent({ ...row, password });
                if (!student?.id) throw new Error("The server did not return a student ID.");
                row.studentId = student.id;
                row.password = password;
            } catch (error) {
                row.status = "creation_failed";
                row.error = error.message || "Unable to create the account.";
                publish();
                continue;
            }
        }
        row.status = "enrolling";
        publish();
        try {
            await enrollStudent(row.studentId, row.courseNumber, row.crn);
            row.status = "completed";
        } catch (error) {
            row.status = "enrollment_failed";
            row.error = error.message || "Unable to enroll the student.";
        }
        publish();
    }
    return results;
}
