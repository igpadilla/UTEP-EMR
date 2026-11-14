# HIPAA Readiness

Checklist of what the EMR does to protect patient health information (PHI), what is postponed, and what must happen before real patient data is stored.

> **Until a BAA is signed with Supabase, only test patients may be stored.** All patients are treated as test patients for now.

---

## In place

| Safeguard | How it works | Where |
| --- | --- | --- |
| Unique user accounts and role-based access | Every user has their own login; Row Level Security limits what each role can read or change. | `supabase/migrations` |
| Automatic logoff | Signed out after 30 minutes idle, with a 2-minute warning. | `frontend/src/App.jsx` |
| No leftover screens between users | Signing out or switching accounts returns to the Dashboard and clears the previous user's access. | `frontend/src/App.jsx` |
| Records are never hard deleted | Patients are archived (`archived_at`) instead of deleted; a database trigger blocks every patient delete. Vitals are corrected with a reason, never edited or deleted. | `20261113230000_archive_patients_instead_of_delete.sql` |
| Audit trail of changes | Database triggers log every insert, update, and delete on patient data tables and on accounts (`profiles`, `profile_roles`) to `phi_audit_log`: who, when, which record, which patient, and which fields changed (names only, no values). Saves that change nothing are skipped. | `20261114000000_create_phi_audit_log.sql`, `20261114000200_audit_account_changes.sql`, `20261114000400_audit_result_patient.sql` |
| Audit trail of views | Opening a patient record, a case chart, or a lab/imaging attachment is logged as `VIEW` under the viewer's account. | `20261114000100_log_record_views.sql`, `20261114000300_log_attachment_views.sql`, `frontend/src/services/auditService.js` |
| Who made account changes | Edge functions (service role) record the signed-in admin or instructor who made each account change (`ACCOUNT_CREATED`, `ACCOUNT_DEACTIVATED`, `EMAIL_CHANGED`, …). | `supabase/functions/_shared/audit.mjs` |
| Tamper-proof log | Nobody, including the service role, can edit or delete `phi_audit_log`. Only admins can read it. | `20261114000000_create_phi_audit_log.sql` |
| Log review | Admin-only **Audit Log** page with search, action, and date filters. | `frontend/src/pages/AuditLog.jsx`, `20261114000500_get_phi_audit_log.sql` |
| Private file storage | Lab/imaging attachments are in a private bucket; download links expire after 60 seconds. | `frontend/src/services/diagnosticsService.js` |
| Supabase sign-ins | Sign-ins, failed attempts, and sign-outs are recorded by Supabase in `auth.audit_log_entries`. | Supabase Auth |

## Postponed until development is done

These make testing harder, so they are turned on before launch.

- **Stronger passwords** (8+ characters with a letter and a number, everywhere). Saved in a git stash: `git stash list`, then `git stash pop` the entry named "HIPAA: password policy (later)". Also set the same rule in the hosted dashboard: Authentication → Sign In / Providers → Password.
- **Multi-factor authentication (MFA)**, at least for admins and instructors: an authenticator-app setup screen and a code step at login. Enable TOTP in `supabase/config.toml` (`[auth.mfa.totp]`) and in the hosted project.

## Team rules

- Never `console.log` patient, case, or form objects. Log a short message and the error only.
- Do not add error tracking or analytics (Sentry, LogRocket, etc.) unless patient data is scrubbed from what it sends and the vendor signs a BAA.
- Do not hard delete clinical records. Archive or mark them instead.
- New tables that hold patient data need the audit trigger:
  ```sql
  create trigger audit_<table> after insert or update or delete on public.<table>
      for each row execute function private.log_phi_change();
  ```
- New screens that show a patient's record or files should call `logRecordView(...)` from `auditService.js`.
- Never put patient details in URLs, emails (invites, password resets), or edge function logs.

## Before storing real patient data

- [ ] Supabase: Team or Enterprise plan, signed BAA, HIPAA add-on, project set to **High Compliance**, connection logging (`log_connections`) left on, and the Security Advisor clean. See [Supabase HIPAA projects](https://supabase.com/docs/guides/platform/hipaa-projects).
- [ ] Confirm hosting (Vercel) HIPAA terms, or move hosting to a provider that signs a BAA.
- [ ] Turn on the postponed items above (passwords, MFA).
- [ ] Run the Supabase Security Advisor and fix anything flagged (check RLS on `clinical_notes`, `clinical_note_templates`, `permissions`, `role_permissions`).
- [ ] Retention plan: HIPAA documentation is kept for 6 years; the audit log cannot be trimmed, so plan storage and backups.
- [ ] Assign who reviews the Audit Log and how often.
- [ ] Administrative work: risk assessment, access and security policies, breach-notification plan, staff training, BAAs with every vendor that touches PHI.

## Optional improvements

- Store old values of changed fields in the audit log (record history the client requirements mention).
- Link case-copy views to the original patient in the log entry itself.
- Unarchive patients from the app (today only through Supabase Studio).