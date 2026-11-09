import { useEffect, useRef, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";
import Navbar from "./components/Navbar.jsx";
import PatientManager from "./pages/PatientManager.jsx";
import PatientDetail from "./pages/PatientDetail.jsx";
import PatientLookup from "./pages/PatientLookup.jsx";
import StudentPatientDetail from "./pages/StudentPatientDetail.jsx";
import Appointments from "./pages/Appointments.jsx";
import StudentManagement from "./pages/StudentManagement.jsx";
import InstructorCases from "./pages/InstructorCases.jsx";
import TemplateBuilder from "./pages/TemplateBuilder.jsx";
import CaseAssign from "./pages/CaseAssign.jsx";
import StudentCases from "./pages/StudentCases.jsx";
import StudentCourses from "./pages/StudentCourses.jsx";
import StudentCourseDetail from "./pages/StudentCourseDetail.jsx";
import CourseForm from "./pages/CourseForm.jsx";
import CourseDetail from "./pages/CourseDetail.jsx";
import PatientChart from "./pages/PatientChart.jsx";
import PatientPortal from "./pages/PatientPortal.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import IdleWarning from "./components/IdleWarning.jsx";

import {
    getSession,
    logout,
    onAuthStateChange
} from "./services/auth.js";

import { getCurrentUserWithProfile } from "./services/profile.js";
import { getLivePatientAccess, NO_LIVE_PATIENT_ACCESS, FULL_LIVE_PATIENT_ACCESS } from "./services/clinicalRoleService.js";

export default function App() {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [accountWarning, setAccountWarning] = useState("");
    const [showIdleWarning, setShowIdleWarning] = useState(false);
    const [liveAccess, setLiveAccess] = useState(NO_LIVE_PATIENT_ACCESS);
    const [nav, setNav] = useState({ page: "dashboard", id: null });
    const accountRequest = useRef(0);
    const stayIdleRef = useRef(() => {});

    function navigate(page, id = null, extra = {}) {
        setNav({ page, id, ...extra });
    }

    useEffect(() => {
        let signedIn = false;
        let disposed = false;
        let authTimer;
        async function initializeAuth() {
            try {
                const currentSession = await getSession();
                if (disposed) return;
                signedIn = Boolean(currentSession);
                setSession(currentSession);
                if (currentSession) await loadUser();
            } catch (error) {
                console.error(error);
                setError("Unable to initialize authentication.");
            } finally {
                if (!disposed) setLoading(false);
            }
        }

        initializeAuth();

        const { data: { subscription } } = onAuthStateChange((_event, newSession) => {
            signedIn = Boolean(newSession);
            accountRequest.current++;
            setSession(newSession);
            clearTimeout(authTimer);
            if (newSession) {
                setUser((current) => current?.id === newSession.user.id ? current : null);
                // Supabase auth callbacks must finish before making another auth request.
                authTimer = setTimeout(() => { if (!disposed) loadUser({ background: true }); }, 0);
            } else {
                setUser(null);
                setAccountWarning("");
            }
        });

        function recheckAccount() {
            if (signedIn && document.visibilityState === "visible") loadUser({ background: true });
        }
        const interval = setInterval(recheckAccount, 60_000);
        window.addEventListener("focus", recheckAccount);
        document.addEventListener("visibilitychange", recheckAccount);
        return () => {
            disposed = true;
            accountRequest.current++;
            clearTimeout(authTimer);
            clearInterval(interval);
            window.removeEventListener("focus", recheckAccount);
            document.removeEventListener("visibilitychange", recheckAccount);
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!session) return;

        const IDLE_LIMIT_MS = 30 * 60 * 1000;
        const WARNING_MS = 2 * 60 * 1000;
        const CHECK_MS = 1000;
        const WRITE_MS = 5000;
        const ACTIVITY_KEY = "emr:lastActivity";

        let ownActivity = Date.now();
        let lastWrite = 0;
        let warningShown = false;

        function readActivity() {
            try {
                const stored = Number(localStorage.getItem(ACTIVITY_KEY));
                if (stored > 0) return stored;
            } catch {}
            return ownActivity;
        }

        function markActive() {
            const now = Date.now();
            ownActivity = now;
            lastWrite = now;
            warningShown = false;
            setShowIdleWarning(false);
            try {
                localStorage.setItem(ACTIVITY_KEY, String(now));
            } catch {}
        }

        function handleActivity() {
            if (warningShown) return;
            if (Date.now() - lastWrite < WRITE_MS) return;
            markActive();
        }

        function checkIdle() {
            const idleFor = Date.now() - readActivity();
            if (idleFor >= IDLE_LIMIT_MS) {
                setShowIdleWarning(false);
                logout().catch(() => {});
            } else if (idleFor >= IDLE_LIMIT_MS - WARNING_MS) {
                warningShown = true;
                setShowIdleWarning(true);
            } else if (warningShown) {
                warningShown = false;
                setShowIdleWarning(false);
            }
        }

        stayIdleRef.current = markActive;
        markActive();

        const events = ["mousemove", "keydown", "click", "touchstart"];
        events.forEach((e) => window.addEventListener(e, handleActivity));
        const checkTimer = setInterval(checkIdle, CHECK_MS);

        return () => {
            clearInterval(checkTimer);
            stayIdleRef.current = () => {};
            events.forEach((e) => window.removeEventListener(e, handleActivity));
        };
    }, [session]);

    async function loadUser({ background = false } = {}) {
        const request = ++accountRequest.current;
        try {
            const currentUser = await getCurrentUserWithProfile();
            if (request !== accountRequest.current) return;
            if (!currentUser || !currentUser.profile.active) {
                setUser(null);
                setSession(null);
                setAccountWarning("");
                setError(currentUser ? "Your account is inactive." : "Your session ended. Please sign in again.");
                await logout().catch((error) => console.error(error));
                return;
            }
            // Students on clinical courses work only on their cases; front desk and biller keep Patient Lookup.
            const livePatients = currentUser.profile.account_type === "patient" ? NO_LIVE_PATIENT_ACCESS : currentUser.profile.account_type === "student"
                ? await getLivePatientAccess().catch(() => NO_LIVE_PATIENT_ACCESS)
                : FULL_LIVE_PATIENT_ACCESS;
            if (request !== accountRequest.current) return;
            setLiveAccess(livePatients);
            setUser(currentUser);
            setError("");
            setAccountWarning("");
        } catch (error) {
            if (request !== accountRequest.current) return;
            console.error(error);
            //     Keep the open page and its edits when a background check cannot connect
            if (background) setAccountWarning("Unable to check your account right now. We'll try again shortly.");
            else setUser(null);
            setError("Unable to load your account.");
        }
    }

    if (loading) return <p>Loading...</p>;

    if (!session) {
        return (
            <>
                {error && <p role="alert">{error}</p>}
                <Login />
            </>
        );
    }

    if (!user) return error ? (
        <div className="scaffold-card">
            <p role="alert">{error}</p>
            <button type="button" onClick={() => loadUser()}>Retry</button>
            <button type="button" onClick={() => logout().catch(() => setError("Unable to sign out. Please try again."))}>Sign out</button>
        </div>
    ) : <p>Loading account...</p>;

    if (user.profile.must_change_password) {
        return <ChangePassword onDone={() => loadUser()} />;
    }

    //     Patient logins go straight to their own view, with no staff navigation
    if (user.profile.account_type === "patient") {
        return <PatientPortal key={user.id} user={user} accountWarning={accountWarning}
            idleWarning={showIdleWarning && <IdleWarning onStay={() => stayIdleRef.current?.()} />} />;
    }

    const isAdmin = user.profile.account_type === "admin";
    const isInstructor = user.profile.account_type === "instructor";
    const isStudent = user.profile.account_type === "student";
    const canManageStudents = ["admin", "instructor"].includes(
        user.profile.account_type,
    );
    // Only instructors create and manage cases and templates; admins manage accounts
    const canManageCases = isInstructor;
    // Admins manage all courses and enrollments, so they keep the Courses pages
    const canManageCourses = isAdmin || isInstructor;

    const navbarPage =
        nav.page === "studentManagement" ? "students"
        : nav.page === "patientManager" || nav.page === "patientDetail" ? "patients"
        : nav.page === "patientLookup" || nav.page === "studentPatientDetail" || nav.page === "patientChart" ? "patients"
        : nav.page === "appointments" ? "appointments"
        : nav.page === "instructorCases" || nav.page === "templateBuilder" || nav.page === "caseAssign" ? "courses"
        : nav.page === "courses" || nav.page === "courseDetail" ? "courses"
        : nav.page === "studentCases" ? "studentCases"
        : nav.page === "studentCourses" || nav.page === "studentCourseDetail" ? "myCourses"
        : "dashboard";

    function handleNavbarNavigate(page) {
        if (page === "students" && canManageStudents) {
            navigate("studentManagement");
        } else if (page === "courses" && canManageCourses) {
            navigate("courses");
        } else if (page === "myCourses") {
            navigate("studentCourses");
        } else if (page === "studentCases") {
            navigate("studentCases");
        } else if (page === "patients") {
            // Clinical students work on their own case copies; front desk and biller use Patient Lookup
            navigate(isAdmin || isInstructor ? "patientManager" : isStudent && !liveAccess.read ? "studentCourses" : "patientLookup");
        } else if (page === "appointments") {
            navigate("appointments");
        } else {
            navigate("dashboard");
        }
    }

    // Live patient pages are for staff and non-clinical roles; other students are sent to their courses
    const livePatientPage = ["patientLookup", "studentPatientDetail", "appointments"].includes(nav.page)
        || (nav.page === "patientChart" && !nav.caseId);
    const page = isStudent && !liveAccess.read && livePatientPage ? "studentCourses" : nav.page;

    let pageContent;
    switch (page) {
        case "patientManager":
            pageContent = <PatientManager onNavigate={navigate} />;
            break;
        case "patientDetail":
            pageContent = <PatientDetail key={nav.id} id={nav.id} onNavigate={navigate} canManagePortal={isAdmin} />;
            break;
        case "patientLookup":
            pageContent = <PatientLookup onNavigate={navigate} access={liveAccess} />;
            break;
        case "studentPatientDetail":
            pageContent = <StudentPatientDetail id={nav.id} onNavigate={navigate} access={liveAccess} />;
            break;
        case "patientChart":
            pageContent = <PatientChart key={nav.caseId ? `case-${nav.caseId}` : `patient-${nav.id}`}
                id={nav.id} caseId={nav.caseId} backTo={nav.backTo} onNavigate={navigate}
                canEditPatient={user.profile.active && (isAdmin || isInstructor)}
                fromCourse={nav.fromCourse ?? null} />;
            break;
        case "studentManagement":
            pageContent = canManageStudents
                ? <StudentManagement onNavigate={navigate} canManageAccounts={isAdmin} />
                : <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
            break;
        case "appointments":
            pageContent = <Appointments onNavigate={navigate} access={liveAccess} />;
            break;
        case "instructorCases":
            pageContent = canManageCases
                ? <InstructorCases onNavigate={navigate} fromCourseId={nav.fromCourseId ?? null} fromCourseName={nav.fromCourseName ?? null} />
                : <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
            break;
        case "templateBuilder":
            pageContent = canManageCases
                ? <TemplateBuilder templateId={nav.id} patientId={nav.fromPatientId ?? null} fromCourseId={nav.fromCourseId ?? null} fromCourseName={nav.fromCourseName ?? null} onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
            break;
        case "caseAssign":
            pageContent = canManageCases
                ? <CaseAssign templateId={nav.id} fromCourseId={nav.fromCourseId ?? null} fromCourseName={nav.fromCourseName ?? null} onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
            break;
        case "studentCases":
            pageContent = <StudentCases onNavigate={navigate} openCaseId={nav.openCaseId ?? null} fromCourse={nav.fromCourse ?? null} />;
            break;
        case "studentCourses":
            pageContent = <StudentCourses onNavigate={navigate} />;
            break;
        case "studentCourseDetail":
            pageContent = <StudentCourseDetail course={nav.course} onNavigate={navigate} />;
            break;
        case "courses":
            pageContent = canManageCourses
                ? <CourseForm onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
            break;
        case "courseDetail":
            pageContent = <CourseDetail courseId={nav.id} onNavigate={navigate} />;
            break;
        case "dashboard":
        default:
            pageContent = <Dashboard user={user} onNavigate={navigate} canUseLivePatients={liveAccess.read} />;
    }

    // The template builder uses the whole screen for the case form and the patient chart.
    const isTemplateBuilder = page === "templateBuilder";

    if (isTemplateBuilder) {
        return (
            <div className="emr-app emr-app-fullscreen">
                {accountWarning && <p className="form-message" role="status">{accountWarning}</p>}
                {pageContent}
                {showIdleWarning && <IdleWarning onStay={() => stayIdleRef.current?.()} />}
            </div>
        );
    }

    return (
        <div className="min-h-screen flex bg-white text-slate-900 font-sans">
            <Navbar
                user={user}
                currentPage={navbarPage}
                onNavigate={handleNavbarNavigate}
                canUseLivePatients={liveAccess.read}
            />
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                <Header
                    user={user}
                    onNavigate={navigate}
                    canUseLivePatients={liveAccess.read}
                />
                {accountWarning && (
                    <div className="px-6 py-2 bg-amber-50/60 border-b border-amber-200 text-xs text-amber-900" role="status">
                        {accountWarning}
                    </div>
                )}
                <div className="flex-1">
                    {pageContent}
                </div>
                {showIdleWarning && <IdleWarning onStay={() => stayIdleRef.current?.()} />}
                <footer className="border-t border-slate-100 px-8 py-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>UTEP Educational EMR</span>
                    <span>For educational use only</span>
                </footer>
            </div>
        </div>
    );
}
