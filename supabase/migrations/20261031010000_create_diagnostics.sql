create table public.diagnostic_orders (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid references public.patients(id) on delete cascade,
    case_id uuid references public.assigned_cases(id) on delete cascade,
    constraint diagnostic_orders_one_owner check (
        (patient_id is null) <> (case_id is null)
    ),
    category text not null check (category in ('lab', 'imaging')),
    test_code text not null,
    test_name text not null,
    coding_system text not null default 'LOINC' check (coding_system in ('LOINC', 'CPT')),
    clinical_code text not null,
    specimen_or_modality text,
    priority text not null default 'routine' check (priority in ('routine', 'urgent', 'stat')),
    status text not null default 'ordered' check (status in ('ordered', 'in_progress', 'completed', 'cancelled')),
    clinical_indication text not null,
    notes text,
    source text not null default 'ordered' check (source in ('baseline', 'ordered')),
    ordered_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index idx_diagnostic_orders_patient on public.diagnostic_orders(patient_id, created_at desc);
create index idx_diagnostic_orders_case on public.diagnostic_orders(case_id, created_at desc);

create table public.diagnostic_results (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.diagnostic_orders(id) on delete cascade,
    structured_values jsonb not null default '[]'::jsonb,
    report_findings text,
    report_impression text,
    overall_flag text not null default 'normal' check (overall_flag in ('normal', 'abnormal', 'critical')),
    file_path text,
    file_name text,
    file_mime_type text,
    file_size_bytes integer check (file_size_bytes is null or file_size_bytes > 0),
    resulted_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
    resulted_at timestamptz not null default now()
);

create index idx_diagnostic_results_order on public.diagnostic_results(order_id, resulted_at desc);

alter table public.diagnostic_orders enable row level security;
alter table public.diagnostic_results enable row level security;

create policy "Read diagnostic orders on own or managed records"
on public.diagnostic_orders for select to authenticated
using (
    (case_id is not null and (private.is_case_student(case_id) or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
);

create policy "Create diagnostic orders on own or managed records"
on public.diagnostic_orders for insert to authenticated
with check (
    ordered_by = auth.uid()
    and (
        (case_id is not null and (
            (private.is_case_student(case_id) and private.is_case_editable(case_id))
            or private.can_manage_case(case_id)))
        or (case_id is null and private.is_staff())
    )
);

create policy "Update diagnostic orders on own or managed records"
on public.diagnostic_orders for update to authenticated
using (
    (case_id is not null and (
        (private.is_case_student(case_id) and private.is_case_editable(case_id))
        or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
)
with check (
    (case_id is not null and (
        (private.is_case_student(case_id) and private.is_case_editable(case_id))
        or private.can_manage_case(case_id)))
    or (case_id is null and private.is_staff())
);

create or replace function private.can_read_diagnostic_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.diagnostic_orders o
        where o.id = p_order_id
          and (
              (o.case_id is not null and (private.is_case_student(o.case_id) or private.can_manage_case(o.case_id)))
              or (o.case_id is null and private.is_staff())
          )
    );
$$;

create or replace function private.can_write_diagnostic_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.diagnostic_orders o
        where o.id = p_order_id
          and (
              (o.case_id is not null and (
                  (private.is_case_student(o.case_id) and private.is_case_editable(o.case_id))
                  or private.can_manage_case(o.case_id)))
              or (o.case_id is null and private.is_staff())
          )
    );
$$;

revoke all on function private.can_read_diagnostic_order(uuid) from public;
revoke all on function private.can_write_diagnostic_order(uuid) from public;
grant execute on function private.can_read_diagnostic_order(uuid) to authenticated;
grant execute on function private.can_write_diagnostic_order(uuid) to authenticated;

create policy "Read diagnostic results on own or managed records"
on public.diagnostic_results for select to authenticated
using (private.can_read_diagnostic_order(order_id));

create policy "Create diagnostic results on own or managed records"
on public.diagnostic_results for insert to authenticated
with check (
    resulted_by = auth.uid()
    and private.can_write_diagnostic_order(order_id)
);

drop policy "Insert own audit logs on own or managed cases" on public.audit_logs;

create policy "Insert own audit logs on own or managed cases"
on public.audit_logs for insert to authenticated
with check (
    actor_id = auth.uid()
    and (
        private.can_manage_case(case_id)
        or (
            private.is_case_student(case_id)
            and action_type in (
                'NOTES_SAVED', 'CASE_SUBMITTED', 'STATUS_CHANGED',
                'REFERRAL_REQUESTED', 'REFERRAL_ACCEPTED', 'REFERRAL_COMPLETED', 'REFERRAL_CANCELLED',
                'LAB_ORDERED', 'IMAGING_ORDERED', 'DIAGNOSTIC_RESULT_ADDED', 'DIAGNOSTIC_ORDER_CANCELLED'
            )
        )
    )
);

create or replace function private.copy_patient_diagnostics_to_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    source_patient uuid := private.case_source_patient(new.id);
    src_order record;
    new_order_id uuid;
begin
    if source_patient is null then
        return new;
    end if;

    for src_order in
        select * from public.diagnostic_orders
        where patient_id = source_patient
        order by created_at asc
    loop
        insert into public.diagnostic_orders (
            case_id, category, test_code, test_name, coding_system, clinical_code,
            specimen_or_modality, priority, status, clinical_indication, notes,
            source, ordered_by, created_at, updated_at
        )
        values (
            new.id, src_order.category, src_order.test_code, src_order.test_name,
            src_order.coding_system, src_order.clinical_code, src_order.specimen_or_modality,
            src_order.priority, src_order.status, src_order.clinical_indication, src_order.notes,
            'baseline', coalesce(new.assigned_by, src_order.ordered_by),
            src_order.created_at, src_order.updated_at
        )
        returning id into new_order_id;

        insert into public.diagnostic_results (
            order_id, structured_values, report_findings, report_impression,
            overall_flag, file_path, file_name, file_mime_type, file_size_bytes,
            resulted_by, resulted_at
        )
        select
            new_order_id, r.structured_values, r.report_findings, r.report_impression,
            r.overall_flag, r.file_path, r.file_name, r.file_mime_type, r.file_size_bytes,
            coalesce(new.assigned_by, r.resulted_by), r.resulted_at
        from public.diagnostic_results r
        where r.order_id = src_order.id;
    end loop;

    return new;
end;
$$;

create trigger copy_patient_diagnostics_to_case
after insert on public.assigned_cases
for each row execute function private.copy_patient_diagnostics_to_case();

do $$
begin
    if to_regclass('storage.buckets') is not null then
        insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        values (
            'diagnostic-attachments',
            'diagnostic-attachments',
            false,
            10485760,
            array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
        )
        on conflict (id) do nothing;

        execute 'create policy "Authenticated users read diagnostic attachments"
            on storage.objects for select to authenticated
            using (bucket_id = ''diagnostic-attachments'')';

        execute 'create policy "Authenticated users upload diagnostic attachments"
            on storage.objects for insert to authenticated
            with check (bucket_id = ''diagnostic-attachments'' and owner = auth.uid())';
    end if;
end;
$$;

