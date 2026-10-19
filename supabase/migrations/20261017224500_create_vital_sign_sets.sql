-- Vital sign sets for a live patient or for a student's assigned case.
-- Rows are never edited or deleted:
--   * a correction is a NEW row that points to the old one (supersedes_id)
--   * a mistake is marked 'entered_in_error' with a reason
create table public.vital_sign_sets (
    id uuid primary key default gen_random_uuid(),

    -- Each set belongs to a live patient OR an assigned case, never both.
    patient_id uuid references public.patients(id) on delete restrict,
    assigned_case_id uuid references public.assigned_cases(id) on delete restrict,
    constraint vital_sign_sets_one_owner check (
        (patient_id is null) <> (assigned_case_id is null)
    ),

    care_setting text not null default 'outpatient'
        check (care_setting in ('outpatient', 'inpatient')),

    -- 'baseline' = loaded from an instructor's case, 'recorded' = entered by a user
    source text not null default 'recorded'
        check (source in ('baseline', 'recorded')),

    measured_at timestamptz not null default now(),
    recorded_at timestamptz not null default now(),
    recorded_by uuid not null default auth.uid()
        references public.profiles(user_id) on delete restrict,

    -- Measurements in US units. All optional so a partial set can be saved.
    systolic_bp   smallint     check (systolic_bp between 40 and 300),
    diastolic_bp  smallint     check (diastolic_bp between 20 and 200),
    heart_rate    smallint     check (heart_rate between 20 and 300),
    resp_rate     smallint     check (resp_rate between 4 and 80),
    temperature_f numeric(4,1) check (temperature_f between 86 and 113),
    spo2          smallint     check (spo2 between 50 and 100),
    oxygen        text,        -- e.g. 'Room air', '2 L nasal cannula'
    weight_lb     numeric(5,1) check (weight_lb between 1 and 1100),
    height_in     numeric(4,1) check (height_in between 8 and 102),
    bmi           numeric generated always as
                      (round(703 * weight_lb / (height_in * height_in), 1)) stored,
    pain_score    smallint     check (pain_score between 0 and 10),
    comment       text,

    -- Corrections and errors
    supersedes_id uuid references public.vital_sign_sets(id),
    status text not null default 'active'
        check (status in ('active', 'entered_in_error')),
    correction_reason text,

    -- A correction or an error always needs a reason.
    constraint vital_sign_sets_reason_required check (
        (supersedes_id is null and status = 'active')
        or correction_reason is not null
    )
);

create index idx_vital_sign_sets_patient
    on public.vital_sign_sets(patient_id, measured_at desc);

create index idx_vital_sign_sets_case
    on public.vital_sign_sets(assigned_case_id, measured_at desc);

-- A set can only have one active correction (stops two people correcting at once).
create unique index idx_vital_sign_sets_one_correction
    on public.vital_sign_sets(supersedes_id)
    where supersedes_id is not null and status = 'active';


-- --------------------------------------------------
-- Access
-- --------------------------------------------------

alter table public.vital_sign_sets enable row level security;

-- Nobody can delete or truncate, and only status + reason can ever be updated.
revoke all on public.vital_sign_sets from anon;
revoke update, delete, truncate on public.vital_sign_sets from authenticated;
grant update (status, correction_reason) on public.vital_sign_sets to authenticated;

-- Read live-patient vitals: clinical roles with vitals.read, plus instructors and admins.
create policy "Read vitals on live patients"
on public.vital_sign_sets for select to authenticated
using (
    patient_id is not null
    and (
        public.has_permission('vitals.read')
        or exists (
            select 1 from public.profiles
            where user_id = auth.uid()
              and account_type in ('admin', 'instructor')
        )
    )
);

-- Read case vitals: the student on the case and the instructor who assigned it.
create policy "Read vitals on own cases"
on public.vital_sign_sets for select to authenticated
using (
    exists (
        select 1 from public.assigned_cases ac
        where ac.id = assigned_case_id
          and (ac.student_id = auth.uid() or ac.assigned_by = auth.uid())
    )
);

-- Record vitals: needs vitals.write, and case vitals only on your own case.
create policy "Record vitals"
on public.vital_sign_sets for insert to authenticated
with check (
    recorded_by = auth.uid()
    and source = 'recorded'
    and status = 'active'
    and public.has_permission('vitals.write')
    and (
        patient_id is not null
        or exists (
            select 1 from public.assigned_cases ac
            where ac.id = assigned_case_id
              and ac.student_id = auth.uid()
        )
    )
);

-- Mark your own entry as entered in error (the only update allowed).
create policy "Mark own vitals entered in error"
on public.vital_sign_sets for update to authenticated
using (recorded_by = auth.uid() and status = 'active')
with check (status = 'entered_in_error');


-- --------------------------------------------------
-- Current vitals: active sets that have not been corrected
-- --------------------------------------------------

create view public.current_vital_sign_sets
with (security_invoker = true) as
select v.*
from public.vital_sign_sets v
where v.status = 'active'
  and not exists (
      select 1 from public.vital_sign_sets newer
      where newer.supersedes_id = v.id
        and newer.status = 'active'
  );
