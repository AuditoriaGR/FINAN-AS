-- Fatura mensal oficial informada manualmente ao iniciar o controle financeiro.
-- Representa o TOTAL da fatura, não uma nova compra, e prevalece sobre lançamentos
-- detalhados da mesma fatura; a diferença diminui conforme compras são cadastradas.
create table if not exists public.card_statement_totals (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.credit_cards(id) on delete restrict,
  owner_id uuid not null references auth.users(id),
  statement_month text not null check (statement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  actual_amount_cents bigint not null check (actual_amount_cents>=0 and actual_amount_cents<=9007199254740991),
  notes text not null default '' check (length(notes)<=300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(card_id,statement_month)
);
create index if not exists card_statement_totals_owner_idx on public.card_statement_totals(owner_id,statement_month);
alter table public.card_statement_totals enable row level security;

create policy card_statement_totals_read on public.card_statement_totals
 for select to authenticated using (
  exists(select 1 from public.credit_cards c where c.id=card_id
   and (c.owner_id=(select auth.uid())
    or (c.scope='shared' and private.is_household_member(c.household_id))))
 );
create policy card_statement_totals_insert on public.card_statement_totals
 for insert to authenticated with check (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.credit_cards c where c.id=card_id and c.owner_id=(select auth.uid()))
 );
create policy card_statement_totals_update on public.card_statement_totals
 for update to authenticated using (
  owner_id=(select auth.uid())
 ) with check (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.credit_cards c where c.id=card_id and c.owner_id=(select auth.uid()))
 );
grant select,insert,update on public.card_statement_totals to authenticated;
revoke all on public.card_statement_totals from anon;
revoke delete on public.card_statement_totals from authenticated;

create or replace function public.set_card_statement_total(
 p_card_id uuid,p_statement_month text,p_actual_amount_cents bigint,p_notes text default ''
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_card_owner uuid;
 v_paid numeric;
 v_result uuid;
begin
 if v_user is null then raise exception 'Autenticação necessária'; end if;
 if p_statement_month is null or p_statement_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
  raise exception 'Mês de fatura inválido'; end if;
 if p_actual_amount_cents is null or p_actual_amount_cents<0 or
    p_actual_amount_cents>9007199254740991 then raise exception 'Valor de fatura inválido'; end if;
 if length(coalesce(p_notes,''))>300 then raise exception 'Observação muito longa'; end if;
 select c.owner_id into v_card_owner from public.credit_cards c
 where c.id=p_card_id for update;
 if not found or v_card_owner<>v_user then
  raise exception 'Somente o responsável pelo cartão pode ajustar a fatura'; end if;
 select coalesce(sum(cp.amount_cents),0) into v_paid from public.card_payments cp
 where cp.card_id=p_card_id and cp.statement_month=p_statement_month;
 if p_actual_amount_cents<v_paid then
  raise exception 'A fatura informada não pode ser menor que os pagamentos já registrados'; end if;
 insert into public.card_statement_totals(card_id,owner_id,statement_month,actual_amount_cents,notes)
 values(p_card_id,v_user,p_statement_month,p_actual_amount_cents,coalesce(p_notes,''))
 on conflict(card_id,statement_month) do update
 set actual_amount_cents=excluded.actual_amount_cents,
     notes=excluded.notes,updated_at=now()
 returning id into v_result;
 return v_result;
end
$$;
revoke all on function public.set_card_statement_total(uuid,text,bigint,text) from public,anon;
grant execute on function public.set_card_statement_total(uuid,text,bigint,text) to authenticated;
