-- Registro de baixas previstas x realizadas.
-- O valor original fica preservado em planned_amount_cents, enquanto
-- amount_cents representa o valor efetivamente recebido ou pago após a baixa.
alter table public.transactions
 add column if not exists planned_amount_cents bigint;

do $$
begin
 if not exists(
  select 1 from pg_constraint
   where conrelid='public.transactions'::regclass
    and conname='transactions_planned_amount_positive'
 ) then
  alter table public.transactions
   add constraint transactions_planned_amount_positive
   check (planned_amount_cents is null or planned_amount_cents > 0);
 end if;
end
$$;

create or replace function public.settle_transaction(
 p_transaction_id uuid,
 p_actual_amount_cents bigint,
 p_paid_on date,
 p_account_id uuid
) returns public.transactions
language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_tx public.transactions%rowtype;
 v_account public.accounts%rowtype;
begin
 if v_user is null then
  raise exception 'Faça login para dar baixa no lançamento';
 end if;
 if p_transaction_id is null or p_account_id is null then
  raise exception 'Informe o lançamento e a conta usada para receber ou pagar';
 end if;
 if p_actual_amount_cents is null or p_actual_amount_cents<=0
    or p_actual_amount_cents>9007199254740991 then
  raise exception 'Informe um valor realizado maior que zero';
 end if;
 if p_paid_on is null or p_paid_on>current_date
    or p_paid_on<date '2000-01-01' then
  raise exception 'Informe uma data válida de pagamento ou recebimento';
 end if;

 select * into v_tx
 from public.transactions t where t.id=p_transaction_id
 for update;
 if not found or not (
    v_tx.owner_id=v_user
    or (v_tx.scope='shared' and private.is_household_member(v_tx.household_id))
 ) then
  raise exception 'Lançamento não encontrado ou sem permissão';
 end if;
 if v_tx.in_opening_balance then
  raise exception 'Lançamento já incluído no saldo inicial; não deve receber outra baixa';
 end if;
 if v_tx.card_id is not null then
  raise exception 'Compras no cartão são baixadas pelo pagamento da fatura';
 end if;

 select * into v_account from public.accounts a where a.id=p_account_id;
 if not found or not (
   (v_account.scope='shared' and v_tx.scope='shared'
      and v_account.household_id=v_tx.household_id
      and private.is_household_member(v_account.household_id))
    or (v_account.scope='private' and v_account.owner_id=v_user
      and v_tx.scope='private' and v_tx.owner_id=v_user)
 ) then
  raise exception 'Selecione uma conta de pagamento autorizada';
 end if;
 if lower(trim(v_account.kind)) in ('investimentos','investimento','cdb')
    or v_account.name ~* '(^|[^a-z])cdb([^a-z]|$)' then
  raise exception 'Investimento CDB não é conta de pagamento; escolha conta corrente ou disponível';
 end if;

 update public.transactions t
 set planned_amount_cents=coalesce(t.planned_amount_cents,t.amount_cents),
     amount_cents=p_actual_amount_cents,
     paid_at=p_paid_on,
     account_id=p_account_id
 where t.id=p_transaction_id
 returning * into v_tx;

 return v_tx;
end;
$$;
revoke all on function public.settle_transaction(uuid,bigint,date,uuid) from public,anon;
grant execute on function public.settle_transaction(uuid,bigint,date,uuid) to authenticated;
