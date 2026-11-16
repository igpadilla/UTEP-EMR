const STATUS_LABELS = {
    "not started": "Not Started",
    "in progress": "In Progress",
    "revision_requested": "Revision Requested",
    "pending review": "Pending Review",
    "completed": "Completed",
};

const FORMULA_TRIGGERS = /^[=+\-@]/;

export function escapeCsvCell(value) {
    if (value === null || value === undefined) return "";
    let str = String(value);
    if (typeof value !== "number" && FORMULA_TRIGGERS.test(str)) {
        str = `'${str}`;
    }
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function getPatientName(assignedCase, fallbackIndex) {
    const snap = assignedCase?.patient_snapshot ?? assignedCase?.patient_templates ?? {};
    const fullName = `${snap.first_name ?? ""} ${snap.last_name ?? ""}`.trim();
    if (fullName) return fullName;
    if (snap.title?.trim()) return snap.title.trim();
    return `Case ${fallbackIndex + 1}`;
}

function getScenarioKey(assignedCase, patientName) {
    if (assignedCase?.template_id) return String(assignedCase.template_id);
    if (patientName) return `patient:${patientName}`;
    return String(assignedCase?.id ?? "");
}

function isScoredCase(assignedCase) {
    if (!assignedCase || assignedCase.score === null || assignedCase.score === undefined || assignedCase.score === "") {
        return false;
    }
    return Number.isFinite(Number(assignedCase.score));
}

function getCasePercentage(assignedCase) {
    const score = Number(assignedCase.score);
    const maxScore = Number(assignedCase.max_score);
    const denominator = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 100;
    return (score / denominator) * 100;
}

export function buildGradebookCsv({ course, students = [], cases = [] } = {}) {
    void course;
    const scenarios = [];
    const scenarioMap = new Map();

    for (const c of cases) {
        const patientName = getPatientName(c, scenarios.length);
        const key = getScenarioKey(c, patientName);
        if (!scenarioMap.has(key)) {
            const scenario = { key, patientName };
            scenarioMap.set(key, scenario);
            scenarios.push(scenario);
        }
    }

    const headers = [
        "Student Last Name",
        "Student First Name",
        "Cases Assigned",
        "Cases Submitted",
        "Cases Completed",
        "Average Score (%)",
        ...scenarios.flatMap((s) => [`${s.patientName} - Score`, `${s.patientName} - Status`]),
    ];

    const rows = [headers];
    const allScoredPercentages = [];
    const scenarioScores = new Map(scenarios.map((s) => [s.key, []]));

    for (const student of students) {
        const studentId = student.user_id ?? student.id;
        const studentCases = cases.filter(
            (c) => (c.profiles?.user_id ?? c.student_id) === studentId
        );

        const assignedCount = studentCases.length;
        const submittedCount = studentCases.filter(
            (c) => c.encounter_status === "pending review" || c.encounter_status === "completed"
        ).length;
        const completedCount = studentCases.filter(
            (c) => c.encounter_status === "completed"
        ).length;

        const scoredCases = studentCases.filter(isScoredCase);
        const avgScore = scoredCases.length > 0
            ? (scoredCases.reduce((sum, c) => sum + getCasePercentage(c), 0) / scoredCases.length).toFixed(1)
            : "";

        for (const c of scoredCases) {
            allScoredPercentages.push(getCasePercentage(c));
        }

        const dynamicCells = [];
        for (const scenario of scenarios) {
            const matchingCase = studentCases.find(
                (c) => getScenarioKey(c, getPatientName(c, 0)) === scenario.key
            );
            if (!matchingCase) {
                dynamicCells.push("", "");
            } else {
                const scored = isScoredCase(matchingCase);
                const scoreCell = scored ? Number(matchingCase.score) : "";
                if (scored) {
                    scenarioScores.get(scenario.key).push(Number(matchingCase.score));
                }
                const statusLabel = STATUS_LABELS[matchingCase.encounter_status] ?? matchingCase.encounter_status ?? "";
                dynamicCells.push(scoreCell, statusLabel);
            }
        }

        rows.push([
            student.last_name ?? "",
            student.first_name ?? "",
            assignedCount,
            submittedCount,
            completedCount,
            avgScore,
            ...dynamicCells,
        ]);
    }

    const classAvg = allScoredPercentages.length > 0
        ? (allScoredPercentages.reduce((sum, val) => sum + val, 0) / allScoredPercentages.length).toFixed(1)
        : "";

    const summaryDynamicCells = scenarios.flatMap((scenario) => {
        const scores = scenarioScores.get(scenario.key) ?? [];
        const mean = scores.length > 0
            ? (scores.reduce((sum, val) => sum + val, 0) / scores.length).toFixed(1)
            : "";
        return [mean, ""];
    });

    rows.push([
        "CLASS AVERAGE",
        "",
        "",
        "",
        "",
        classAvg,
        ...summaryDynamicCells,
    ]);

    const csvBody = rows
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
        .join("\n");

    return `\uFEFF${csvBody}`;
}

export function downloadGradebookCsv({ course, students, cases } = {}) {
    const csv = buildGradebookCsv({ course, students, cases });
    const courseNumber = String(course?.course_number ?? course?.courseNumber ?? "course")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_");
    const crn = String(course?.crn ?? "unknown")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = `${courseNumber}_CRN_${crn}_gradebook.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return filename;
}
