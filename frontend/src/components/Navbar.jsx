import React from "react";

export default function Navbar({ currentPage, onNavigate, user }) {
  const profile = user?.profile ?? {};

  const canManageStudents = ["admin", "instructor"].includes(profile.account_type);
  const isInstructorOrAdmin = profile.account_type === "instructor" || profile.account_type === "admin";

  return (
    <nav className="main-navigation" aria-label="Main navigation">
      <div className="navigation-inner">

        <button
          className={`nav-link ${currentPage === "dashboard" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("dashboard")}
        >
          Dashboard
        </button>

        <button
          className={`nav-link ${currentPage === "patients" ? "active" : ""}`}
          type="button"
          onClick={() => onNavigate("patients")}
        >
          Patients
        </button>

        {canManageStudents && (
          <button
            className={`nav-link ${currentPage === "students" ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate("students")}
          >
            Students
          </button>
        )}

        {isInstructorOrAdmin && (
          <button
            className={`nav-link ${currentPage === "cases" ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate("cases")}
          >
            Cases
          </button>
        )}

        {profile.account_type === "student" && (
          <button
            className={`nav-link ${currentPage === "myCases" ? "active" : ""}`}
            type="button"
            onClick={() => onNavigate("myCases")}
          >
            My Cases
          </button>
        )}

        {isInstructorOrAdmin && (
          <div className="nav-dropdown">
            <button
              className={`nav-link ${currentPage === "courses" ? "active" : ""}`}
              type="button"
            >
              Courses
            </button>
            <div className="nav-dropdown-menu" role="menu">
              <button
                className={`nav-dropdown-item ${currentPage === "courses" ? "active" : ""}`}
                type="button"
                role="menuitem"
                onClick={() => onNavigate("courses")}
              >
                Course Management
              </button>
            </div>
          </div>
        )}

        <button className="nav-link" type="button" disabled title="Provider Directory is not yet available">
          Providers
        </button>

        <button className="nav-link" type="button" disabled title="Scheduling is not yet available">
          Scheduling
        </button>

        <button className="nav-link" type="button" disabled title="Reports are not yet available">
          Reports
        </button>

      </div>
    </nav>
  );
}