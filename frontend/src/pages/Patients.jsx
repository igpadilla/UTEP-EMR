import React from "react";

export default function Patients() {
  return (
    <main className="patients-main">
      <section className="patients-page-header">
        <div>
          <h2>Patients</h2>
          <p>Search and access patient records.</p>
        </div>

        <button
          className="primary-action-button"
          type="button"
          disabled
          title="Patient registration is not yet available"
        >
          + Register New Patient
        </button>
      </section>

      <section className="patient-search-panel">
        <label htmlFor="patient-search">Search Patients</label>

        <div className="patient-search-row">
          <input
            id="patient-search"
            type="search"
            placeholder="Search by patient name, MRN, or date of birth..."
            disabled
          />

          <button type="button" className="patient-search-button" disabled>
            Search
          </button>
        </div>

        <p className="patient-search-help">
          Patient search functionality will be connected to the patient
          database.
        </p>
      </section>

      <section className="patient-results">
        <div className="patient-results-header">
          <div>
            <h3>Patient Records</h3>
            <span>Patient list</span>
          </div>
        </div>

        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>MRN</th>
                <th>Date of Birth</th>
                <th>Sex</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              <tr className="patient-placeholder-row">
                <td colSpan="6">
                  <div className="patients-empty-state">
                    <div className="patients-empty-icon" aria-hidden="true">
                      👤
                    </div>

                    <strong>No patient records to display</strong>

                    <p>
                      Patient records will appear here when patient management
                      is connected.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}