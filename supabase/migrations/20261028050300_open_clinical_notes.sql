-- Let the app use clinical_notes (until now no policy allowed any access).
-- Case notes: the student writes drafts and submits; the case's instructor reviews.
-- Live-patient notes: staff only, for now.

grant select, insert, update on public.clinical_notes to authenticated;

create policy "Read notes on own or managed records"
on public.clinical_notes for select to authenticated
using (
    (assigned_case_id is not null and (private.is_case_student(assigned_case_id) or private.can_manage_case(assigned_case_id)))
    or (assigned_case_id is null and private.is_staff())
);

-- Students start a draft on their own open case.
create policy "Students create notes on own open case"
on public.clinical_notes for insert to authenticated
with check (
    author_id = auth.uid()
    and assigned_case_id is not null
    and private.is_case_student(assigned_case_id)
    and private.is_case_editable(assigned_case_id)
    and status = 'draft'
    and reviewed_by is null
);

-- Students edit their draft (or a returned note) and submit it for review.
-- They cannot finalize, sign as instructor, or edit after submitting.
create policy "Students edit own notes before review"
on public.clinical_notes for update to authenticated
using (
    author_id = auth.uid()
    and status in ('draft', 'revision_requested')
    and private.is_case_editable(assigned_case_id)
)
with check (
    author_id = auth.uid()
    and status in ('draft', 'pending_review')
    and reviewed_by is null
    and instructor_signed_at is null
    and finalized_at is null
);

-- The case's instructor (or staff, on live patients) writes and reviews notes.
create policy "Staff create notes"
on public.clinical_notes for insert to authenticated
with check (
    author_id = auth.uid()
    and (
        (assigned_case_id is not null and private.can_manage_case(assigned_case_id))
        or (assigned_case_id is null and private.is_staff())
    )
);

create policy "Staff review notes"
on public.clinical_notes for update to authenticated
using (
    (assigned_case_id is not null and private.can_manage_case(assigned_case_id))
    or (assigned_case_id is null and private.is_staff())
)
with check (
    (assigned_case_id is not null and private.can_manage_case(assigned_case_id))
    or (assigned_case_id is null and private.is_staff())
);
