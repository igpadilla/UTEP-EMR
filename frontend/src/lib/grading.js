export const DEFAULT_RUBRIC_CRITERIA = [
    { key: "subjective", label: "Subjective History", maxPoints: 25 },
    { key: "objective", label: "Objective Findings & Vitals", maxPoints: 25 },
    { key: "assessment", label: "Assessment & Clinical Logic", maxPoints: 25 },
    { key: "plan", label: "Plan & Safety Checks", maxPoints: 25 },
];

export function getCaseCriteria(assignedCase) {
    const template = assignedCase.patient_templates?.rubric_criteria;
    const snapshot = assignedCase.patient_snapshot?.rubric_criteria;
    if (Array.isArray(template) && template.length) return template;
    if (Array.isArray(snapshot) && snapshot.length) return snapshot;
    return DEFAULT_RUBRIC_CRITERIA;
}

function points(value) {
    if (!["number", "string"].includes(typeof value) || String(value).trim() === "") return NaN;
    return Number(value);
}

// Grades use the database's existing two-decimal numeric fields.
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateRubric(criteria) {
    if (!Array.isArray(criteria) || !criteria.length) throw new Error("Add at least one rubric criterion.");
    const keys = new Set();
    let maxScore = 0;
    for (const criterion of criteria) {
        if (!criterion || typeof criterion.key !== "string" || !criterion.key.trim() || keys.has(criterion.key)
            || typeof criterion.label !== "string" || !criterion.label.trim()) {
            throw new Error("Each rubric criterion needs a label and a unique key.");
        }
        keys.add(criterion.key);
        const max = points(criterion.maxPoints);
        if (!Number.isFinite(max) || max < 0 || Math.abs(round(max) - max) > 1e-9) {
            throw new Error(`Enter a valid maximum for ${criterion.label}, using at most two decimal places.`);
        }
        maxScore += max;
    }
    maxScore = round(maxScore);
    if (maxScore <= 0 || maxScore > 999.99) throw new Error("Total rubric points must be greater than 0 and no more than 999.99.");
    return maxScore;
}

export function validateGrade(criteria, scores) {
    const maxScore = validateRubric(criteria);
    let score = 0;
    const rubricScores = {};
    for (const criterion of criteria) {
        const value = points(scores?.[criterion.key]);
        if (!Number.isFinite(value) || value < 0 || value > Number(criterion.maxPoints)
            || Math.abs(round(value) - value) > 1e-9) {
            throw new Error(`Enter a score from 0 to ${criterion.maxPoints} for ${criterion.label}, using at most two decimal places.`);
        }
        rubricScores[criterion.key] = value;
        score += value;
    }
    return { rubricScores, score: round(score), maxScore };
}

export function previewGrade(criteria, scores) {
    return round(criteria.reduce((sum, criterion) => {
        const value = points(scores?.[criterion.key]);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0));
}
