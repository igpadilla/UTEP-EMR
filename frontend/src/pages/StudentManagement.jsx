import StudentDirectory from "./StudentDirectory.jsx";

export default function StudentManagement({ onNavigate, canManageAccounts = false, notice = "" }) {
    if (!canManageAccounts) return <main className="student-management-main">
        <p role="alert">Only admins can manage student accounts</p>
        <button type="button" onClick={() => onNavigate("dashboard")}>Back to Dashboard</button>
    </main>;

    return <main className="student-management-main">
        <header className="student-management-header">
            <div>
                <h2>Student management</h2>
                <p>View and manage student accounts.</p>
            </div>
        </header>
        {notice && <p className="form-message form-message-success" role="status">{notice}</p>}
        <StudentDirectory />
    </main>;
}
