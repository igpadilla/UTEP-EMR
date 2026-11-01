# Patient portal

The first version follows the customer's view-only portal request: recorded medications/prescriptions, released lab results, and the latest released visit summary. Patient accounts use the existing sign-in page and first-login password change. They go straight to the portal instead of the staff/student dashboard. Profile information is read-only.

## Try it locally

1. Start Docker Desktop, then run `npm run dev` from the repository. The existing startup script applies pending **local** migrations and serves Edge Functions. This feature adds `20261031000000_patient_portal.sql` and the `create-patient-account` function.
2. Sign in as an admin. Open **Patients**, choose an existing simulated patient, then find **Patient portal** on the patient detail page.
3. Enter a patient sign-in email and a temporary password of at least 8 characters including a letter and a number. Keep a secure copy before selecting **Create patient portal access**. Existing staff/student emails cannot be converted or reused. Each patient has one portal login.
4. Admins can deactivate/reactivate portal access on the same panel. This keeps the patient records and account identity.
5. Admins/instructors can expand **Share a lab result** or **Share a visit summary** on that page. A summary must refer to an existing visit. Enter the exact patient-facing summary; internal visit notes are never copied automatically. The newest released visit is shown, even if a newer visit remains private.
6. Sign out, sign in with the new patient credentials, and change the temporary password. Check **My Health**, **Medications & Prescriptions**, **Lab Results**, **Last Visit Summary**, and **My Profile**.

The lab form releases a result immediately. Database-imported lab results stay private while `released_at` is null or in the future. Existing visits remain private until a summary is explicitly released. This also means an existing patient's portal may correctly have empty labs/visits at first.

## Access and data

- `patient_portal_accounts` links an Auth/profile account to exactly one patient. Clients cannot read or change these links directly. Only the server can finalize a new account, and only admins can create accounts or toggle access.
- `get_my_patient_portal()` accepts **no patient ID**. It checks the current account type and active status and returns an explicit list of patient-facing fields. It does not expose grades, answer keys, cases, staff notes, insurance details, or other patients.
- Patient accounts cannot access existing staff/course/clinical tables, even if a clinical role or course enrollment is accidentally left attached. Medication data is read from the existing patient's `current_medications`, without adding a second medication store.
- `patient_lab_results` is new because development did not have a lab-results table. Staff manage it; portal users receive only their released results through the checked function.
- A recorded medication does not imply a separate signed prescription. Prescription-specific information appears only when it is present in the existing list. Missing dosage, instructions, and prescriber information is labelled **Not recorded**, rather than invented.
- Results and summaries are displayed as entered. No clinical interpretation, scheduling, refill requests, record editing, or notification/read tracking is added.
- The existing 30-minute inactivity sign-out remains in effect. Server access is revoked as soon as an account is deactivated; the app's existing account recheck returns it to sign-in.

## Deployment

The shared Supabase project needs the migration and `create-patient-account` Edge Function deployed before using these pages there. Code changes alone do not install database functions. Use the team's normal migration/deployment process; this work does not deploy or push automatically.

## Verification

`npm test` includes migration replay, two-patient isolation, released-versus-private data, blocked patient writes, staff-only release, admin-only account management, deactivation/reactivation, and account-creation error handling. `npm run test:ui` includes the existing suites plus the real React sign-in/password-change/portal flow against an intercepted test API, including empty results, connection retries, mobile layout and sign-out. The browser tests do not change a shared Supabase project.
