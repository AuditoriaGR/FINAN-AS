-- Simulador de remuneração do casal. Apenas parâmetros (não gera receitas financeiras).
create table if not exists public.payroll_profiles (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 member_user_id uuid not null references auth.users(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 base_salary_cents bigint not null default 0 check (base_salary_cents between 0 and 100000000),
 hazard_mode text not null default 'percent30' check (hazard_mode in ('percent30','fixed')),
 hazard_fixed_cents bigint not null default 0 check (hazard_fixed_cents between 0 and 100000000),
 habitual_extras_cents bigint not null default 0 check (habitual_extras_cents between 0 and 100000000),
 salary_discount_cents bigint not null default 0 check (salary_discount_cents between 0 and 100000000),
 vacation_discount_cents bigint not null default 0 check (vacation_discount_cents between 0 and 100000000),
 thirteenth_discount_cents bigint not null default 0 check (thirteenth_discount_cents between 0 and 100000000),
 dependents integer not null default 0 check (dependents between 0 and 30),
 thirteenth_months integer not null default 12 check (thirteenth_months between 1 and 12),
 first_thirteenth_paid_cents bigint not null default 0 check (first_thirteenth_paid_cents between 0 and 100000000),
 vacation_start date not null default '2026-11-16',
 sale_days integer not null default 0 check (sale_days in (0,10,30)),
 salary_competence text not null default '2026-11'
  check (salary_competence ~ '^2026-(0[1-9]|1[0-2])$'),
 updated_at timestamptz not null default now(),
 unique (household_id,member_user_id)
);
create index if not exists payroll_profiles_household_idx
 on public.payroll_profiles(household_id);
alter table public.payroll_profiles enable row level security;

create policy payroll_profiles_select on public.payroll_profiles
 for select to authenticated using (
  private.is_household_member(household_id)
 );
create policy payroll_profiles_insert on public.payroll_profiles
 for insert to authenticated with check (
  created_by=(select auth.uid()) and
  private.is_household_member(household_id) and
  exists(select 1 from public.household_members hm where hm.household_id=payroll_profiles.household_id and hm.user_id=payroll_profiles.member_user_id)
 );
create policy payroll_profiles_update on public.payroll_profiles
 for update to authenticated
 using (private.is_household_member(household_id))
 with check (
  private.is_household_member(household_id) and
  exists(select 1 from public.household_members hm where hm.household_id=payroll_profiles.household_id and hm.user_id=payroll_profiles.member_user_id) and
  exists(select 1 from public.household_members hm where hm.household_id=payroll_profiles.household_id and hm.user_id=payroll_profiles.created_by)
 );
create policy payroll_profiles_delete on public.payroll_profiles
 for delete to authenticated
 using (private.is_household_member(household_id));
grant select,insert,update,delete on public.payroll_profiles to authenticated;
revoke all on public.payroll_profiles from anon;
