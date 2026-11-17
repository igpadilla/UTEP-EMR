-- Merge sim_case_sign_off (20261102090005) with add_case_note_addendums (20261116000000).
-- The addendum migration's CREATE OR REPLACE dropped the simulation carve-out that lets
-- med students sign off a sim case directly to 'completed' without the pending_review step.

create or replace function private.guard_student_case_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    old_addendums jsonb := coalesce(old.addendums, '[]'::jsonb);
    new_addendums jsonb := coalesce(new.addendums, '[]'::jsonb);
    old_len int := jsonb_array_length(old_addendums);
    new_len int := jsonb_array_length(new_addendums);
    added_entry jsonb;
    is_sim_case bool;
begin
    -- Admins, the case's instructor, and server code (no signed-in user) are not limited here.
    if auth.uid() is null or private.can_manage_case(old.id) then
        return new;
    end if;

    -- Determine if this is a simulation case (referenced by any simulation_encounter).
    select exists (
        select 1 from public.simulation_encounters
        where assigned_case_id = old.id
    ) into is_sim_case;

    -- Case 1: Appending an addendum to a signed-off (completed) case or a case in addendum revision.
    if old.encounter_status = 'completed' or (old.encounter_status = 'revision_requested' and old_len > 0) then
        if new.encounter_notes is distinct from old.encounter_notes then
            raise exception 'Signed clinical notes are immutable and cannot be modified. Please add an addendum instead.';
        end if;

        if new.encounter_status <> 'pending review' then
            raise exception 'Submitting an addendum must place the case in pending review.';
        end if;

        if new_len <> old_len + 1 then
            raise exception 'Students may only append one new addendum at a time.';
        end if;

        if old_len > 0 and (
            select bool_or(new_addendums->i is distinct from old_addendums->i)
            from generate_series(0, old_len - 1) as i
        ) then
            raise exception 'Existing addendums are immutable and cannot be modified or removed.';
        end if;

        added_entry := new_addendums->(new_len - 1);
        if jsonb_typeof(added_entry) <> 'object'
           or length(trim(coalesce(added_entry->>'content', ''))) = 0 then
            raise exception 'Addendum entry must include non-empty clinical content.';
        end if;

        if (to_jsonb(new) - 'addendums' - 'encounter_status' - 'updated_at')
           is distinct from (to_jsonb(old) - 'addendums' - 'encounter_status' - 'updated_at') then
            raise exception 'Students can only append an addendum to a signed case.';
        end if;

        return new;
    end if;

    -- Case 2: Standard initial encounter workflow (before first sign-off).
    if old.encounter_status not in ('not started', 'in progress', 'revision_requested') then
        raise exception 'This case was submitted and can no longer be changed.';
    end if;

    if new_addendums is distinct from old_addendums then
        raise exception 'Addendums can only be added after a note has been signed off.';
    end if;

    -- Status transition rules.
    if new.encounter_status is distinct from old.encounter_status then
        if new.encounter_status = 'completed' and is_sim_case then
            -- Simulation sign-off: instructor is present, allow direct completion.
            null;
        elsif new.encounter_status not in ('in progress', 'pending review') then
            raise exception 'Students can only start or submit a case.';
        end if;
    end if;

    -- Every other column must stay the same (score, feedback, archive, student, course...).
    if (to_jsonb(new) - 'encounter_notes' - 'encounter_status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'encounter_notes' - 'encounter_status' - 'updated_at') then
        raise exception 'Students can only change their case notes.';
    end if;

    return new;
end;
$$;
