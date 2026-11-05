-- Shared financial household and opening-balance reconciliation.
-- Does not expose anything outside authenticated household membership.
alter table public.transactions
  add column if not exists in_opening_balance boolean not null default false;

alter table public.card_spending_limits
  add column if not exists household_id uuid references public.households(id);

create unique index if not exists card_limits_household_effective_unique
  on public.card_spending_limits(household_id,effective_month)
  where household_id is not null;

drop policy if exists card_spending_limits_select on public.card_spending_limits;
create policy card_spending_limits_select on public.card_spending_limits
 for select to authenticated using (
 owner_id=(select auth.uid()) or
 (household_id is not null and private.is_household_member(household_id))
);
drop policy if exists card_spending_limits_insert on public.card_spending_limits;
create policy card_spending_limits_insert on public.card_spending_limits
 for insert to authenticated with check (
 owner_id=(select auth.uid()) and
 (household_id is null or private.is_household_member(household_id))
);
drop policy if exists card_spending_limits_update on public.card_spending_limits;
create policy card_spending_limits_update on public.card_spending_limits
 for update to authenticated
 using (owner_id=(select auth.uid()) or (household_id is not null and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and household_id is null)
  or (household_id is not null and private.is_household_member(household_id)
    and exists(select 1 from public.household_members hm where hm.household_id=card_spending_limits.household_id and hm.user_id=card_spending_limits.owner_id))
 );
drop policy if exists card_spending_limits_delete on public.card_spending_limits;
create policy card_spending_limits_delete on public.card_spending_limits
 for delete to authenticated using (
 owner_id=(select auth.uid()) or
 (household_id is not null and private.is_household_member(household_id))
);

-- Shared objects may be managed by either household member; private assets remain owner-only.
drop policy if exists account_upd on public.accounts;
create policy account_upd on public.accounts for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=accounts.household_id and hm.user_id=accounts.owner_id))
 );
drop policy if exists account_del on public.accounts;
create policy account_del on public.accounts for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists card_upd on public.credit_cards;
create policy card_upd on public.credit_cards for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=credit_cards.household_id and hm.user_id=credit_cards.owner_id))
 );
drop policy if exists card_del on public.credit_cards;
create policy card_del on public.credit_cards for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists tx_upd on public.transactions;
create policy tx_upd on public.transactions for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=transactions.household_id and hm.user_id=transactions.owner_id))
 );
drop policy if exists tx_del on public.transactions;
create policy tx_del on public.transactions for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists recurring_upd on public.recurring_rules;
create policy recurring_upd on public.recurring_rules for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=recurring_rules.household_id and hm.user_id=recurring_rules.owner_id))
 );
drop policy if exists recurring_del on public.recurring_rules;
create policy recurring_del on public.recurring_rules for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists goal_upd on public.financial_goals;
create policy goal_upd on public.financial_goals for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=financial_goals.household_id and hm.user_id=financial_goals.owner_id))
 );
drop policy if exists goal_del on public.financial_goals;
create policy goal_del on public.financial_goals for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists budget_upd on public.category_budgets;
create policy budget_upd on public.category_budgets for update to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)))
 with check (
  (owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)))
  or (scope='shared' and private.is_household_member(household_id)
   and exists(select 1 from public.household_members hm where hm.household_id=category_budgets.household_id and hm.user_id=category_budgets.owner_id))
 );
drop policy if exists budget_del on public.category_budgets;
create policy budget_del on public.category_budgets for delete to authenticated
 using (owner_id=(select auth.uid()) or (scope='shared' and private.is_household_member(household_id)));

drop policy if exists account_balance_adjustments_insert on public.account_balance_adjustments;
create policy account_balance_adjustments_insert on public.account_balance_adjustments
 for insert to authenticated with check (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.accounts a where a.id=account_id and
   (a.owner_id=(select auth.uid()) or (a.scope='shared' and private.is_household_member(a.household_id))))
);

drop policy if exists card_statement_totals_insert on public.card_statement_totals;
create policy card_statement_totals_insert on public.card_statement_totals
 for insert to authenticated with check (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.credit_cards c where c.id=card_id and
   (c.owner_id=(select auth.uid()) or (c.scope='shared' and private.is_household_member(c.household_id))))
);
drop policy if exists card_statement_totals_update on public.card_statement_totals;
create policy card_statement_totals_update on public.card_statement_totals
 for update to authenticated
 using (owner_id=(select auth.uid()) or exists(
  select 1 from public.credit_cards c where c.id=card_id and c.scope='shared'
   and private.is_household_member(c.household_id)))
 with check (
  owner_id=(select auth.uid()) or exists(
  select 1 from public.credit_cards c
   join public.household_members hm on hm.household_id=c.household_id and hm.user_id=card_statement_totals.owner_id
  where c.id=card_id and c.scope='shared' and private.is_household_member(c.household_id))
);

-- Shared account reconciliation remains SECURITY INVOKER and writes immutable adjustments.
create or replace function public.reconcile_account_balance(
 p_account_id uuid,p_new_balance_cents bigint,p_reason text default 'Conciliação manual de saldo'
) returns bigint language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_account public.accounts%rowtype;
 v_transfers numeric;
 v_payments numeric;
 v_adjustments numeric;
 v_current numeric;
 v_delta numeric;
 v_reason text := coalesce(nullif(trim(p_reason),''),'Conciliação manual de saldo');
begin
 if v_user is null then raise exception 'Autenticação necessária'; end if;
 if p_account_id is null or p_new_balance_cents is null or abs(p_new_balance_cents::numeric)>9007199254740991 then
  raise exception 'Saldo desejado inválido'; end if;
 if length(v_reason)>300 then raise exception 'Motivo deve ter até 300 caracteres'; end if;
 select * into v_account from public.accounts a where a.id=p_account_id for update;
 if not found then raise exception 'Conta não encontrada ou sem permissão'; end if;
 if not (v_account.owner_id=v_user or (v_account.scope='shared'
    and private.is_household_member(v_account.household_id))) then
  raise exception 'Somente os integrantes da casa podem conciliar a conta';
 end if;
 select coalesce(sum(case when t.type='income' then t.amount_cents else -t.amount_cents end),0)
 into v_transfers from public.transactions t
 where t.account_id=p_account_id and t.paid_at is not null and not t.in_opening_balance;
 select coalesce(sum(cp.amount_cents),0) into v_payments
 from public.card_payments cp where cp.account_id=p_account_id;
 select coalesce(sum(adj.delta_cents),0) into v_adjustments
 from public.account_balance_adjustments adj where adj.account_id=p_account_id;
 v_current:=v_account.opening_balance_cents::numeric+v_transfers-v_payments+v_adjustments;
 v_delta:=p_new_balance_cents::numeric-v_current;
 if abs(v_delta)>9007199254740991 then raise exception 'Diferença de saldo acima do limite'; end if;
 if v_delta=0 then return 0; end if;
 insert into public.account_balance_adjustments(account_id,owner_id,delta_cents,balance_before_cents,balance_after_cents,reason)
 values(p_account_id,v_user,v_delta::bigint,v_current::bigint,p_new_balance_cents,v_reason);
 return v_delta::bigint;
end $$;
revoke all on function public.reconcile_account_balance(uuid,bigint,text) from public,anon;
grant execute on function public.reconcile_account_balance(uuid,bigint,text) to authenticated;

-- Shared card statement editing, while private cards remain strictly owner-only.
create or replace function public.set_card_statement_total(
 p_card_id uuid,p_statement_month text,p_actual_amount_cents bigint,p_notes text default ''
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_card public.credit_cards%rowtype;
 v_paid numeric;
 v_result uuid;
begin
 if v_user is null then raise exception 'Autenticação necessária'; end if;
 if p_statement_month is null or p_statement_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
  raise exception 'Mês de fatura inválido'; end if;
 if p_actual_amount_cents is null or p_actual_amount_cents<0 or
    p_actual_amount_cents>9007199254740991 then raise exception 'Valor de fatura inválido'; end if;
 if length(coalesce(p_notes,''))>300 then raise exception 'Observação muito longa'; end if;
 select * into v_card from public.credit_cards c where c.id=p_card_id for update;
 if not found or not (v_card.owner_id=v_user or (v_card.scope='shared'
   and private.is_household_member(v_card.household_id))) then
  raise exception 'Somente os integrantes da casa podem ajustar a fatura';
 end if;
 select coalesce(sum(cp.amount_cents),0) into v_paid
 from public.card_payments cp where cp.card_id=p_card_id and cp.statement_month=p_statement_month;
 if p_actual_amount_cents<v_paid then
  raise exception 'A fatura informada não pode ser menor que os pagamentos já registrados'; end if;
 insert into public.card_statement_totals(card_id,owner_id,statement_month,actual_amount_cents,notes)
 values(p_card_id,v_user,p_statement_month,p_actual_amount_cents,coalesce(p_notes,''))
 on conflict(card_id,statement_month) do update
 set actual_amount_cents=excluded.actual_amount_cents,notes=excluded.notes,updated_at=now()
 returning id into v_result;
 return v_result;
end $$;
revoke all on function public.set_card_statement_total(uuid,text,bigint,text) from public,anon;
grant execute on function public.set_card_statement_total(uuid,text,bigint,text) to authenticated;

-- Either household member may materialize shared recurring rules.
create or replace function public.materialize_recurring_month(p_month text)
returns integer language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_month_start date;
 v_count integer;
begin
 if v_user is null then raise exception 'Autenticação necessária'; end if;
 if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido';end if;
 v_month_start:=(p_month||'-01')::date;
 with eligible as (
   select r.*, make_date(extract(year from v_month_start)::int,extract(month from v_month_start)::int,
       r.day_of_month) charge_date,c.closing_day,c.due_day as card_due_day
   from public.recurring_rules r left join public.credit_cards c on c.id=r.card_id
   where (r.owner_id=v_user or (r.scope='shared' and private.is_household_member(r.household_id)))
    and r.is_active and r.start_month<=p_month and (r.end_month is null or r.end_month>=p_month)
    and (r.card_id is null or c.id is not null)
 ),due_dates as(
  select r.*,case when r.card_id is null then r.charge_date else
   (date_trunc('month',r.charge_date)::date +
    make_interval(months=> (case when r.card_due_day<=r.closing_day then 1 else 0 end)
     +(case when r.day_of_month>r.closing_day then 1 else 0 end)))::date
    +(r.card_due_day-1) end statement_due_date
  from eligible r
 )
 insert into public.transactions(owner_id,household_id,scope,description,type,category,amount_cents,
    transaction_date,due_date,paid_at,account_id,card_id,
    installment_group_id,installment_number,installment_total,recurring_rule_id)
 select v_user,r.household_id,r.scope,r.description,r.type,r.category,r.amount_cents,
    r.charge_date,r.statement_due_date,null,r.account_id,r.card_id,
    null,null,null,r.id from due_dates r on conflict do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.materialize_recurring_month(text) from public,anon;
grant execute on function public.materialize_recurring_month(text) to authenticated;
