-- Clinical records are never hard deleted: patients are archived instead
alter table public.patients add column archived_at timestamptz;

create function public.prevent_patient_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
    raise exception 'Patients cannot be deleted. Archive the patient instead.';
end;
$$;

create trigger patients_no_delete before delete on public.patients
    for each row execute function public.prevent_patient_delete();
