import { useState } from "react";
import { createStudent } from "../services/students.js";
import BulkStudentImport from "../components/BulkStudentImport.jsx";
import StudentDirectory from "./StudentDirectory.jsx";

// keep initial form values in one place so the form can be reset
// after a student is created successfully

const EMPTY_FORM = {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
};

export default function StudentManagement({ onNavigate, canManageAccounts }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [directoryVersion, setDirectoryVersion] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    // Store feedback that will be displayed to the user
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");



    // update the matching form properly whenever an input changes
    function handleChange(event) {
        const { name, value } = event.target;

        setForm((currentForm) => ({
            ...currentForm,
            [name]: value,
        }));
    }
    // validate and submit the student form

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setSuccess("");

        // The confirmation password is checked only in the browser
        if (form.password !== form.confirmPassword) {
            setError("The passwords do not match.");
            return;
        }

        setSubmitting(true);

        try {
            const student = await createStudent(form);

            setSuccess(
                `${student.firstName} ${student.lastName} was created successfully.`,
            );

            // Clear all fields after a successful submission.
          setForm(EMPTY_FORM);
          setDirectoryVersion((value) => value + 1);
        } catch (submissionError) {
            setError(
                submissionError instanceof Error
                    ? submissionError.message
                    : "Unable to create the student account.",
            );
        } finally {
            // Re-enable the form whether the request succeeded or failed.
            setSubmitting(false);
        }
    }

    return (
  <main className="student-management-main">
    {/* Page heading and navigation back to the dashboard. */}
    <header className="student-management-header">
      <div>
        <p className="eyebrow">Administration</p>
        <h2>Student Management</h2>
        <p>{canManageAccounts ? "View and manage student accounts." : "Create a student account and provide their initial login details."}</p>
      </div>

      <button
        className="secondary-action-button"
        type="button"
        onClick={() => onNavigate("dashboard")}
        disabled={submitting}
      >
        Back to Dashboard
      </button>
    </header>
      {canManageAccounts && <StudentDirectory refreshKey={directoryVersion} />}
    {/* The form is contained in its own section for accessibility. */}
    <section
      className="student-form-panel"
      aria-labelledby="create-student-heading"
    >
      <div className="student-form-heading">
        <h3 id="create-student-heading">Create Student Account</h3>
        <p>All fields are required.</p>
      </div>

      {/* role="alert" announces errors to assistive technology. */}
      {error && (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      )}

      {/* role="status" announces successful account creation. */}
      {success && (
        <p className="form-message form-message-success" role="status">
          {success}
        </p>
      )}

      <form className="student-form" onSubmit={handleSubmit}>
        <div className="student-form-grid">
          <div className="student-form-field">
            <label htmlFor="student-first-name">First Name</label>
            <input
              id="student-first-name"
              name="firstName"
              type="text"
              value={form.firstName}
              onChange={handleChange}
              autoComplete="given-name"
              maxLength={100}
              disabled={submitting}
              required
            />
          </div>

          <div className="student-form-field">
            <label htmlFor="student-last-name">Last Name</label>
            <input
              id="student-last-name"
              name="lastName"
              type="text"
              value={form.lastName}
              onChange={handleChange}
              autoComplete="family-name"
              maxLength={100}
              disabled={submitting}
              required
            />
          </div>

          <div className="student-form-field student-form-field-wide">
            <label htmlFor="student-email">Email</label>
            <input
              id="student-email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              maxLength={254}
              disabled={submitting}
              required
            />
          </div>

          <div className="student-form-field">
            <label htmlFor="student-password">Temporary Password</label>
            <input
              id="student-password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={6}
              disabled={submitting}
              required
            />
          </div>

          <div className="student-form-field">
            <label htmlFor="student-confirm-password">
              Confirm Temporary Password
            </label>
            <input
              id="student-confirm-password"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              minLength={6}
              disabled={submitting}
              required
            />
          </div>
        </div>

        <div className="student-form-actions">
          <button
            className="primary-action-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating Student..." : "Create Student"}
          </button>
        </div>
      </form>
    </section>
    <BulkStudentImport onImported={() => setDirectoryVersion((value) => value + 1)}/>
  </main>
);
}
