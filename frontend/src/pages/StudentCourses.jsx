import { useEffect, useState } from "react";
import { getMyEnrolledCourses } from "../services/instructorService.js";

const DISCIPLINE_BANNERS = {
    pharmacy:                  "linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
    nursing:                   "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    physical_therapy:          "linear-gradient(135deg, #047857 0%, #10b981 100%)",
    occupational_therapy:      "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
    psychology:                "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    psychiatry:                "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    speech_language_pathology: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
    social_work:               "linear-gradient(135deg, #065f46 0%, #059669 100%)",
    inpatient_physician:       "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)",
};
const DEFAULT_BANNER = "linear-gradient(135deg, #475569 0%, #94a3b8 100%)";

const DISCIPLINE_ABBR = {
    pharmacy:                  "PHARM",
    nursing:                   "NURS",
    physical_therapy:          "PT",
    occupational_therapy:      "OT",
    psychology:                "PSYC",
    psychiatry:                "PSYC",
    speech_language_pathology: "SLP",
    social_work:               "SW",
    inpatient_physician:       "MD",
};

export default function StudentCourses({ onNavigate }) {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        getMyEnrolledCourses()
            .then(setCourses)
            .catch((err) => { console.error(err); setError("Failed to load courses."); })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <main className="instructor-main">
                <p className="instructor-loading">Loading…</p>
            </main>
        );
    }

    return (
        <main className="instructor-main">
            <div className="instructor-page-header">
                <div>
                    <p className="section-title">Student</p>
                    <h2>My Courses</h2>
                    <p>Courses you are currently enrolled in.</p>
                </div>
            </div>

            {error && <p className="form-message form-message-error">{error}</p>}

            {courses.length === 0 ? (
                <div className="patients-empty-state">
                    <div className="patients-empty-icon" aria-hidden="true">📚</div>
                    <strong>No courses yet</strong>
                    <p>You have not been enrolled in any courses. Contact your instructor.</p>
                </div>
            ) : (
                <div className="course-grid">
                    {courses.map((c) => {
                        const banner = DISCIPLINE_BANNERS[c.discipline] ?? DEFAULT_BANNER;
                        const abbr = c.discipline ? (DISCIPLINE_ABBR[c.discipline] ?? c.discipline) : null;
                        const instructor = c.profiles;
                        return (
                            <div key={c.id} className="course-card" style={{ cursor: "pointer" }} onClick={() => onNavigate("studentCourseDetail", c.id, { course: c })}>
                                <div className="course-card-banner" style={{ background: banner }} />
                                <div className="course-card-body">
                                    <span className="course-card-id">CRN {c.crn}</span>
                                    <span className="course-card-name">
                                        {abbr ? `${abbr} ` : ""}{c.course_number}
                                    </span>
                                </div>
                                <div className="course-card-footer">
                                    <span className="course-card-instructor">
                                        {instructor
                                            ? `${instructor.first_name} ${instructor.last_name}`
                                            : "—"}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
