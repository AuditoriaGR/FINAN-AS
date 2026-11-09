import {describe,it,expect} from 'vitest';
import {settlementVariance,settlementSummary} from '../src/settlements';
import {accountBalance} from '../src/finance';
import {projectedWithCarryForward} from '../src/planning';
import {blankData,type Tx,type Tables,type Account} from '../src/types';

const uid='member-a',house='home';
const account:Account={id:'bank',owner_id:uid,household_id:house,scope:'shared',
 name:'Conta Corrente',kind:'Conta corrente',opening_balance_cents:100000};
const tx=(description:string,type:'income'|'expense',planned:number,actual:number,options:Partial<Tx>={}):Tx=>({
 id:description,owner_id:uid,household_id:house,scope:'shared',description,
 type,category:type==='income'?'Salário':'Energia elétrica',
 amount_cents:actual,planned_amount_cents:planned,transaction_date:'2026-11-01',
 due_date:'2026-11-10',paid_at:'2026-11-09',account_id:'bank',card_id:null,
 installment_group_id:null,installment_number:null,installment_total:null,
 recurring_rule_id:null,...options
});

describe('previsto versus realizado na baixa',()=>{
 it('receita acima do previsto é positiva para o orçamento',()=>{
  expect(settlementVariance(tx('salary','income',100000,115000))).toBe(15000);
  expect(settlementVariance(tx('salary-lower','income',100000,92000))).toBe(-8000);
 });
 it('despesa paga abaixo do previsto mostra economia; acima mostra desvio desfavorável',()=>{
  expect(settlementVariance(tx('energy','expense',30000,27000))).toBe(3000);
  expect(settlementVariance(tx('water','expense',5000,7000))).toBe(-2000);
 });
 it('compara por mês de vencimento, não por data da baixa',()=>{
  const a=tx('expense','expense',12000,10000,{paid_at:'2026-12-01'});
  expect(settlementSummary([a],'2026-11').expense.count).toBe(1);
  expect(settlementSummary([a],'2026-12').settledCount).toBe(0);
 });
 it('não inclui pendentes, faturas de cartão nem saldo inicial em realização',()=>{
  const rows=[
   tx('pending','expense',10000,10000,{paid_at:null}),
   tx('card','expense',20000,20000,{card_id:'card'}),
   tx('opening','income',100000,100000,{in_opening_balance:true}),
   tx('legacy','expense',9000,9000,{planned_amount_cents:null})
  ];
  expect(settlementSummary(rows,'2026-11').settledCount).toBe(0);
  expect(settlementVariance(rows[0])).toBeNull();
 });
 it('mantém o previsto original ao alterar o valor realizado posteriormente',()=>{
  const before=tx('subscription','expense',15000,13000);
  const edited={...before,amount_cents:18000};
  expect(before.planned_amount_cents).toBe(15000);
  expect(settlementVariance(before)).toBe(2000);
  expect(settlementVariance(edited)).toBe(-3000);
 });
 it('consolida apenas liquidados e calcula impacto líquido no caixa',()=>{
  const entries=[
   tx('salary','income',100000,108000),
   tx('energy','expense',30000,25000),
   tx('grocery','expense',15000,18000)
  ];
  const s=settlementSummary(entries,'2026-11');
  expect(s.income).toEqual({count:1,plannedCents:100000,actualCents:108000,favorableCents:8000});
  expect(s.expense).toEqual({count:2,plannedCents:45000,actualCents:43000,favorableCents:2000});
  expect(s.netFavorableCents).toBe(10000);
  expect(s.settledCount).toBe(3);
 });
 it('saldo atual e saldo projetado respondem ao realizado sem mudar o previsto',()=>{
  const original=tx('energy','expense',30000,30000,{paid_at:null,planned_amount_cents:null});
  const real={...original,planned_amount_cents:30000,amount_cents:27000,paid_at:'2026-11-09'};
  expect(accountBalance(account,[original],[])).toBe(100000);
  expect(accountBalance(account,[real],[])).toBe(73000);
  const b:Tables={...blankData,accounts:[account],transactions:[original]};
  const r:Tables={...blankData,accounts:[account],transactions:[real]};
  const previous=projectedWithCarryForward(b,'all',uid,'2026-11',1,'2026-11')[0];
  const after=projectedWithCarryForward(r,'all',uid,'2026-11',1,'2026-11')[0];
  expect(previous.cumulativeCents).toBe(70000);
  expect(after.cumulativeCents).toBe(73000);
  expect(settlementVariance(real)).toBe(3000);
 });
});
