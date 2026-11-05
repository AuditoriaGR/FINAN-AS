-- Shared recurrence may be materialized by either household member.
-- Private recurrence still strictly requires the original owner.
create or replace function private.validate_financial_links()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare a record;c record;r record;
begin
 if tg_table_name='transactions' then
  if new.account_id is not null then
   select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
   if not found or not ((a.scope='private' and a.owner_id=new.owner_id)
    or(a.scope='shared' and new.scope='shared' and a.household_id=new.household_id))
   then raise exception 'Conta não autorizada';end if;
  end if;
  if new.card_id is not null then
   select owner_id,household_id,scope into c from public.credit_cards where id=new.card_id;
   if not found or not ((c.scope='private' and c.owner_id=new.owner_id)
    or(c.scope='shared' and new.scope='shared' and c.household_id=new.household_id))
   then raise exception 'Cartão não autorizado';end if;
  end if;
  if new.recurring_rule_id is not null then
   select owner_id,household_id,scope into r from public.recurring_rules where id=new.recurring_rule_id;
   if not found or not (
      r.owner_id=new.owner_id or
      (r.scope='shared' and new.scope='shared' and r.household_id=new.household_id
       and private.is_household_member(r.household_id))
   ) then raise exception 'Recorrência não autorizada';end if;
  end if;
 elsif tg_table_name='card_payments' then
  select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
  if not found or not(a.owner_id=new.owner_id or a.scope='shared')
  then raise exception 'Conta de pagamento não autorizada';end if;
  select owner_id,household_id,scope into c from public.credit_cards where id=new.card_id;
  if not found or not(c.owner_id=new.owner_id
    or(c.scope='shared' and private.is_household_member(c.household_id)))
  then raise exception 'Cartão não autorizado';end if;
  if a.scope='shared' and c.scope<>'shared'
  then raise exception 'Não pague cartão privado com conta compartilhada';end if;
 elsif tg_table_name='recurring_rules' and new.account_id is not null then
  select owner_id,household_id,scope into a from public.accounts where id=new.account_id;
  if not found or not ((a.scope='private' and a.owner_id=new.owner_id)
   or(a.scope='shared' and new.scope='shared' and a.household_id=new.household_id))
  then raise exception 'Conta não autorizada';end if;
 end if;
 return new;
end $$;
