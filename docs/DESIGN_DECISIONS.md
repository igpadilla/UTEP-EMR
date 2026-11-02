# Design Decisions

Log of architectural and technical decisions made for the UTEP-EMR project.

---

## Decision Record Template

### ADR-XXX: [Title]
- **Status**: [Proposed | Accepted | Superseded]
- **Date**: YYYY-MM-DD
- **Context**: [Background]
- **Decision**: [What was chosen]
- **Consequences**: [Impact and trade-offs]

---

### ADR-001: Instructor feedback is optional
- **Status**: Accepted
- **Date**: 2026-10-01
- **Context**: Instructors needed a way to leave comments when signing off or returning a case.
- **Decision**: Added a text column for feedback on assigned cases.
- **Consequences**: Instructors can submit without writing anything, which keeps the flow fast for straightforward sign-offs.

---

### ADR-002: Rubric is plain text, not a structured format
- **Status**: Accepted
- **Date**: 2026-10-01
- **Context**: We needed a place for instructors to define what they expect students to document.
- **Decision**: Added a single free-text field to the template for grading notes and expectations.
- **Consequences**: Simple to implement and flexible. A more structured rubric builder can be added later if needed.

---

### ADR-003: Clinical roles are separate from account types
- **Status**: Accepted
- **Date**: 2026-10-03
- **Context**: Students need discipline roles, such as Pharmacy, Nursing, and Physical Therapy, while retaining their student account type.
- **Decision**: Assign clinical roles separately from account types, link roles to permissions, and check capabilities through `has_permission()`.
- **Consequences**: Supports multiple disciplines per user and workflows such as PT SOAP notes. Existing access policies remain and permission-based database enforcement is still needed.

---

### ADR-004: Hybrid local rules engine and openFDA for medication safety checks
- **Status**: Accepted
- **Date**: 2026-10-23
- **Context**: We needed to check drug interactions, allergies, duplicates, and doses in real time. Commercial drug APIs are expensive, free ones like NIH RxNav discontinued their interaction endpoints, and openFDA alone only gives raw label text rather than structured severity ratings.
- **Decision**: Built a hybrid in FastAPI: a local rules engine backed by curated JSON files (`formulary.json`, `interactions.json`, `allergies.json`) for 139 common drugs, paired with an openFDA integration to fetch official FDA boxed warnings and drug labels on demand.
- **Consequences**: Classroom simulation traps trigger instantly and reliably with zero API fees, while students can still pull live official FDA warnings. The curated rules are starter educational content, so clinical faculty will still review them before using them for formal grading.

---

### ADR-005: Hybrid FastAPI rules engine and Supabase storage for Labs & Imaging
- **Status**: Accepted
- **Date**: 2026-10-31
- **Context**: We needed an easy way to order labs and imaging, flag abnormal test values automatically, and allow file uploads for reports and scans. We also needed live patients and student case copies to stay separate.
- **Decision**: Put the test catalog and reference-range math in FastAPI (`/api/diagnostics/*`), and store orders, structured results, and PDF/image files in Supabase. A database trigger copies baseline orders and results into newly assigned cases.
- **Consequences**: Fast auto-flagging of lab values with no database changes needed to update test ranges. Students work safely on their own case copy without altering real patient charts, and tests can still run offline with bundled fallback data.
