create table public.referrals (
    id uuid primary key default gen_random_uuid(),
    case_id uuid references public.assigned_cases(id) on delete cascade,
    patient_id uuid references public.patients(id) on delete cascade,
    referring_user_id uuid not null references public.profiles(user_id) on delete cascade,
    target_discipline text not null,
    priority text not null default 'routine' check (priority in ('routine', 'urgent', 'stat')),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'cancelled')),
    reason text not null,
    notes text,
    response_notes text,
    created_at timestamptz not null default now(),
    constraint referrals_case_or_patient check (case_id is not null or patient_id is not null)
);

alter table public.referrals enable row level security;

create policy "Authenticated users can read referrals"
    on public.referrals for select
    to authenticated
    using (true);

create policy "Authenticated users can create referrals"
    on public.referrals for insert
    to authenticated
    with check (auth.uid() = referring_user_id);

create policy "Authenticated users can update referrals"
    on public.referrals for update
    to authenticated
    using (true);

alter table public.patient_templates
    add column if not exists initial_referral jsonb default null;
