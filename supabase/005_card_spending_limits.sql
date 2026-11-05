-- Meu Financeiro: teto mensal de gastos somados em todos os cartões visíveis ao titular.
-- A configuração é individual; nunca divulga cartões privados do outro integrante.
-- Vigência: a configuração mais recente com effective_month <= mês consultado.
create table if not exists public.card_spending_limits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  effective_month text not null check (effective_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 9007199254740991),
  created_at timestamptz not null default now(),
  unique (owner_id, effective_month)
);

create index if not exists card_spending_limits_owner_month_idx
  on public.card_spending_limits (owner_id, effective_month desc);

alter table public.card_spending_limits enable row level security;

create policy card_spending_limits_select
 on public.card_spending_limits for select to authenticated
 using (owner_id = (select auth.uid()));

create policy card_spending_limits_insert
 on public.card_spending_limits for insert to authenticated
 with check (owner_id = (select auth.uid()));

create policy card_spending_limits_update
 on public.card_spending_limits for update to authenticated
 using (owner_id = (select auth.uid()))
 with check (owner_id = (select auth.uid()));

create policy card_spending_limits_delete
 on public.card_spending_limits for delete to authenticated
 using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.card_spending_limits to authenticated;
revoke all on public.card_spending_limits from anon;
