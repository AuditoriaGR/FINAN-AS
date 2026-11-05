import {describe,it,expect} from 'vitest';
import {accountBalancesByPurpose,isInvestmentAccount} from '../src/finance';
import {projectedWithCarryForward,simulatePurchase} from '../src/planning';
import {blankData,type Tables,type Tx} from '../src/types';

const uid='partner1';
const home='home1';
const data:Tables={...blankData,
 accounts:[
  {id:'bank',owner_id:uid,household_id:home,scope:'shared',name:'Conta corrente',
   kind:'Conta corrente',opening_balance_cents:400000},
  {id:'c6',owner_id:uid,household_id:home,scope:'shared',name:'CDB C6',
   kind:'Investimentos',opening_balance_cents:550000},
  {id:'itau',owner_id:uid,household_id:home,scope:'shared',name:'CDB Itaú',
   kind:'Investimentos',opening_balance_cents:100000}
 ],household_members:[
  {household_id:home,user_id:uid,role:'owner',display_name:'Rui'},
  {household_id:home,user_id:'partner2',role:'member',display_name:'Tainá'}
 ]};

describe('investimentos separados do caixa disponível',()=>{
 it('classifica CDB e contas de investimento, mantendo corrente e poupança no caixa',()=>{
  expect(isInvestmentAccount({kind:'Investimentos',name:'Aplicação'})).toBe(true);
  expect(isInvestmentAccount({kind:'Conta corrente',name:'Meu CDB'})).toBe(true);
  expect(isInvestmentAccount({kind:'Conta corrente',name:'Banco'})).toBe(false);
  expect(isInvestmentAccount({kind:'Conta poupança',name:'Poupança'})).toBe(false);
 });
 it('separa R$4.000 de caixa e R$6.500 de investimentos sem perder patrimônio',()=>{
  const summary=accountBalancesByPurpose(data.accounts,[],[]);
  expect(summary).toEqual({availableCents:400000,investmentCents:650000,totalCents:1050000});
 });
 it('apresenta o mesmo caixa nos dois acessos sem adicionar os CDBs à projeção',()=>{
  const first=projectedWithCarryForward(data,'all',uid,'2026-11',2,'2026-11');
  const second=projectedWithCarryForward(data,'all','partner2','2026-11',2,'2026-11');
  expect(first).toEqual(second);
  expect(first[0].cumulativeCents).toBe(400000);
  expect(first[1].cumulativeCents).toBe(400000);
 });
 it('despesa acima do dinheiro em conta pressiona a projeção mesmo havendo CDBs',()=>{
  const expense:Tx={
   id:'bill',owner_id:uid,household_id:home,scope:'shared',description:'Despesa prevista',
   type:'expense',category:'Compras',amount_cents:450000,
   transaction_date:'2026-11-01',due_date:'2026-11-15',paid_at:null,
   account_id:'bank',card_id:null,installment_group_id:null,
   installment_number:null,installment_total:null,recurring_rule_id:null
  };
  const withExpense={...data,transactions:[expense]};
  const months=projectedWithCarryForward(withExpense,'all',uid,'2026-11',1,'2026-11');
  expect(months[0].cumulativeCents).toBe(-50000);
  const scenario=simulatePurchase(withExpense,'all',uid,'2026-11',1,{
   amountCents:10000,amountMode:'total',installments:1,purchaseMonth:'2026-11',
   purchaseDay:10,category:'Lazer',cardId:null
  });
  expect(scenario.withPurchase[0].cumulativeCents).toBe(-60000);
  expect(scenario.monthsWithDeficit).toContain('2026-11');
 });
});
