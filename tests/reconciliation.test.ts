import {describe,it,expect} from 'vitest';
import {accountBalance,cardInvoice,cardSpendingSummary,forecast,adjustedMonthlyTotals} from '../src/finance';
import {expectedMonthlyRows,protectedProjection,simulatePurchase,spendingInsights} from '../src/planning';
import {blankData,type Account,type Card,type CardStatementTotal,type Tx,type Recurring} from '../src/types';

const account:Account={id:'bank',owner_id:'u1',household_id:null,scope:'private',name:'Minha conta',kind:'Conta corrente',opening_balance_cents:100000};
const card:Card={id:'card',owner_id:'u1',household_id:null,scope:'private',name:'Cartão',credit_limit_cents:300000,closing_day:20,due_day:5};
const tx=(id:string,amount_cents:number,more:Partial<Tx>={}):Tx=>({
 id,owner_id:'u1',household_id:null,scope:'private',description:id,
 type:'expense',category:'Compras',amount_cents,transaction_date:'2026-11-10',
 due_date:'2026-12-05',paid_at:null,account_id:null,card_id:'card',
 installment_group_id:null,installment_number:null,installment_total:null,recurring_rule_id:null,...more
});
const statement=(value:number,month='2026-12'):CardStatementTotal=>({
 id:'statement',card_id:'card',owner_id:'u1',statement_month:month,actual_amount_cents:value,
 notes:'Saldo real no aplicativo do banco',created_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z'
});
const fixed:Recurring={id:'fixed',owner_id:'u1',household_id:null,scope:'private',type:'expense',
 description:'Streaming',category:'Assinaturas',amount_cents:5000,day_of_month:10,account_id:null,
 card_id:'card',start_month:'2026-11',end_month:null,is_active:true,amount_mode:'fixed'};

describe('conciliação de saldos bancários',()=>{
 it('atinge o saldo real sem criar receita nem despesa fictícia',()=>{
  const entries=[
   tx('salary',20000,{type:'income',card_id:null,account_id:'bank',paid_at:'2026-11-04'}),
   tx('groceries',10000,{card_id:null,account_id:'bank',paid_at:'2026-11-04'})
  ];
  const payments=[{id:'payment',card_id:'card',owner_id:'u1',account_id:'bank',statement_month:'2026-11',amount_cents:5000,paid_at:'2026-11-04'}];
  const before=accountBalance(account,entries,payments);
  expect(before).toBe(105000);
  const history=[{id:'adj',account_id:'bank',owner_id:'u1',delta_cents:45000,balance_before_cents:105000,
   balance_after_cents:150000,reason:'Saldo real',created_at:'2026-11-05T12:00:00Z'}];
  expect(accountBalance(account,entries,payments,history)).toBe(150000);
  expect(entries).toHaveLength(2);
  expect(account.opening_balance_cents).toBe(100000);
 });
 it('ajuste negativo também é suportado',()=>{
  const history=[{id:'adj',account_id:'bank',owner_id:'u1',delta_cents:-130000,balance_before_cents:100000,
   balance_after_cents:-30000,reason:'Saldo em cheque especial',created_at:'2026-11-05T12:00:00Z'}];
  expect(accountBalance(account,[],[],history)).toBe(-30000);
 });
});

describe('fatura mensal informada manualmente',()=>{
 it('o valor real substitui lançamentos, sem ser somado a eles',()=>{
  const entries=[tx('old1',40000),tx('old2',25000)];
  const invoice=cardInvoice('card','2026-12',entries,[],[statement(90000)]);
  expect(invoice.itemized).toBe(65000);
  expect(invoice.actual).toBe(90000);
  expect(invoice.charged).toBe(90000);
  expect(invoice.difference).toBe(25000);
  expect(invoice.outstanding).toBe(90000);
 });
 it('as compras antigas detalhadas depois reduzem a diferença sem aumentar a fatura',()=>{
  const entries=[tx('old1',40000),tx('old2',25000),tx('old3',20000)];
  const invoice=cardInvoice('card','2026-12',entries,[],[statement(90000)]);
  expect(invoice.itemized).toBe(85000);
  expect(invoice.difference).toBe(5000);
  expect(invoice.charged).toBe(90000);
 });
 it('quando os detalhes superam a fatura, a diferença negativa fica visível',()=>{
  const invoice=cardInvoice('card','2026-12',[tx('1',100000)],[],[statement(90000)]);
  expect(invoice.charged).toBe(90000);
  expect(invoice.difference).toBe(-10000);
  expect(invoice.outstanding).toBe(90000);
 });
 it('pagamentos reduzem o saldo devedor, mas não a despesa reconhecida',()=>{
  const payments=[{id:'payment',card_id:'card',owner_id:'u1',account_id:'bank',statement_month:'2026-12',amount_cents:30000,paid_at:'2026-12-05'}];
  const invoice=cardInvoice('card','2026-12',[tx('old1',40000)],payments,[statement(90000)]);
  expect(invoice.charged).toBe(90000);
  expect(invoice.paid).toBe(30000);
  expect(invoice.outstanding).toBe(60000);
 });
 it('sem valor real mantém o cálculo original',()=>{
  const invoice=cardInvoice('card','2026-12',[tx('old1',40000)],[]);
  expect(invoice.hasActual).toBe(false);
  expect(invoice.charged).toBe(40000);
  expect(invoice.difference).toBe(0);
 });
 it('limite consolidado dos cartões considera o valor real e não soma fixos duas vezes',()=>{
  const data={...blankData,credit_cards:[card],transactions:[tx('old1',40000)],
   recurring_rules:[fixed],card_statement_totals:[statement(90000)],
   card_spending_limits:[{id:'budget',owner_id:'u1',effective_month:'2026-11',amount_cents:120000}]};
  const sum=cardSpendingSummary(data,'u1','2026-12');
  expect(sum.chargedCents).toBe(90000);
  expect(sum.fixedPendingCents).toBe(0);
  expect(sum.committedCents).toBe(90000);
  expect(sum.remainingCents).toBe(30000);
 });
 it('planejamento e histórico registram diferença sem criar lançamentos duplicados',()=>{
  const data={...blankData,credit_cards:[card],transactions:[tx('old1',40000)],
   card_statement_totals:[statement(90000)],recurring_rules:[fixed]};
  const rows=expectedMonthlyRows(data,'all','u1','2026-12');
  const unknown=rows.find(x=>x.category==='Fatura sem detalhamento');
  expect(unknown?.amount_cents).toBe(50000);
  expect(rows.reduce((s,x)=>s+(x.type==='expense'?x.amount_cents:0),0)).toBe(90000);
  expect(protectedProjection(data,'all','u1','2026-12',1)[0].knownExpenseCents).toBe(90000);
  expect(forecast(data,'all','u1','2026-12',1)[0].expense).toBe(90000);
  expect(spendingInsights(data,'all','u1','2027-01').months[5].expenseCents).toBe(90000);
 });
 it('gráficos e comparações incluem o valor oficial, inclusive os gastos sem detalhe',()=>{
  const data={...blankData,credit_cards:[card],transactions:[tx('old1',40000)],card_statement_totals:[statement(90000)]};
  const totals=adjustedMonthlyTotals(data,'all','u1','2026-12');
  expect(totals.income).toBe(0);
  expect(totals.expense).toBe(90000);
  expect(totals.statementAdjustment).toBe(50000);
  const details=[...data.transactions,tx('old2',20000)];
  const next=adjustedMonthlyTotals({...data,transactions:details},'all','u1','2026-12');
  expect(next.expense).toBe(90000);
  expect(next.statementAdjustment).toBe(30000);
 });
 it('a simulação de uma compra nova aumenta o custo, não utiliza a fatura real antiga',()=>{
  const data={...blankData,credit_cards:[card],transactions:[tx('old1',40000)],
   card_statement_totals:[statement(90000)],
   recurring_rules:[{...fixed,type:'income' as const,card_id:null,amount_cents:180000}]};
  const scenario=simulatePurchase(data,'all','u1','2026-12',2,{
   amountCents:30000,amountMode:'total',installments:1,purchaseMonth:'2026-12',
   purchaseDay:10,category:'Viagem',cardId:'card'
  });
  expect(scenario.withPurchase[1].expenseCents).toBe(30000);
  // Compra dia 10, fechamento 20 e vencimento 5: vai para janeiro.
  expect(scenario.firstDueMonth).toBe('2027-01');
  expect(data.card_statement_totals[0].actual_amount_cents).toBe(90000);
 });
});
