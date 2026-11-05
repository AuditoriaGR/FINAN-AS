-- Meu Financeiro 1.2: lançamentos fixos automáticos, com controle de pausa.
alter table public.recurring_rules add column if not exists is_active boolean not null default true;

create or replace function public.materialize_recurring_month(p_month text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_month_start date;
  v_count integer;
begin
  if v_user is null then raise exception 'Autenticação necessária'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido';
  end if;
  v_month_start := (p_month || '-01')::date;
  insert into public.transactions(owner_id,household_id,scope,description,type,category,amount_cents,
    transaction_date,due_date,paid_at,account_id,card_id,installment_group_id,installment_number,installment_total,recurring_rule_id)
  select r.owner_id,r.household_id,r.scope,r.description,r.type,r.category,r.amount_cents,
    make_date(extract(year from v_month_start)::int,extract(month from v_month_start)::int,r.day_of_month),
    make_date(extract(year from v_month_start)::int,extract(month from v_month_start)::int,r.day_of_month),
    null,r.account_id,null,null,null,null,r.id
  from public.recurring_rules r
  where r.owner_id=v_user and r.is_active and r.start_month<=p_month
    and (r.end_month is null or r.end_month>=p_month)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.materialize_recurring_month(text) from public, anon;
grant execute on function public.materialize_recurring_month(text) to authenticated;
