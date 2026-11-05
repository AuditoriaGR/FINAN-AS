-- MEU FINANCEIRO 1.0 | Instale SOMENTE em projeto Supabase pessoal, vazio.
-- Valores monetários em CENTAVOS (BIGINT), datas locais em DATE, alertas calculados no aplicativo.
-- Requer PostgreSQL 15+, Supabase Auth habilitado; não executa alterações nos projetos corporativos.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', created_at timestamptz not null default now()
);
create table public.households (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','member')),
  display_name text not null check(length(display_name) between 2 and 100),
  joined_at timestamptz not null default now(),primary key(household_id,user_id)
);
create index household_members_household_idx on public.household_members(household_id);
create or replace function private.is_household_member(hid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.household_members where household_id=hid and user_id=(select auth.uid()));
$$;
revoke all on function private.is_household_member(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated;

create table public.accounts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id), scope text not null check(scope in ('private','shared')),
  name text not null check(length(name) between 1 and 100),kind text not null default 'Conta corrente',
  opening_balance_cents bigint not null default 0,created_at timestamptz not null default now(),
  constraint account_scope_ck check((scope='private' and household_id is null) or (scope='shared' and household_id is not null))
);
create index accounts_owner_idx on public.accounts(owner_id);
create index accounts_household_idx on public.accounts(household_id);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),scope text not null check(scope in ('private','shared')),
  name text not null check(length(name) between 1 and 100),credit_limit_cents bigint not null check(credit_limit_cents>=0),
  closing_day integer not null check(closing_day between 1 and 28),due_day integer not null check(due_day between 1 and 28),created_at timestamptz not null default now(),
  constraint card_scope_ck check((scope='private' and household_id is null) or (scope='shared' and household_id is not null))
);
create index credit_cards_owner_idx on public.credit_cards(owner_id);
create index credit_cards_household_idx on public.credit_cards(household_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),scope text not null check(scope in ('private','shared')),
  description text not null check(length(description) between 1 and 250),type text not null check(type in ('income','expense')),
  category text not null default 'Outros',amount_cents bigint not null check(amount_cents>0),
  transaction_date date not null,due_date date not null,paid_at date,
  account_id uuid references public.accounts(id) on delete restrict,
  card_id uuid references public.credit_cards(id) on delete restrict,
  installment_group_id uuid,installment_number integer,installment_total integer,
  recurring_rule_id uuid, created_at timestamptz not null default now(),
  constraint transaction_scope_ck check((scope='private' and household_id is null) or(scope='shared' and household_id is not null)),
  constraint transaction_payment_ck check(not(account_id is not null and card_id is not null)),
  constraint transaction_card_ck check(card_id is null or type='expense'),
  constraint installments_ck check((installment_group_id is null and installment_number is null and installment_total is null) or
    (installment_group_id is not null and installment_number between 1 and 72 and installment_total between 1 and 72 and installment_number<=installment_total))
);
create index tx_owner_date_idx on public.transactions(owner_id,due_date);
create index tx_household_date_idx on public.transactions(household_id,due_date);
create index tx_card_date_idx on public.transactions(card_id,due_date);
create unique index tx_recurring_month_unique on public.transactions(recurring_rule_id,date_trunc('month',due_date::timestamp)) where recurring_rule_id is not null;

create table public.category_budgets (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),scope text not null check(scope in ('private','shared')),
  category text not null,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint not null check(amount_cents>0),
  constraint budget_scope_ck check((scope='private' and household_id is null) or(scope='shared' and household_id is not null))
);
create unique index budgets_private_unique on public.category_budgets(owner_id,category,month) where scope='private';
create unique index budgets_shared_unique on public.category_budgets(household_id,category,month) where scope='shared';

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),scope text not null check(scope in ('private','shared')),
  name text not null check(length(name) between 1 and 150),target_cents bigint not null check(target_cents>0),
  deadline date,created_at timestamptz not null default now(),
  constraint goal_scope_ck check((scope='private' and household_id is null) or(scope='shared' and household_id is not null))
);
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),goal_id uuid not null references public.financial_goals(id) on delete cascade,
  owner_id uuid not null references auth.users(id),amount_cents bigint not null check(amount_cents>0),created_at timestamptz not null default now()
);
create index goal_contributions_goal_idx on public.goal_contributions(goal_id);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  household_id uuid references public.households(id),scope text not null check(scope in ('private','shared')),
  type text not null check(type in('income','expense')),description text not null,category text not null,
  amount_cents bigint not null check(amount_cents>0),day_of_month integer not null check(day_of_month between 1 and 28),
  account_id uuid references public.accounts(id),start_month text not null check(start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month text check(end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),
  constraint recurring_scope_ck check((scope='private' and household_id is null) or(scope='shared' and household_id is not null)),
  constraint recurring_range_ck check(end_month is null or end_month>=start_month)
);
alter table public.transactions add constraint transactions_recurring_fk foreign key(recurring_rule_id) references public.recurring_rules(id) on delete set null;

create table public.card_payments (
  id uuid primary key default gen_random_uuid(),card_id uuid not null references public.credit_cards(id),
  owner_id uuid not null references auth.users(id),account_id uuid not null references public.accounts(id),
  statement_month text not null check(statement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents bigint not null check(amount_cents>0),paid_at date not null,created_at timestamptz not null default now()
);
create index card_payments_card_month_idx on public.card_payments(card_id,statement_month);

-- Previne vínculos forjados entre registros de contas/cartões/grupos diferentes.
create or replace function private.validate_financial_links() returns trigger language plpgsql security invoker set search_path='' as $$
declare a record; c record; r record;
begin
  if tg_table_name='transactions' then
    if new.account_id is not null then
      select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
      if not found or not ((a.scope='private' and a.owner_id=new.owner_id) or (a.scope='shared' and new.scope='shared' and a.household_id=new.household_id)) then raise exception 'Conta não autorizada'; end if;
    end if;
    if new.card_id is not null then
      select owner_id,household_id,scope into c from public.credit_cards where id=new.card_id;
      if not found or not((c.scope='private' and c.owner_id=new.owner_id) or (c.scope='shared' and new.scope='shared' and c.household_id=new.household_id)) then raise exception 'Cartão não autorizado'; end if;
    end if;
    if new.recurring_rule_id is not null then
      select owner_id into r from public.recurring_rules where id=new.recurring_rule_id;
      if not found or r.owner_id <> new.owner_id then raise exception 'Recorrência não autorizada';end if;
    end if;
  elsif tg_table_name='card_payments' then
    select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
    if not found or not(a.owner_id=new.owner_id or a.scope='shared') then raise exception 'Conta de pagamento não autorizada';end if;
    select owner_id,household_id,scope into c from public.credit_cards where id=new.card_id;
    if not found or not(c.owner_id=new.owner_id or (c.scope='shared' and private.is_household_member(c.household_id))) then raise exception 'Cartão não autorizado';end if;
    if a.scope='shared' and c.scope<>'shared' then raise exception 'Não pague cartão privado com conta compartilhada';end if;
  elsif tg_table_name='recurring_rules' and new.account_id is not null then
    select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
    if not found or not((a.scope='private' and a.owner_id=new.owner_id) or (a.scope='shared' and new.scope='shared' and a.household_id=new.household_id)) then raise exception 'Conta não autorizada';end if;
  end if;
  return new;
end $$;
create trigger tx_links before insert or update on public.transactions for each row execute function private.validate_financial_links();
create trigger card_payment_links before insert or update on public.card_payments for each row execute function private.validate_financial_links();
create trigger recurring_links before insert or update on public.recurring_rules for each row execute function private.validate_financial_links();

-- Criação atômica do espaço do casal: evita grupo sem titular e múltiplos grupos por usuário.
create or replace function public.create_household_space(p_name text,p_display_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; hid uuid;
begin
  uid:=(select auth.uid());
  if uid is null then raise exception 'Autenticação necessária'; end if;
  if length(trim(p_name)) not between 2 and 100 then raise exception 'Nome do espaço inválido'; end if;
  if length(trim(p_display_name)) not between 2 and 100 then raise exception 'Nome da pessoa inválido'; end if;
  if exists(select 1 from public.household_members where user_id=uid) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.households(name,created_by) values(trim(p_name),uid) returning id into hid;
  insert into public.household_members(household_id,user_id,role,display_name) values(hid,uid,'owner',trim(p_display_name));
  return hid;
end $$;
revoke all on function public.create_household_space(text,text) from public,anon;
grant execute on function public.create_household_space(text,text) to authenticated;

-- Convite de uso único, criptograficamente aleatório, com prazo; token nunca é exposto na Data API.
create table private.household_invitations (
  id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique,created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,used_at timestamptz
);
revoke all on table private.household_invitations from anon,authenticated;
create or replace function public.create_household_invitation(p_household_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare token text;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação necessária'; end if;
  if not exists(select 1 from public.households where id=p_household_id and created_by=(select auth.uid())) then raise exception 'Somente o responsável pode convidar'; end if;
  if (select count(*) from public.household_members where household_id=p_household_id)>=2 then raise exception 'O grupo já possui dois membros';end if;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.household_invitations(household_id,token_hash,created_by,expires_at)
  values(p_household_id,encode(sha256(convert_to(token,'utf8')),'hex'),(select auth.uid()),now()+interval '7 days');
  return token;
end $$;
create or replace function public.join_household(p_token text,p_display_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare hid uuid; uid uuid;
begin
  uid:=(select auth.uid());
  if uid is null then raise exception 'Autenticação necessária';end if;
  if length(trim(p_display_name))<2 or length(trim(p_display_name))>100 then raise exception 'Nome inválido';end if;
  if exists(select 1 from public.household_members where user_id=uid) then raise exception 'Usuário já pertence a um grupo';end if;
  select household_id into hid from private.household_invitations
  where token_hash=encode(sha256(convert_to(p_token,'utf8')),'hex') and used_at is null and expires_at>now() for update;
  if hid is null then raise exception 'Convite inválido ou expirado';end if;
  if (select count(*) from public.household_members where household_id=hid)>=2 then raise exception 'Grupo já completo';end if;
  insert into public.household_members(household_id,user_id,role,display_name) values(hid,uid,'member',trim(p_display_name));
  update private.household_invitations set used_at=now() where household_id=hid and token_hash=encode(sha256(convert_to(p_token,'utf8')),'hex');
  return hid;
end $$;
revoke all on function public.create_household_invitation(uuid) from public,anon;
revoke all on function public.join_household(text,text) from public,anon;
grant execute on function public.create_household_invitation(uuid) to authenticated;
grant execute on function public.join_household(text,text) to authenticated;

-- Restrição de acesso por pessoa e grupo (RLS): tabelas expostas não oferecem acesso anônimo.
do $$ declare t text; begin
  foreach t in array array['profiles','households','household_members','accounts','credit_cards','transactions','category_budgets','financial_goals','goal_contributions','recurring_rules','card_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
create policy profile_sel on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_ins on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profile_upd on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

create policy household_sel on public.households for select to authenticated using(created_by=(select auth.uid()) or private.is_household_member(id));
create policy household_ins on public.households for insert to authenticated with check(created_by=(select auth.uid()));
create policy household_upd on public.households for update to authenticated using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
create policy member_sel on public.household_members for select to authenticated using(user_id=(select auth.uid()) or private.is_household_member(household_id));
create policy member_insert_owner on public.household_members for insert to authenticated with check(user_id=(select auth.uid()) and role='owner' and exists(select 1 from public.households where id=household_id and created_by=(select auth.uid())));

-- A leitura compartilhada permite ver lançamento mas não dados de uma conta privada associada.
create policy account_sel on public.accounts for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy account_ins on public.accounts for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy account_upd on public.accounts for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy account_del on public.accounts for delete to authenticated using(owner_id=(select auth.uid()));

create policy card_sel on public.credit_cards for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy card_ins on public.credit_cards for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy card_upd on public.credit_cards for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy card_del on public.credit_cards for delete to authenticated using(owner_id=(select auth.uid()));

create policy tx_sel on public.transactions for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy tx_ins on public.transactions for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy tx_upd on public.transactions for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy tx_del on public.transactions for delete to authenticated using(owner_id=(select auth.uid()));

create policy budget_sel on public.category_budgets for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy budget_ins on public.category_budgets for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy budget_upd on public.category_budgets for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy budget_del on public.category_budgets for delete to authenticated using(owner_id=(select auth.uid()));

create policy goal_sel on public.financial_goals for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy goal_ins on public.financial_goals for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy goal_upd on public.financial_goals for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy goal_del on public.financial_goals for delete to authenticated using(owner_id=(select auth.uid()));
create policy contribution_sel on public.goal_contributions for select to authenticated using(exists(select 1 from public.financial_goals g where g.id=goal_id and (g.owner_id=(select auth.uid()) or(g.scope='shared' and private.is_household_member(g.household_id)))));
create policy contribution_ins on public.goal_contributions for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.financial_goals g where g.id=goal_id and (g.owner_id=(select auth.uid()) or(g.scope='shared' and private.is_household_member(g.household_id)))));
create policy contribution_del on public.goal_contributions for delete to authenticated using(owner_id=(select auth.uid()));

create policy recurring_sel on public.recurring_rules for select to authenticated using(owner_id=(select auth.uid()) or(scope='shared' and private.is_household_member(household_id)));
create policy recurring_ins on public.recurring_rules for insert to authenticated with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy recurring_upd on public.recurring_rules for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (scope='private' or private.is_household_member(household_id)));
create policy recurring_del on public.recurring_rules for delete to authenticated using(owner_id=(select auth.uid()));

create policy payment_sel on public.card_payments for select to authenticated using(owner_id=(select auth.uid()) or exists(select 1 from public.credit_cards c where c.id=card_id and c.scope='shared' and private.is_household_member(c.household_id)));
create policy payment_ins on public.card_payments for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.credit_cards c where c.id=card_id and(c.owner_id=(select auth.uid()) or(c.scope='shared' and private.is_household_member(c.household_id)))) and exists(select 1 from public.accounts a where a.id=account_id and(a.owner_id=(select auth.uid()) or(a.scope='shared' and private.is_household_member(a.household_id)))));
-- Pagamentos são registros de caixa: eventuais correções ocorrerão por estorno controlado em futura versão.

commit;