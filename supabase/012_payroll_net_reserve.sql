-- Meta pessoal de salário líquido habitual, compartilhada no simulador do casal.
-- NULL indica meta ainda não preenchida; não movimenta nenhuma conta ou investimento.
alter table public.payroll_profiles
 add column if not exists habitual_net_cents bigint null;
do $$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.payroll_profiles'::regclass and conname='payroll_profiles_habitual_net_positive'
 ) then
  alter table public.payroll_profiles add constraint payroll_profiles_habitual_net_positive
   check (habitual_net_cents is null or (habitual_net_cents>=0 and habitual_net_cents<=9007199254740991));
 end if;
end $$;
comment on column public.payroll_profiles.habitual_net_cents is
 'Meta habitual de salário líquido para reservas pós-férias; não constitui receita ou saldo disponível.';
