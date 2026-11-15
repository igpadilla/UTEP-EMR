# Feature Spec — Front Desk + Live Simulation Workflow

> Implementation brief for Claude Code. Read the UTEP-EMR handoff doc first (stack, conventions, RLS patterns). This is a Vite/React SPA with manual `setNav` routing; never use URL routing or `"use client"`.

---

## 1. Summary

An instructor starts a **live, in-class simulation**. Each person gets one role for the whole simulation:

| Sim role | Who | Does |
|---|---|---|
| `patient_actor` | Instructor, TA, or student | Reads a private script, walks up to the front desk, plays the patient |
| `front_desk` | Student | Finds or registers the patient, verifies identity, records the room, then discharges and books follow-up |
| `med` | Student with a clinical role | Sees the checked-in log, opens their pre-assigned patient, documents with the existing case/notes flow, hands back |
| `observer` | Instructor / TA / staff | Live monitor dashboard while walking the room |

End-to-end flow per patient (an **encounter**):

```
expected ──► arrived ──► checked_in ──► in_progress ──► med_complete ──► discharged
 (front desk     (front desk      (assigned med    (med hands back)   (front desk releases
  finds record    verifies +       opens patient)                       + optional follow-up)
  or registers)   types room)
                                         any non-final state ──► cancelled (instructor only)
```

**Only the instructor controls ending.** At setup they pick an end mode:
- **Timer**: the sim ends at `ends_at`.
- **Workflow**: the sim ends automatically once every encounter is `discharged`/`cancelled`.

Either way, the monitor has a **Stop simulation** button that ends everything immediately. Front desk discharges patients but never ends the sim.

**Assignments (standard mode).** The instructor pre-builds the case mix before class:
- **x scheduled**: existing patients with an appointment
- **y walk-ins**: existing patients, no appointment
- **z new-patient walk-ins**: no record in the system; the actor carries a **walk-in ticket code**

Each encounter is pre-assigned to one med student. **Chaos mode** (no pre-assignment, pure walk-ins, any med claims) is a **future** feature. Add the `mode` column now, but implement only `standard`.

**After the sim ends,** every med case from it becomes gradable exactly like a normal case. Front-desk students get a review record too (§7).

**Expected length:** about 30 minutes or less. Keep the existing 30-min idle logout unchanged.

---

## 2. Design principles (follow existing conventions)

1. **Never touch live charts.** Simulation data lives in simulation tables and case copies (`assigned_cases.patient_snapshot`). Front desk "registration" and "verification" edits write to the encounter, never to `patients`.
2. **Reuse the case/notes flow for med.** When the assigned med student opens an encounter, create an `assigned_cases` row for them (same trigger path as normal assignment). Then send them to the existing case detail page. Do not build a second notes UI.
3. **State changes only through RPCs.** All status transitions go through `security definer` functions with `set search_path = ''`. They validate the current state, the caller's sim role, and that the sim is `active` and not past `ends_at`. Clients never `update` a status column directly.
4. **Realtime via Supabase Realtime** (`postgres_changes`) on simulation tables, filtered by `simulation_id`. RLS applies to Realtime, so the policies below also gate what each client receives.
5. **Audit everything.** Every transition and every lookup mistake writes a `simulation_events` row. That table is the timeline for the monitor and for grading.
6. **Don't touch Rooms.** Another team member owns Rooms. This feature uses only a free-text `room_label` column on the encounter. The UI shows a plain disabled placeholder ("Room selection coming soon") next to the text input. Do **not** create room tables, a `room_id` column, a `RoomPicker` component, or anything in Rooms code. Document the one integration point (`room_label` in `complete_check_in`) in a code comment for the Rooms team.
7. **Role is data, not session state.** Always read a user's sim role from `simulation_participants` when a board loads. Don't cache it in auth/profile state. Role switching mid-sim is planned for later; this keeps that change small.

---

## 3. Data model (new migrations, numbered after the latest existing file)

### 3.1 `simulations`
```
id uuid PK
course_id uuid FK courses
instructor_id uuid FK profiles(user_id)
title text not null
status text not null default 'draft'        -- draft | active | ended
mode text not null default 'standard'       -- standard | chaos (chaos reserved, not implemented)
end_mode text not null                      -- timer | workflow
duration_minutes int null                   -- required when end_mode = 'timer'
started_at timestamptz null
ends_at timestamptz null                    -- started_at + duration (server-set)
ended_at timestamptz null
ended_by uuid null FK profiles(user_id)
end_reason text null                        -- timer | workflow_complete | stopped
created_at timestamptz default now()
check (end_mode <> 'timer' or duration_minutes > 0)
```

### 3.2 `simulation_participants`
```
id uuid PK
simulation_id uuid FK simulations on delete cascade
user_id uuid FK profiles(user_id)
sim_role text not null           -- front_desk | med | patient_actor | observer
discipline text null             -- roles.role_name; required for med
instructor_feedback text null    -- post-sim review (front_desk; optionally actors)
rubric_scores jsonb null
reviewed_by uuid null FK profiles(user_id)
reviewed_at timestamptz null
unique (simulation_id, user_id)  -- one role per sim for now; role switching is future work
```

### 3.3 `simulation_encounters`
```
id uuid PK
simulation_id uuid FK simulations on delete cascade
template_id uuid FK patient_templates
patient_actor_id uuid FK profiles(user_id)
arrival_type text not null       -- scheduled | walk_in | new_patient
status text not null default 'expected'
  -- expected | arrived | checked_in | in_progress | med_complete | discharged | cancelled
scheduled_time time null                         -- required when arrival_type = 'scheduled'
ticket_code text null                            -- required when arrival_type = 'new_patient'
assigned_med_id uuid FK profiles(user_id)        -- required in standard mode; drives "Needs attention"
med_owner_id uuid null FK profiles(user_id)      -- who opened it (= assigned_med_id in standard mode)
assigned_case_id uuid null FK assigned_cases     -- created when med opens it
room_label text null                             -- free text; Rooms team integrates later
registration_data jsonb null     -- what front desk entered/verified
verification_flags jsonb null    -- fields front desk marked as mismatched/updated
follow_up_needed boolean null
follow_up_appointment_id uuid null FK appointments
arrived_at, checked_in_at, med_started_at, med_completed_at, discharged_at timestamptz null
checked_in_by, discharged_by uuid null FK profiles(user_id)
created_at timestamptz default now()
check (arrival_type <> 'scheduled'   or scheduled_time is not null)
check (arrival_type <> 'new_patient' or ticket_code is not null)
unique (simulation_id, ticket_code)
```
- `ticket_code`: server-generated, short and human-friendly (e.g. `W-4K7Q`; avoid ambiguous characters like 0/O and 1/I). The actor sees it on their view and can print it.
- `start_simulation` rejects a standard-mode sim if any encounter lacks `assigned_med_id` or `patient_actor_id`.

### 3.4 `simulation_roster_records` (the front-desk lookup space)
Every record front desk can find by searching: real ones and look-alike decoys.
```
id uuid PK
simulation_id uuid FK simulations on delete cascade
encounter_id uuid null FK simulation_encounters   -- null = decoy
decoy_of_record_id uuid null FK simulation_roster_records
demographics jsonb not null      -- name, DOB, sex, address, phone, insurance, MRN-like id, etc.
created_at timestamptz default now()
check ((encounter_id is null) = (decoy_of_record_id is not null))
```
- When an existing-patient encounter (`scheduled` / `walk_in`) is added, insert its real record (a snapshot of the linked patient/template demographics).
- **Decoys:** the builder offers "Add look-alike" per real record. It pre-fills a clone with 1–2 tweaked fields (same name with a different DOB, a one-letter name change, same DOB with a different middle name), and the instructor can edit it. Also offer "Auto-generate look-alikes for all" (1 per record).
- New-patient encounters have **no** roster record. Searching for them should find nothing, or only decoys.
- **Students never see `encounter_id` / `decoy_of_record_id`.** Front desk reads the roster only through `search_sim_roster`, which returns `id` + `demographics`.

### 3.5 `simulation_events`
```
id bigserial PK
simulation_id uuid FK
encounter_id uuid null FK
actor_id uuid FK profiles(user_id)
event_type text
  -- sim_started | arrived | wrong_record_selected | wrong_record_check_in_blocked |
  -- ticket_not_found | registered | checked_in | med_opened | med_complete |
  -- discharged | follow_up_booked | cancelled | sim_ended | cases_released_for_grading
payload jsonb
created_at timestamptz default now()
```

### 3.6 Changes to existing tables
- `patient_templates`: add `actor_script text null` and `script_discrepancies jsonb null`. The discrepancies are facts the actor will give that differ from the record (new address, new insurance), so verification can be graded.
- `assigned_cases`: add `simulation_id uuid null FK simulations`. Use it to hide sim cases from instructor review lists until the sim has ended, and to filter/badge them as "Simulation" in `InstructorCases.jsx`.
- `appointments`: add `assigned_case_id uuid null FK assigned_cases`. Extend the **one-owner check** so each row has exactly one of `patient_id` / `assigned_case_id`. Sim follow-ups use `assigned_case_id` and never land on a live patient.
- Verify `snapshot_patient_chart()` handles a template **without** `patient_id` (new-patient case). If not, have it fall back to template demographics.

### 3.7 Realtime
```sql
alter publication supabase_realtime add table
  public.simulations, public.simulation_encounters, public.simulation_events;
```
(Do not publish `simulation_roster_records`; it's read via RPC only.)

---

## 4. RPCs (all `security definer`, `set search_path = ''`)

Each RPC raises an exception on a wrong state, wrong role, an inactive sim, or `now() > ends_at`. Each writes a `simulation_events` row. Error messages shown to front desk must be **neutral** and must not reveal whether a record is a decoy.

| RPC | Caller | Transition / effect |
|---|---|---|
| `create_simulation(course_id, title, mode, end_mode, duration_minutes)` | staff | → `draft` |
| `set_sim_participants(sim_id, jsonb)` / `set_sim_encounters(sim_id, jsonb)` | staff | only while `draft`; encounters also create real roster records and ticket codes |
| `add_roster_decoy(sim_id, decoy_of_record_id, demographics)` / `generate_roster_decoys(sim_id)` / `delete_roster_decoy(id)` | staff | only while `draft` |
| `start_simulation(sim_id)` | staff | `draft → active`; sets `started_at`, `ends_at` |
| `search_sim_roster(sim_id, query)` | front_desk | Name/DOB search over roster records; returns `id` + `demographics` only |
| `select_roster_record(sim_id, record_id)` | front_desk | Real record whose encounter is `expected` → `arrived`, returns the encounter id and snapshot for verification. Decoy → logs `wrong_record_selected` and returns the decoy demographics for verification, so the student can still catch the mismatch |
| `register_new_patient(sim_id, ticket_code, registration_data)` | front_desk | Finds the `new_patient` encounter by `ticket_code` → `arrived`, stores `registration_data`. Unknown code → logs `ticket_not_found`, error "Ticket not found, re-check the code" |
| `complete_check_in(encounter_id, registration_data, verification_flags, room_label)` | front_desk | `arrived → checked_in`; notifies the assigned med student |
| `complete_check_in_from_record(record_id, …)` | front_desk | If the record is a decoy: reject with "Unable to check in this record, re-verify patient identity" and log `wrong_record_check_in_blocked`. *(Can be merged into `complete_check_in` if the UI passes the record id along.)* |
| `open_encounter(encounter_id)` | med; only the `assigned_med_id` in standard mode | `checked_in → in_progress`; creates `assigned_cases` for the caller (`simulation_id` set, `encounter_status = 'in progress'`); returns `assigned_case_id` |
| `complete_med_encounter(encounter_id)` | med owner | `in_progress → med_complete`. The case is **not** submitted yet; the student may keep finishing notes until the sim ends |
| `discharge_encounter(encounter_id, follow_up_needed, appointment jsonb null)` | front_desk | `med_complete → discharged`; optionally inserts the sim-owned appointment |
| `cancel_encounter(encounter_id)` | staff | any non-final → `cancelled` |
| `stop_simulation(sim_id)` | staff only | `active → ended` (`end_reason = 'stopped'`); the **Stop simulation** button |
| `expire_simulation(sim_id)` | any participant, only when `now() >= ends_at` | `active → ended` (`end_reason = 'timer'`); a mechanical timer close |

**Workflow end:** after `discharge_encounter` / `cancel_encounter`, call internal `private.check_workflow_complete(sim_id)`. If `end_mode = 'workflow'` and every encounter is final, it ends the sim with `end_reason = 'workflow_complete'`. This is the instructor's pre-chosen end condition firing, not a front-desk action.

**On end (all paths)**, internal `private.finalize_simulation(sim_id)`:
1. Sets every `assigned_cases` row with this `simulation_id` to `encounter_status = 'pending_review'`. Cases in any state are included: unfinished work is graded as-is.
2. Locks further edits: the existing case-edit checks should already block students once a case is `pending_review`, but verify this.
3. Logs `cases_released_for_grading`.

**Timer enforcement:** the server sets `ends_at`. Clients show a countdown. At expiry, any open client calls `expire_simulation`. All RPCs also reject actions past `ends_at`, so a stale tab can't keep working. pg_cron is optional.

**Helper functions** (in the `private` schema):
- `private.sim_role(sim_id uuid) returns text`: the caller's role in the sim, or null
- `private.is_sim_participant(sim_id uuid) returns boolean`
- `private.can_manage_sim(sim_id uuid) returns boolean`: admin, or the course instructor

---

## 5. RLS

Add the restrictive `private.is_active_account()` policy on all new tables.

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `simulations` | `can_manage_sim(id)` OR `is_sim_participant(id)` | staff only (or via RPCs) |
| `simulation_participants` | manager; own row; same-sim participants see the roster **without** review columns (use a view or RPC) | manager only |
| `simulation_encounters` | manager; front_desk + med in the same sim; patient_actor **only their own** row | none directly; RPCs only |
| `simulation_roster_records` | manager only; students go through `search_sim_roster` | manager only, while `draft` |
| `simulation_events` | manager; participants of the sim | none directly |
| `patient_templates.actor_script` | **only** the assigned actor and staff. Expose via RPC `get_my_actor_script(sim_id)`; never select it in student-facing template queries |
| `assigned_cases` (sim rows) | existing policies, plus: instructor review lists exclude rows where the linked sim is not `ended` |

- Med students reach their opened case through the existing `is_case_student` path.
- Front desk gets **no** access to clinical notes.
- The `ticket_code` column is visible only to the actor (own row) and staff. Front desk must get it from the actor.

---

## 6. Frontend

### 6.1 New nav keys / pages
| Page key | Component | Who |
|---|---|---|
| `simulationList` | `SimulationList.jsx` | Instructor: list/create sims per course |
| `simulationBuilder` | `SimulationBuilder.jsx` | Instructor: setup (see below) |
| `simulationMonitor` | `SimulationMonitor.jsx` | Instructor/observer: live board, timer, event feed, red **Stop simulation** button (staff only, confirm modal) |
| `simulationReview` | `SimulationReview.jsx` | Instructor, after end: links to each med case (normal grading flow) + front-desk review (§7) |
| `simulationLobby` | `SimulationLobby.jsx` | Student: "Active simulation in [course]" banner, role card, Join button → role page |
| `frontDeskSim` | `FrontDeskSimBoard.jsx` | front_desk |
| `medSim` | `MedSimBoard.jsx` | med |
| `patientActorSim` | `PatientActorView.jsx` | patient_actor |

The role page is chosen from `simulation_participants.sim_role` at load time (see §2.7).

Add an "Active simulation" banner on `Dashboard.jsx` / `StudentCourseDetail.jsx` when the user participates in a sim with `status = 'active'`.

### 6.2 Simulation builder
- **Settings:** title, end mode (timer + duration / workflow), mode (`standard`; `chaos` shown disabled "Coming soon").
- **Participants:** pick course students and staff, and assign one role each.
- **Case mix:** three groups, **Scheduled (x)**, **Walk-in, existing (y)**, and **Walk-in, new patient (z)**, with running totals. Each row has a template, a patient actor, an assigned med student, a `scheduled_time` (scheduled rows only), and a ticket code (new-patient rows; auto-generated, read-only).
- **Look-alikes:** under each existing-patient row, list its decoys with Add / Edit / Delete. A top-level "Auto-generate look-alikes" button covers all rows.
- **Validation before Start:** every row has an actor + med student, new-patient templates have no linked live patient, and each person has only one role.
- **Print actor cards** (optional, nice-to-have): one printable card per actor with patient name and ticket code.

### 6.3 Front Desk board (`FrontDeskSimBoard.jsx`)
Three panes:
1. **Arrivals / Check-in**
   - "Expected today" list: **scheduled encounters only**, sorted by `scheduled_time`. Walk-ins are not listed.
   - **Patient lookup:** `search_sim_roster` by name/DOB. Results include look-alikes, styled identically. Selecting one → `select_roster_record` → verification screen.
   - **Verify step:** the record next to editable fields. The student confirms or updates each field. Changes are stored in `registration_data`, and mismatches in `verification_flags`.
   - **New patient:** a "New patient (walk-in ticket)" button opens the registration form (reuse the field set from front-desk patient registration) plus a **ticket code** field → `register_new_patient`.
   - **Room:** a plain disabled placeholder ("Room selection coming soon") + a `room_label` text input. Nothing else related to rooms.
   - **Check in** button → `complete_check_in`.
2. **Room log:** every checked-in encounter, its `room_label`, and its status. Rows in `med_complete` show a highlighted **"Patient X finished, ready for discharge"**.
3. **Discharge:** on a finished row, **Release patient**, plus a follow-up toggle that opens the appointment form (sim-owned) → `discharge_encounter`.

### 6.4 Med board (`MedSimBoard.jsx`)
- A log of `checked_in` + `in_progress` encounters: patient name, room, checked-in time, live wait time, status.
- **"Needs attention"** badge: **only** on `checked_in` encounters where `assigned_med_id = me`, sorted to the top. Other students' patients are visible for context, with no badge and no button.
- **Toast + badge count** when **my** assigned patient becomes `checked_in` ("Jane D. is ready, Room 3").
- **See patient** (my patients only) → `open_encounter` → `setNav({ page: 'caseDetail', id: assignedCaseId, fromSim: simId })`. The existing case detail and notes flow takes over.
- In case detail, when `nav.fromSim` is set: a **"Hand back to front desk"** button → `complete_med_encounter`, then return to `medSim`. Notes stay editable until the sim ends.

### 6.5 Patient actor view (`PatientActorView.jsx`)
- Shows the script (`get_my_actor_script`), the patient's demographics (what to say at the desk), and the **ticket code**, shown large, for new-patient encounters.
- Shows a live status prompt: "Go to front desk" → "Waiting: Room 3" → "With provider" → "Return to front desk" → "Done".

### 6.6 Instructor monitor (`SimulationMonitor.jsx`)
- Kanban-style columns by status, a timer, the event feed (lookup mistakes highlighted), per-encounter elapsed times, and the **Stop simulation** button.
- Must be readable on a tablet or phone; the instructor walks the room with it.

### 6.7 Services
- `frontend/src/services/simulationService.js`: RPC wrappers + `subscribeToSimulation(simId, onChange)`. That function opens one Realtime channel on `simulations`, `simulation_encounters`, and `simulation_events` filtered by `simulation_id`. It returns an unsubscribe function; always clean up in `useEffect`.
- Leave session security (30-min idle logout, 60-sec account recheck) unchanged.

---

## 7. Grading (after the sim ends)

**Med:** each opened case moves to `pending_review` and appears in the normal instructor review flow (`InstructorCases.jsx`, rubric, feedback, `revision_requested` / `completed`), badged "Simulation".

**Front desk:** `SimulationReview.jsx` shows each front-desk student's:
- a timeline from `simulation_events` (door-to-check-in, discharge turnaround)
- lookup accuracy: `wrong_record_selected`, `wrong_record_check_in_blocked`, `ticket_not_found` counts
- verification accuracy: `verification_flags` vs `patient_templates.script_discrepancies`
- registration accuracy for new patients: `registration_data` vs template demographics
- the follow-up bookings made

The instructor enters `instructor_feedback` + `rubric_scores` on `simulation_participants`.

**Sim-wide metrics** (shown on the review page): check-in-to-provider wait and med encounter length per encounter.

---

## 8. Implementation phases

1. **Migrations + RPCs + RLS**, with PGlite tests for every transition: happy path, wrong role, wrong state, expired timer, inactive account, a decoy selected / check-in blocked, a bad ticket code, a non-assigned med trying to open a patient, and finalize-on-end.
2. **Instructor**: `SimulationList`, `SimulationBuilder` (case mix + look-alikes), `SimulationMonitor`.
3. **Front desk**: lookup, verify, new patient by ticket, check-in.
4. **Med**: board, notifications, open → case detail, hand back.
5. **Patient actor view + discharge/follow-up**.
6. **End conditions + finalize**: timer, workflow auto-end, Stop button, case release for grading, read-only boards after end.
7. **Review**: `SimulationReview`, plus the "Simulation" badge/filter in `InstructorCases`.
8. **Playwright**: a multi-context test where instructor, front desk, med, and actor run in four browser contexts. It covers one scheduled, one walk-in (including a decoy mis-select), and one new-patient encounter end-to-end, checking realtime updates in each.

## 9. Acceptance criteria
- [ ] Nothing in `patients`, live `vital_sign_sets`, live `appointments`, etc. changes during a sim.
- [ ] No Rooms tables, columns, or components are created or modified; only `room_label` + a disabled placeholder.
- [ ] Front desk can check in scheduled patients, existing walk-ins (via lookup), and new patients (via ticket code).
- [ ] Look-alike records appear in lookup indistinguishable from real ones. Selecting or checking in a decoy is logged and blocked with a neutral message.
- [ ] Med sees their own patient's check-in within ~2s without refreshing, with room and a "Needs attention" flag. Other students' patients can't be opened.
- [ ] Opening a patient uses the standard case/notes flow; hand-back shows "Patient X finished" to front desk in real time.
- [ ] Front desk can release and optionally book a sim-scoped follow-up.
- [ ] Timer mode ends at `ends_at`; workflow mode ends automatically when the last encounter is final; the Stop button ends it at any time; no student action can end the sim.
- [ ] On end, all sim cases move to `pending_review`, become gradable in the normal flow, and are hidden from review lists before then.
- [ ] Front-desk students have a reviewable record with feedback + rubric.
- [ ] Actor scripts and ticket codes are visible only to the assigned actor and staff.
- [ ] All new tables have the restrictive active-account policy.

---

## 10. Decisions (confirmed)

- **Ending:** instructor-only. Timer or workflow mode, chosen at setup, plus a Stop button.
- **Assignments:** standard mode pre-assigns every encounter to one med student; "Needs attention" shows only to that student. Chaos mode is future work (`simulations.mode` reserved).
- **One med owner per encounter.**
- **Case mix is pre-built:** x scheduled, y existing walk-ins, z new-patient walk-ins. Front desk never creates encounters.
- **New patients are linked by walk-in ticket code** carried by the actor.
- **Look-alike decoys** are included in the lookup roster.
- **Rooms:** typed `room_label` only. Touch nothing else; Rooms is owned by another team member.
- **One role per person per sim.** Mid-sim role switching is future work; keep the role as data (§2.7).
- **Grading:** after the sim ends, med cases are graded like normal cases; front desk gets a review record.
- **Idle logout:** unchanged. Sims are expected to run about 30 minutes or less.

## 11. Future work (out of scope now)
- Chaos mode (no assignments, pure walk-ins, any med can claim)
- Switching roles within a simulation
- Multi-discipline hand-offs on one encounter
- Rooms integration (owned by the Rooms team, via `room_label` → their model)
