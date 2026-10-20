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
import PatientChart from "./pages/PatientChart.jsx";

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
    const accountRequest = useRef(0);

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
                authTimer = setTimeout(() => { if (!disposed) loadUser(); }, 0);
            } else setUser(null);
        });

        function recheckAccount() {
            if (signedIn && document.visibilityState === "visible") loadUser();
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

    async function loadUser() {
        const request = ++accountRequest.current;
        try {
            const currentUser = await getCurrentUserWithProfile();
            if (request !== accountRequest.current) return;
            if (!currentUser) { setUser(null); return; }
            if (!currentUser.profile.active) {
                setUser(null);
                setError("Your account is inactive.");
                await logout();
                return;
            }
            setUser(currentUser);
            setError("");
        } catch (error) {
            if (request !== accountRequest.current) return;
            console.error(error);
            setUser(null);
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
            <button type="button" onClick={loadUser}>Retry</button>
            <button type="button" onClick={() => logout().catch(() => setError("Unable to sign out. Please try again."))}>Sign out</button>
        </div>
    ) : <p>Loading account...</p>;

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
        : nav.page === "patientLookup" || nav.page === "studentPatientDetail" || nav.page === "patientChart" ? "patients"
        : nav.page === "appointments" ? "appointments"
        : nav.page === "instructorCases" || nav.page === "templateBuilder" || nav.page === "caseAssign" ? "cases"
        : nav.page === "studentCases" ? "myCases"
        : "dashboard";

    function handleNavbarNavigate(page) {
        if (page === "students" && canManageStudents) {
            navigate("studentManagement");
        } else if (page === "cases" && canManageCases) {
            navigate("instructorCases");
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
        case "patientChart":
            pageContent = <PatientChart id={nav.id} caseId={nav.caseId} backTo={nav.backTo} onNavigate={navigate} />;
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
