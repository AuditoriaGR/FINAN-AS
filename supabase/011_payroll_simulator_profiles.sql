-- Compatível com o cadastro de perfis já existente; não remove nem substitui registros.
create table if not exists public.payroll_profiles (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 person_key text not null check(person_key in ('rui','taina')),
 display_name text not null check(length(display_name) between 1 and 80),
 base_salary_cents bigint not null default 0 check(base_salary_cents between 0 and 9007199254740991),
 hazard_cents bigint not null default 0 check(hazard_cents between 0 and 9007199254740991),
 extras_cents bigint not null default 0 check(extras_cents between 0 and 9007199254740991),
 monthly_deductions_cents bigint not null default 0 check(monthly_deductions_cents between 0 and 9007199254740991),
 vacation_deductions_cents bigint not null default 0 check(vacation_deductions_cents between 0 and 9007199254740991),
 thirteen_deductions_cents bigint not null default 0 check(thirteen_deductions_cents between 0 and 9007199254740991),
 dependents integer not null default 0 check(dependents between 0 and 30),
 vacation_start date,
 vacation_entitlement_days integer not null default 30 check(vacation_entitlement_days in (12,18,24,30)),
 thirteen_months integer not null default 12 check(thirteen_months between 1 and 12),
 thirteen_paid_cents bigint not null default 0 check(thirteen_paid_cents between 0 and 9007199254740991),
 thirteen_on_vacation boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,person_key)
);
alter table public.payroll_profiles
 add column if not exists hazard_mode text not null default 'fixed',
 add column if not exists sale_days integer not null default 0,
 add column if not exists salary_competence text not null default '2026-11';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.payroll_profiles'::regclass and conname='payroll_profiles_hazard_mode_allowed') then
  alter table public.payroll_profiles add constraint payroll_profiles_hazard_mode_allowed check(hazard_mode in ('percent30','fixed'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.payroll_profiles'::regclass and conname='payroll_profiles_sale_days_allowed') then
  alter table public.payroll_profiles add constraint payroll_profiles_sale_days_allowed check(sale_days in (0,10,30));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.payroll_profiles'::regclass and conname='payroll_profiles_salary_competence_valid') then
  alter table public.payroll_profiles add constraint payroll_profiles_salary_competence_valid
   check(salary_competence ~ '^2026-(0[1-9]|1[0-2])$');
 end if;
end $$;
alter table public.payroll_profiles enable row level security;
drop policy if exists payroll_profiles_select on public.payroll_profiles;
drop policy if exists payroll_profiles_read on public.payroll_profiles;
drop policy if exists payroll_profiles_insert on public.payroll_profiles;
drop policy if exists payroll_profiles_update on public.payroll_profiles;
drop policy if exists payroll_profiles_delete on public.payroll_profiles;
create policy payroll_profiles_read on public.payroll_profiles
 for select to authenticated using(private.is_household_member(household_id));
create policy payroll_profiles_insert on public.payroll_profiles
 for insert to authenticated with check(
  owner_id=(select auth.uid()) and private.is_household_member(household_id)
 );
create policy payroll_profiles_update on public.payroll_profiles
 for update to authenticated using(private.is_household_member(household_id))
 with check(private.is_household_member(household_id) and
  exists(select 1 from public.household_members hm where hm.household_id=payroll_profiles.household_id and hm.user_id=payroll_profiles.owner_id));
create policy payroll_profiles_delete on public.payroll_profiles
 for delete to authenticated using(private.is_household_member(household_id));
grant select,insert,update,delete on public.payroll_profiles to authenticated;
revoke all on public.payroll_profiles from anon;
