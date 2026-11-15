-- Allow med students to sign off a simulation case directly to 'completed',
-- bypassing the normal pending_review step. The instructor is present during
-- the simulation so no async review is needed.
--
-- A "simulation case" is one referenced by simulation_encounters.assigned_case_id.

create or replace function private.guard_student_case_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Admins, the case's instructor, and server code (no signed-in user) are not limited here.
    if auth.uid() is null or private.can_manage_case(old.id) then
        return new;
    end if;

    if old.encounter_status not in ('not started', 'in progress', 'revision_requested') then
        raise exception 'This case was submitted and can no longer be changed.';
    end if;

    -- Simulation cases: allow 'completed' directly (instructor is present).
    -- Regular cases: only 'in progress' or 'pending review'.
    if new.encounter_status is distinct from old.encounter_status then
        if new.encounter_status = 'completed'
           and exists (
               select 1 from public.simulation_encounters
               where assigned_case_id = old.id
           ) then
            -- simulation sign-off — allowed
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
