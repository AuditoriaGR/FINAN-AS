-- Meu Financeiro 1.3: parcelas sem teto artificial e contas fixas de valor variável.
-- A função usa SECURITY INVOKER e respeita as políticas RLS dos lançamentos.
alter table public.transactions drop constraint if exists installments_ck;
alter table public.transactions add constraint installments_ck check (
  (installment_group_id is null and installment_number is null and installment_total is null)
  or (installment_group_id is not null
    and installment_number is not null and installment_total is not null
    and installment_number >= 1 and installment_total >= 1
    and installment_number <= installment_total)
);

alter table public.recurring_rules
  add column if not exists amount_mode text not null default 'fixed';
alter table public.recurring_rules
  add constraint recurring_amount_mode_ck check (amount_mode in ('fixed', 'variable'));

create or replace function public.create_installment_plan(
  p_description text,
  p_type text,
  p_category text,
  p_scope text,
  p_household_id uuid,
  p_amount_mode text,
  p_amount_cents bigint,
  p_installments integer,
  p_transaction_date date,
  p_first_due_date date,
  p_account_id uuid default null,
  p_card_id uuid default null,
  p_first_paid_at date default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group uuid := gen_random_uuid();
  v_total numeric;
begin
  if v_user is null then raise exception 'Faça login para criar parcelas'; end if;
  if p_description is null or length(trim(p_description)) not between 1 and 235 then
    raise exception 'Descrição inválida'; end if;
  if p_type not in ('income','expense') or p_scope not in ('private','shared')
     or p_amount_mode not in ('total','installment') then
    raise exception 'Tipo, visibilidade ou modalidade inválidos'; end if;
  if p_installments is null or p_installments < 2 then
    raise exception 'Informe duas ou mais parcelas'; end if;
  if p_amount_cents is null or p_amount_cents < 1
    or p_amount_cents > 9007199254740991 then
    raise exception 'Valor inválido'; end if;
  if p_transaction_date is null or p_first_due_date is null then
    raise exception 'Informe as datas de compra e primeiro vencimento'; end if;

  if p_scope = 'private' and p_household_id is not null then
    raise exception 'Movimentação individual não pode ter grupo'; end if;
  if p_scope = 'shared' and (
    p_household_id is null or not exists (
      select 1 from public.household_members hm
      where hm.user_id = v_user and hm.household_id = p_household_id
    )
  ) then raise exception 'Você não pertence a este grupo'; end if;

  if p_account_id is not null and p_card_id is not null then
    raise exception 'Selecione conta ou cartão, não ambos'; end if;
  if p_card_id is not null then
    if p_type <> 'expense' then raise exception 'Cartão só aceita despesas'; end if;
    if p_first_paid_at is not null then raise exception 'O pagamento do cartão é registrado na fatura'; end if;
    if not exists (
      select 1 from public.credit_cards c where c.id = p_card_id
        and (c.owner_id = v_user or (c.scope = 'shared' and c.household_id = p_household_id))
    ) then raise exception 'Cartão não autorizado'; end if;
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = p_account_id
      and (a.owner_id = v_user or (a.scope = 'shared' and a.household_id = p_household_id))
  ) then raise exception 'Conta não autorizada'; end if;

  v_total := case when p_amount_mode = 'total'
    then p_amount_cents::numeric
    else p_amount_cents::numeric * p_installments end;
  if v_total > 9007199254740991 then
    raise exception 'O valor total excede a precisão monetária suportada'; end if;
  if p_amount_mode = 'total' and p_amount_cents < p_installments then
    raise exception 'Cada parcela precisa ter pelo menos R$ 0,01'; end if;

  with months as (
    select seq.i,
      (date_trunc('month',p_first_due_date) + make_interval(months => seq.i-1))::date as first_day
    from generate_series(1,p_installments) as seq(i)
  )
  insert into public.transactions (
    owner_id, household_id, scope, description, type, category,
    amount_cents, transaction_date, due_date, paid_at,
    account_id, card_id, installment_group_id, installment_number, installment_total
  )
  select
    v_user, p_household_id, p_scope,
    trim(p_description)||' ('||m.i||'/'||p_installments||')',
    p_type, p_category,
    (case when p_amount_mode = 'installment' then p_amount_cents
      else p_amount_cents / p_installments
        + case when m.i <= (p_amount_cents % p_installments) then 1 else 0 end end)::bigint,
    p_transaction_date,
    m.first_day + least(extract(day from p_first_due_date)::integer,
      extract(day from (m.first_day + interval '1 month - 1 day'))::integer)-1,
    case when m.i=1 then p_first_paid_at else null end,
    p_account_id, p_card_id, v_group, m.i, p_installments
  from months m;

  return v_group;
end;
$$;

revoke all on function public.create_installment_plan(
  text,text,text,text,uuid,text,bigint,integer,date,date,uuid,uuid,date
) from public, anon;
grant execute on function public.create_installment_plan(
  text,text,text,text,uuid,text,bigint,integer,date,date,uuid,uuid,date
) to authenticated;
