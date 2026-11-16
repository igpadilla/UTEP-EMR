import test from "node:test";
import assert from "node:assert/strict";
import { getCaseCriteria, validateGrade, validateRubric, previewGrade } from "../frontend/src/lib/grading.js";
import { buildGradebookCsv, escapeCsvCell } from "../frontend/src/lib/gradebookExport.js";

const rubric = [{ key: "complaint", label: "Chief complaint", maxPoints: 2 }, { key: "history", label: "History", maxPoints: 8 }];

test("custom rubric saves its actual denominator and ignores stale score keys", () => {
    assert.deepEqual(validateGrade(rubric, { complaint: "1.5", history: "7", oldCriterion: 25 }), {
        score: 8.5, maxScore: 10, rubricScores: { complaint: 1.5, history: 7 },
    });
    assert.equal(previewGrade(rubric, { complaint: "1.5", history: "7", oldCriterion: 25 }), 8.5);
});

test("missing, invalid, negative, or excessive scores cannot be submitted", () => {
    for (const complaint of [undefined, null, "", " ", "NaN", Infinity, -1, 2.01, "1wrong", true, 0.001]) {
        assert.throws(() => validateGrade(rubric, { complaint, history: 5 }), /Chief complaint/);
    }
    assert.equal(validateGrade(rubric, { complaint: 0, history: 0 }).score, 0);
});

test("empty live rubric falls back to the assignment's stored rubric", () => {
    assert.equal(getCaseCriteria({ patient_templates: { rubric_criteria: [] }, patient_snapshot: { rubric_criteria: rubric } }), rubric);
});

test("rubric definition rejects ambiguous keys and totals outside the database range", () => {
    assert.throws(() => validateRubric([{ ...rubric[0], label: " " }]), /label/);
    assert.throws(() => validateRubric([rubric[0], rubric[0]]), /unique/);
    assert.throws(() => validateRubric([{ ...rubric[0], maxPoints: -1 }]), /maximum/);
    assert.throws(() => validateRubric([{ ...rubric[0], maxPoints: 1000 }]), /999.99/);
});

test("buildGradebookCsv generates UTF-8 BOM, dynamic scenario headers, student metrics, and CLASS AVERAGE row", () => {
    const course = { course_number: "PHARM 4301", crn: "12345" };
    const students = [
        { user_id: "s1", first_name: "Ana", last_name: "Rivera" },
        { user_id: "s2", first_name: "Ben", last_name: "Chen" },
    ];
    const cases = [
        {
            id: "c1",
            template_id: "t1",
            encounter_status: "completed",
            score: 90,
            max_score: 100,
            patient_snapshot: { first_name: "Maria", last_name: "Lopez" },
            profiles: { user_id: "s1" },
        },
        {
            id: "c2",
            template_id: "t2",
            encounter_status: "pending review",
            score: null,
            max_score: 100,
            patient_snapshot: { first_name: "John", last_name: "Doe" },
            profiles: { user_id: "s1" },
        },
        {
            id: "c3",
            template_id: "t1",
            encounter_status: "completed",
            score: 80,
            max_score: 100,
            patient_snapshot: { first_name: "Maria", last_name: "Lopez" },
            profiles: { user_id: "s2" },
        },
        {
            id: "c4",
            template_id: "t2",
            encounter_status: "completed",
            score: 100,
            max_score: 100,
            patient_snapshot: { first_name: "John", last_name: "Doe" },
            profiles: { user_id: "s2" },
        },
    ];

    const csv = buildGradebookCsv({ course, students, cases });
    assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");

    const lines = csv.slice(1).split("\n");
    assert.equal(
        lines[0],
        "Student Last Name,Student First Name,Cases Assigned,Cases Submitted,Cases Completed,Average Score (%),Maria Lopez - Score,Maria Lopez - Status,John Doe - Score,John Doe - Status"
    );
    assert.equal(
        lines[1],
        "Rivera,Ana,2,2,1,90.0,90,Completed,,Pending Review"
    );
    assert.equal(
        lines[2],
        "Chen,Ben,2,2,2,90.0,80,Completed,100,Completed"
    );
    assert.equal(
        lines[3],
        "CLASS AVERAGE,,,,,90.0,85.0,,100.0,"
    );
});

test("buildGradebookCsv escapes commas, quotes, newlines, and neutralizes formula injection", () => {
    assert.equal(escapeCsvCell('Smith, Jr. "The Third"'), '"Smith, Jr. ""The Third"""');
    assert.equal(escapeCsvCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
    assert.equal(escapeCsvCell("=SUM(A1:A5)"), "'=SUM(A1:A5)");
    assert.equal(escapeCsvCell("+cmd|'/C calc'!A0"), "'+cmd|'/C calc'!A0");
    assert.equal(escapeCsvCell("-10+20"), "'-10+20");
    assert.equal(escapeCsvCell("@IMPORTXML()"), "'@IMPORTXML()");

    const csv = buildGradebookCsv({
        course: { course_number: "NURS 3100", crn: "99999" },
        students: [{ user_id: "s1", first_name: "=Evil", last_name: 'O"Connor, Jr.' }],
        cases: [],
    });
    const lines = csv.slice(1).split("\n");
    assert.equal(lines[1], '"O""Connor, Jr.",\'=Evil,0,0,0,');
});

