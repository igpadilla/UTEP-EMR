import { useEffect, useState } from "react";
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
import CourseForm from "./pages/CourseForm.jsx";
import CourseDetail from "./pages/CourseDetail.jsx";

import {
    getSession,
    logout,
    onAuthStateChange
} from "./services/auth.js";

import { getCurrentUserWithProfile } from "./services/profile.js";

export default function App() {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [nav, setNav] = useState({ page: "dashboard", id: null });

    function navigate(page, id = null, extra = {}) {
        setNav({ page, id, ...extra });
    }

    useEffect(() => {
        async function initializeAuth() {
            try {
                const currentSession = await getSession();
                setSession(currentSession);
                if (currentSession) await loadUser();
            } catch (error) {
                console.error(error);
                setError("Unable to initialize authentication.");
            } finally {
                setLoading(false);
            }
        }

        initializeAuth();

        const { data: { subscription } } = onAuthStateChange(async (_event, newSession) => {
            setSession(newSession);
            if (newSession) await loadUser();
            else setUser(null);
        });

        return () => subscription.unsubscribe();
    }, []);

    async function loadUser() {
        try {
            const currentUser = await getCurrentUserWithProfile();
            if (!currentUser) { setUser(null); return; }
            if (!currentUser.profile.active) {
                await logout();
                setError("Your account is inactive.");
                return;
            }
            setUser(currentUser);
            setError("");
        } catch (error) {
            console.error(error);
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

    if (!user) return <p>Loading account...</p>;

    const isAdmin = user.profile.account_type === "admin";
    const isInstructor = user.profile.account_type === "instructor";
    const canManageStudents = ["admin", "instructor"].includes(
        user.profile.account_type,
    );
    const canManageCases = ["admin", "instructor"].includes(
        user.profile.account_type,
    );

    const navbarPage =
        nav.page === "studentManagement" ? "students"
        : nav.page === "patientManager" || nav.page === "patientDetail" ? "patients"
        : nav.page === "patientLookup" || nav.page === "studentPatientDetail" ? "patients"
        : nav.page === "appointments" ? "appointments"
        : nav.page === "instructorCases" || nav.page === "templateBuilder" || nav.page === "caseAssign" ? "cases"
        : nav.page === "courses" || nav.page === "courseDetail" ? "courses"
        : nav.page === "studentCases" ? "myCases"
        : "dashboard";

    function handleNavbarNavigate(page) {
        if (page === "students" && canManageStudents) {
            navigate("studentManagement");
        } else if (page === "cases" && canManageCases) {
            navigate("instructorCases");
        } else if (page === "courses" && canManageCases) {
            navigate("courses");
        } else if (page === "myCases") {
            navigate("studentCases");
        } else if (page === "patients") {
            navigate(isAdmin || isInstructor ? "patientManager" : "patientLookup");
        } else if (page === "appointments") {
            navigate("appointments");
        } else {
            navigate("dashboard");
        }
    }

    let pageContent;
    switch (nav.page) {
        case "patientManager":
            pageContent = <PatientManager onNavigate={navigate} />;
            break;
        case "patientDetail":
            pageContent = <PatientDetail id={nav.id} onNavigate={navigate} />;
            break;
        case "patientLookup":
            pageContent = <PatientLookup onNavigate={navigate} />;
            break;
        case "studentPatientDetail":
            pageContent = <StudentPatientDetail id={nav.id} onNavigate={navigate} />;
            break;
        case "studentManagement":
            pageContent = canManageStudents
                ? <StudentManagement onNavigate={navigate} canManageAccounts={isAdmin} />
                : <Dashboard user={user} onNavigate={navigate} />;
            break;
        case "appointments":
            pageContent = <Appointments onNavigate={navigate} />;
            break;
        case "instructorCases":
            pageContent = canManageCases
                ? <InstructorCases onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} />;
            break;
        case "templateBuilder":
            pageContent = canManageCases
                ? <TemplateBuilder templateId={nav.id} patientId={nav.fromPatientId ?? null} onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} />;
            break;
        case "caseAssign":
            pageContent = canManageCases
                ? <CaseAssign templateId={nav.id} onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} />;
            break;
        case "studentCases":
            pageContent = <StudentCases onNavigate={navigate} />;
            break;
        case "courses":
            pageContent = canManageCases
                ? <CourseForm onNavigate={navigate} />
                : <Dashboard user={user} onNavigate={navigate} />;
            break;
        case "courseDetail":
            pageContent = <CourseDetail courseId={nav.id} onNavigate={navigate} />;
            break;
        case "dashboard":
        default:
            pageContent = <Dashboard user={user} onNavigate={navigate} />;
    }

    return (
        <div className="emr-app">
            <Header user={user} />
            <Navbar user={user} currentPage={navbarPage} onNavigate={handleNavbarNavigate} />
            {pageContent}
            <footer className="emr-footer">
                <span>Educational EMR Prototype</span>
                <span>For educational use only</span>
            </footer>
        </div>
    );
}
