# Patient chart: demographics, allergies, and history

## What changed

This work builds on `feature/patient-vitals` at commit `78828d5`. It fills the existing Summary and Allergies & History tabs, using the same patient fields that the older patient pages use.

- Summary shows name, age, date of birth, sex, occupation, phone, email, address, and emergency contacts.
- Allergies & History shows the saved allergies and medical conditions.
- Active admins and instructors can edit these sections on live patient charts, matching the existing patient-editing policy. The database still makes the final access decision.
- Assigned-case charts read the saved `patient_snapshot`. These demographics and lists are read-only, including when an instructor opens a case chart. No patient or case records are changed by viewing a case.
- Existing Vitals and Referrals components keep their behavior, including the submitted-case lock.
- Missing data is labeled as not recorded. An empty allergy list is not presented as a confirmed absence of allergies.

The older detail pages stay available while the other chart tabs are completed. Notes, Medications, and Visits remain with their existing owners; this change does not move those workflows.

## Saving and canceling

Demographic saves update only demographic/contact fields. Allergy/history saves update only those two lists. Both update the patient's `updated_at` value.

The primary emergency contact can be edited. Other contacts and extra contact properties are preserved. The chart header updates after a successful save. Cancel leaves saved data unchanged.

The save also checks the `updated_at` value read when the chart loaded. If another person updated the record, or access changed, the form reports that it could not save. The user can cancel, refresh the chart, and reopen the form. A failed save retains the entered text. Chart navigation is disabled while editing, until Save or Cancel is used.

Allergy/history edits use one item per line. Blank lines and repeated entries are removed; commas inside an item are kept. An empty list clears the recorded items.

## Files

- `frontend/src/pages/PatientChart.jsx`: loads chart data, shows tabs, handles notices, and updates the header after saves.
- `frontend/src/pages/PatientChart.css`: chart cards, forms, keyboard focus styles, and responsive layouts.
- `frontend/src/components/patient-chart/PatientSummary.jsx`: demographic display and edit form.
- `frontend/src/components/patient-chart/PatientAllergiesHistory.jsx`: allergy/history display and edit form.
- `frontend/src/components/patient-chart/patientChartForm.js`: form values, validation, and section-specific update payloads.
- `frontend/src/services/patientChartService.js`: chart reads and live-patient saves through Supabase.
- `frontend/src/App.jsx`: supplies the existing account-role edit flag and resets chart state when the patient/case changes.

No new database migrations or Python endpoints are required for these fields. The migrations from the underlying patient-vitals branch still need to be present when running that branch's Vitals/Referrals features.

## Verification

Use Node.js 22.20 or newer for the tests. From the repository root:

```bash
npm ci
npm --prefix frontend ci
npm test
npm run test:ui
npm --prefix frontend run build
```

Browser checks use Edge on Windows. On other platforms, run `npx playwright install chromium` first. `PLAYWRIGHT_CHANNEL` can select another installed browser channel.

The focused tests cover validation, preserving other sections and emergency contacts, case-snapshot reads, guarded saves, and load/save errors. Browser checks mount the real PatientChart component on a test page with intercepted Supabase responses. They cover edit/save/cancel, retained input after failures, changed-record conflicts, updated allergy banners, keyboard tab navigation, mobile layout, role-based edit controls, and case-copy locks. Screenshots are saved under `.cache/patient-chart/` and are not committed.

These checks do not log into or modify the hosted project. Docker Desktop was not running, so a real local Supabase/Auth integration check remains before release.

For that check, open a patient's existing detail page, choose Open chart, save edits in each completed tab, reopen/refresh, and verify the same saved data appears. As a student, open an assigned case and verify it shows its saved copy with no demographic/history edit controls. Verify the Supabase patient policies reject direct student updates.

## Earlier work

The separate student-management/grading work is preserved in local commit `98df90a` on `codex/student-management-improvements`. It is not included in this patient-chart branch. No branches were deleted and nothing was pushed or deployed.

For the combined version, use `codex/sprint3-integration`. That branch includes both features and development through `52d9e60`; see `docs/SPRINT3_INTEGRATION.md`.
