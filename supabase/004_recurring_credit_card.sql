-- Meu Financeiro: cobranças fixas no cartão, respeitando fechamento e vencimento.
-- Sem alterar dados já cadastrados: regras existentes seguem vinculadas às contas originais.
alter table public.recurring_rules
  add column if not exists card_id uuid references public.credit_cards(id) on delete restrict;

alter table public.recurring_rules
  add constraint recurring_single_payment_method_ck
    check (account_id is null or card_id is null);

alter table public.recurring_rules
  add constraint recurring_card_expense_only_ck
    check (card_id is null or type = 'expense');

create index if not exists recurring_card_idx on public.recurring_rules(card_id)
  where card_id is not null;

-- Idempotência pelo mês da COBRANÇA, não pelo vencimento da fatura.
-- Impede criar o mesmo gasto novamente se a forma de pagamento mudar.
create unique index if not exists tx_recurring_charge_month_unique
  on public.transactions(recurring_rule_id,date_trunc('month', transaction_date::timestamp))
  where recurring_rule_id is not null;

create or replace function public.materialize_recurring_month(p_month text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_month_start date;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Autenticação necessária';
  end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido';
  end if;
  v_month_start := (p_month || '-01')::date;

  with eligible as (
    select r.*,
      make_date(extract(year from v_month_start)::int,
                extract(month from v_month_start)::int,
                r.day_of_month) as charge_date,
      c.closing_day, c.due_day as card_due_day
    from public.recurring_rules r
      left join public.credit_cards c on c.id = r.card_id
    where r.owner_id = v_user
      and r.is_active
      and r.start_month <= p_month
      and (r.end_month is null or r.end_month >= p_month)
      and (r.card_id is null or c.id is not null)
  ),
  due_dates as (
    select r.*,
      case
        when r.card_id is null then r.charge_date
        else (
          date_trunc('month',r.charge_date)::date
          + make_interval(months =>
              (case when r.card_due_day <= r.closing_day then 1 else 0 end)
              + (case when r.day_of_month > r.closing_day then 1 else 0 end)
            )
        )::date + (r.card_due_day - 1)
      end as statement_due_date
    from eligible r
  )
  insert into public.transactions (
    owner_id,household_id,scope,description,type,category,amount_cents,
    transaction_date,due_date,paid_at,account_id,card_id,
    installment_group_id,installment_number,installment_total,recurring_rule_id
  )
  select
    r.owner_id,r.household_id,r.scope,r.description,r.type,r.category,r.amount_cents,
    r.charge_date,r.statement_due_date,null,
    r.account_id,r.card_id,null,null,null,r.id
  from due_dates r
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.materialize_recurring_month(text) from public, anon;
grant execute on function public.materialize_recurring_month(text) to authenticated;
