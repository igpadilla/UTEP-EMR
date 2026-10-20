import test from "node:test";
import assert from "node:assert/strict";
import { getCaseCriteria, validateGrade, validateRubric, previewGrade } from "../frontend/src/lib/grading.js";

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
