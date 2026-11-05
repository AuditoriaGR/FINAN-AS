-- Histórico de conciliação do saldo atual de contas.
-- Ajustes não criam receitas/despesas e não alteram o saldo inicial histórico.
create table if not exists public.account_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  owner_id uuid not null references auth.users(id),
  delta_cents bigint not null check (delta_cents <> 0),
  balance_before_cents bigint not null,
  balance_after_cents bigint not null,
  reason text not null default 'Conciliação manual de saldo'
    check (length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists account_balance_adjustments_account_idx
  on public.account_balance_adjustments (account_id,created_at desc);

alter table public.account_balance_adjustments enable row level security;

create policy account_balance_adjustments_select on public.account_balance_adjustments
 for select to authenticated using (
  exists(select 1 from public.accounts a where a.id=account_id and
   (a.owner_id=(select auth.uid())
     or (a.scope='shared' and private.is_household_member(a.household_id))))
 );

create policy account_balance_adjustments_insert on public.account_balance_adjustments
 for insert to authenticated with check (
  owner_id=(select auth.uid()) and exists(
   select 1 from public.accounts a where a.id=account_id and a.owner_id=(select auth.uid())
  )
 );
-- Auditoria imutável: não há UPDATE nem DELETE para usuários autenticados.
grant select,insert on public.account_balance_adjustments to authenticated;
revoke all on public.account_balance_adjustments from anon;
revoke update,delete on public.account_balance_adjustments from authenticated;

create or replace function public.reconcile_account_balance(
 p_account_id uuid,
 p_new_balance_cents bigint,
 p_reason text default 'Conciliação manual de saldo'
) returns bigint
language plpgsql security invoker set search_path=''
as $$
declare
 v_user uuid := (select auth.uid());
 v_owner uuid;
 v_initial bigint;
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

 select a.owner_id,a.opening_balance_cents into v_owner,v_initial
 from public.accounts a where a.id=p_account_id for update;
 if not found then raise exception 'Conta não encontrada ou sem permissão'; end if;
 if v_owner<>v_user then raise exception 'Somente o responsável pela conta pode conciliar o saldo'; end if;

 select coalesce(sum(case when t.type='income' then t.amount_cents else -t.amount_cents end),0)
 into v_transfers from public.transactions t
 where t.account_id=p_account_id and t.paid_at is not null;

 select coalesce(sum(cp.amount_cents),0) into v_payments
 from public.card_payments cp where cp.account_id=p_account_id;

 select coalesce(sum(adj.delta_cents),0) into v_adjustments
 from public.account_balance_adjustments adj where adj.account_id=p_account_id;

 v_current:=v_initial::numeric+v_transfers-v_payments+v_adjustments;
 v_delta:=p_new_balance_cents::numeric-v_current;
 if abs(v_delta)>9007199254740991 then raise exception 'Diferença de saldo acima do limite'; end if;
 if v_delta=0 then return 0; end if;

 insert into public.account_balance_adjustments(
   account_id,owner_id,delta_cents,balance_before_cents,balance_after_cents,reason
 ) values (p_account_id,v_user,v_delta::bigint,v_current::bigint,p_new_balance_cents,v_reason);
 return v_delta::bigint;
end
$$;
revoke all on function public.reconcile_account_balance(uuid,bigint,text) from public,anon;
grant execute on function public.reconcile_account_balance(uuid,bigint,text) to authenticated;
