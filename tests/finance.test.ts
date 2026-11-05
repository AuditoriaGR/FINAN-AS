import {describe,it,expect} from 'vitest';
import {accountBalance,budgetStatus,cardInvoice,cents,dueDate,forecast,goalProgress,installmentPlan,invoiceMonthForPurchase,monthShift,totals,installmentSummary,recurringDueDateForCharge,cardSpendingSummary,activeCardLimit,generateAlerts} from '../src/finance';
import {blankData,type Tx} from '../src/types';
const makeTx=(fields:Partial<Tx>):Tx=>({id:'test',owner_id:'u1',household_id:null,scope:'private',description:'Test',type:'expense',category:'Alimentação',amount_cents:10000,transaction_date:'2026-11-01',due_date:'2026-11-10',paid_at:null,account_id:null,card_id:null,installment_group_id:null,installment_number:null,installment_total:null,recurring_rule_id:null,...fields});

describe('limite geral de cartões',()=>{
 const cardA={id:'card-a',owner_id:'u1',household_id:null,scope:'private' as const,name:'Cartão A',credit_limit_cents:200000,closing_day:20,due_day:5};
 const cardB={id:'card-b',owner_id:'u1',household_id:'home',scope:'shared' as const,name:'Cartão B',credit_limit_cents:300000,closing_day:15,due_day:20};
 const otherCard={id:'card-other',owner_id:'u2',household_id:null,scope:'private' as const,name:'Cartão confidencial',credit_limit_cents:400000,closing_day:20,due_day:5};
 const registered=makeTx({id:'tx1',card_id:'card-a',amount_cents:50000,paid_at:null,transaction_date:'2026-11-08',due_date:'2026-12-05'});
 const alreadyFixed=makeTx({id:'tx-fixed',card_id:'card-a',recurring_rule_id:'fixed-a',amount_cents:8000,transaction_date:'2026-11-10',due_date:'2026-12-05'});
 const secondCard=makeTx({id:'tx2',card_id:'card-b',scope:'shared',household_id:'home',amount_cents:40000,transaction_date:'2026-12-04',due_date:'2026-12-20'});
 const fixedA={id:'fixed-a',owner_id:'u1',household_id:null,scope:'private' as const,type:'expense' as const,description:'Assinatura',category:'Assinaturas',amount_cents:8000,day_of_month:10,account_id:null,card_id:'card-a',start_month:'2026-11',end_month:null};
 const fixedB={id:'fixed-b',owner_id:'u1',household_id:'home',scope:'shared' as const,type:'expense' as const,description:'Serviço',category:'Assinaturas',amount_cents:12000,day_of_month:10,account_id:null,card_id:'card-b',start_month:'2026-12',end_month:null};
 const limit={id:'limit1',owner_id:'u1',effective_month:'2026-11',amount_cents:150000};
 const data={...blankData,credit_cards:[cardA,cardB,otherCard],transactions:[
  registered,alreadyFixed,secondCard,
  makeTx({id:'private-partner-tx',owner_id:'u2',card_id:'card-other',amount_cents:300000,due_date:'2026-12-05'}),
  makeTx({id:'partner-shared-tx',owner_id:'u2',scope:'shared',household_id:'home',card_id:'card-other',amount_cents:200000,due_date:'2026-12-05'})
 ],recurring_rules:[fixedA,fixedB],card_spending_limits:[limit],
 card_payments:[{id:'paid',owner_id:'u1',card_id:'card-a',account_id:'bank',statement_month:'2026-12',amount_cents:58000,paid_at:'2026-12-05'}]};
 it('soma todas as faturas visíveis mais somente gastos fixos ainda não lançados',()=>{
  const x=cardSpendingSummary(data,'u1','2026-12');
  expect(x.chargedCents).toBe(98000);
  expect(x.fixedChargedCents).toBe(8000);
  expect(x.fixedPendingCents).toBe(12000);
  expect(x.committedCents).toBe(110000);
  expect(x.remainingCents).toBe(40000);
  expect(x.cards).toHaveLength(2);
  expect(x.percent).toBe(73);
 });
 it('fatura paga permanece contabilizada no limite, sem repetir pagamento',()=>{
  const x=cardSpendingSummary(data,'u1','2026-12');
  expect(x.chargedCents).toBe(98000);
  expect(x.cards.find(c=>c.card_id==='card-a')?.chargedCents).toBe(58000);
 });
 it('não inclui cartão privado do outro integrante, mesmo com despesa compartilhada',()=>{
  const x=cardSpendingSummary(data,'u1','2026-12');
  expect(x.cards.map(c=>c.card_id)).not.toContain('card-other');
  expect(x.committedCents).toBe(110000);
 });
 it('limite configurado segue nos meses futuros até nova revisão',()=>{
  const revised={...data,card_spending_limits:[limit,{id:'later',owner_id:'u1',effective_month:'2027-01',amount_cents:200000},
   {id:'other-limit',owner_id:'u2',effective_month:'2026-01',amount_cents:900000}]};
  expect(activeCardLimit(revised,'u1','2026-10')).toBeNull();
  expect(activeCardLimit(revised,'u1','2026-12')?.amount_cents).toBe(150000);
  expect(activeCardLimit(revised,'u1','2027-02')?.amount_cents).toBe(200000);
  expect(activeCardLimit(revised,'u2','2026-12')?.amount_cents).toBe(900000);
 });
 it('dispara aviso acima de 80% e alerta vermelho a partir de 100%',()=>{
  const near={...data,card_spending_limits:[{...limit,amount_cents:130000}]};
  expect(generateAlerts(near,'all','u1','2026-12').some(a=>a.title.startsWith('Cartões:')&&a.kind==='warn')).toBe(true);
  const over={...data,card_spending_limits:[{...limit,amount_cents:100000}]};
  expect(generateAlerts(over,'all','u1','2026-12').some(a=>a.title.startsWith('Cartões:')&&a.kind==='danger')).toBe(true);
 });
});

describe('regras financeiras',()=>{
 it('aceita 120, 240 e 360 parcelas sem limite de 72',()=>{
  expect(installmentPlan(120000,120,'2026-11',10)).toHaveLength(120);
  expect(installmentPlan(240000,240,'2026-11',10)).toHaveLength(240);
  expect(installmentSummary(360000,360,'total').totalCents).toBe(360000);
 });
 it('calcula o valor total a partir do valor de cada parcela',()=>{
  expect(installmentSummary(45000,120,'installment')).toEqual({totalCents:5400000,firstCents:45000,lastCents:45000,amountPerCents:45000});
 });
 it('divide valor total com centavos sem arredondar o total',()=>{
  expect(installmentSummary(10001,3,'total')).toEqual({totalCents:10001,firstCents:3334,lastCents:3333,amountPerCents:null});
 });
 it('evita parcelas sem valor e estouro de precisão',()=>{
  expect(()=>installmentSummary(5,6,'total')).toThrow();
  expect(()=>installmentSummary(9007199254740991,2,'installment')).toThrow();
  expect(()=>installmentSummary(100,2.5,'total')).toThrow();
 });
 it('divide parcelas mantendo centavos exatos',()=>{const plan=installmentPlan(100001,3,'2026-11',12);expect(plan.map(x=>x.amount_cents)).toEqual([33334,33334,33333]);expect(plan.map(x=>x.due_date)).toEqual(['2026-11-12','2026-12-12','2027-01-12'])});
 it('despesa fixa no cartão entra na fatura do mês correto',()=>{
  const rule={id:'fixed',owner_id:'u1',household_id:null,scope:'private' as const,type:'expense' as const,
    description:'Streaming',category:'Assinaturas',amount_cents:4990,day_of_month:10,
    account_id:null,card_id:'card1',start_month:'2026-11',end_month:null};
  const card={id:'card1',owner_id:'u1',household_id:null,scope:'private' as const,name:'Meu cartão',credit_limit_cents:100000,
    closing_day:20,due_day:5};
  expect(recurringDueDateForCharge(rule,'2026-11',[card])).toBe('2026-12-05');
  expect(forecast({...blankData,credit_cards:[card],recurring_rules:[rule]},'mine','u1','2026-11',3)
    .map(x=>x.expense)).toEqual([0,4990,4990]);
 });
 it('cobrança fixa após fechamento passa para fatura posterior',()=>{
  const rule={id:'fixed',owner_id:'u1',household_id:null,scope:'private' as const,type:'expense' as const,
    description:'Seguro',category:'Assinaturas',amount_cents:7990,day_of_month:25,
    account_id:null,card_id:'card1',start_month:'2026-11',end_month:null};
  const card={id:'card1',owner_id:'u1',household_id:null,scope:'private' as const,name:'Cartão',credit_limit_cents:100000,
    closing_day:20,due_day:5};
  expect(recurringDueDateForCharge(rule,'2026-11',[card])).toBe('2027-01-05');
  expect(forecast({...blankData,credit_cards:[card],recurring_rules:[rule]},'mine','u1','2026-11',3)
    .map(x=>x.expense)).toEqual([0,0,7990]);
 });
 it('fatura não duplica cobrança fixa já gerada',()=>{
  const rule={id:'fixed',owner_id:'u1',household_id:null,scope:'private' as const,type:'expense' as const,
    description:'Streaming',category:'Assinaturas',amount_cents:4990,day_of_month:10,
    account_id:null,card_id:'card1',start_month:'2026-11',end_month:null};
  const card={id:'card1',owner_id:'u1',household_id:null,scope:'private' as const,name:'Meu cartão',credit_limit_cents:100000,
    closing_day:20,due_day:5};
  const tx=makeTx({recurring_rule_id:'fixed',card_id:'card1',amount_cents:4990,
    transaction_date:'2026-11-10',due_date:'2026-12-05',paid_at:null});
  expect(forecast({...blankData,credit_cards:[card],recurring_rules:[rule],transactions:[tx]},'mine','u1','2026-11',3)
    .map(x=>x.expense)).toEqual([0,4990,4990]);
  expect(cardInvoice('card1','2026-12',[tx],[]).charged).toBe(4990);
  expect(accountBalance({id:'bank',owner_id:'u1',household_id:null,scope:'private',name:'Banco',kind:'Corrente',opening_balance_cents:80000},[tx],[])).toBe(80000);
 });
 it('cônjuge pode estimar vencimento sem revelar o cartão privado',()=>{
  const rule={id:'shared-rule',owner_id:'u1',household_id:'house',scope:'shared' as const,
    type:'expense' as const,description:'Assinatura',category:'Assinaturas',amount_cents:2390,
    day_of_month:10,account_id:null,card_id:'private-card',start_month:'2026-11',end_month:null};
  const previous=makeTx({scope:'shared',household_id:'house',owner_id:'u1',recurring_rule_id:'shared-rule',
    card_id:'private-card',transaction_date:'2026-11-10',due_date:'2026-12-05',amount_cents:2390});
  expect(recurringDueDateForCharge(rule,'2026-12',[],[previous])).toBe('2027-01-05');
 });
 it('não conta pagamento da fatura como nova despesa',()=>{const tx=makeTx({card_id:'card',amount_cents:50000});const pay={id:'p1',card_id:'card',owner_id:'u1',account_id:'bank',statement_month:'2026-11',amount_cents:30000,paid_at:'2026-11-11'};expect(cardInvoice('card','2026-11',[tx],[pay]).outstanding).toBe(20000);expect(totals([tx],'2026-11').expense).toBe(50000)});
 it('calcula saldo de conta com compras pagas e pagamentos de fatura',()=>{const account={id:'bank',owner_id:'u1',scope:'private' as const,household_id:null,name:'Banco',kind:'Corrente',opening_balance_cents:120000};const txs=[makeTx({type:'income',paid_at:'2026-11-05',account_id:'bank',amount_cents:20000}),makeTx({type:'expense',paid_at:'2026-11-06',account_id:'bank',amount_cents:10000}),makeTx({type:'expense',paid_at:null,account_id:'bank',amount_cents:10000})];const pay={id:'p',owner_id:'u1',card_id:'card',account_id:'bank',statement_month:'2026-11',amount_cents:20000,paid_at:'2026-11-15'};expect(accountBalance(account,txs,[pay])).toBe(110000)});
 it('orçamento do casal ignora gastos privados',()=>{const b={id:'b',owner_id:'u1',household_id:'h1',scope:'shared' as const,category:'Alimentação',month:'2026-11',amount_cents:15000};const txs=[makeTx({scope:'shared',household_id:'h1',amount_cents:12000}),makeTx({scope:'private',amount_cents:9000})];expect(budgetStatus(b,txs).percent).toBe(80)});
 it('aportes na meta somam sem alterar contas',()=>{const goal={id:'g',owner_id:'u1',household_id:null,scope:'private' as const,name:'Viagem',target_cents:100000,deadline:null};expect(goalProgress(goal,[{id:'a',owner_id:'u1',goal_id:'g',amount_cents:32000,created_at:'2026-11-01'}])).toEqual({saved:32000,percent:32,remaining:68000})});
 it('recorrência projetada não duplica quando lançada',()=>{const rule={id:'r',owner_id:'u1',household_id:null,scope:'private' as const,type:'expense' as const,description:'Internet',category:'Assinaturas',amount_cents:15000,day_of_month:12,account_id:null,start_month:'2026-11',end_month:null};const data={...blankData,recurring_rules:[rule],transactions:[makeTx({recurring_rule_id:'r',category:'Assinaturas',amount_cents:15000})]};expect(forecast(data,'all','u1','2026-11',2).map(x=>x.expense)).toEqual([15000,15000])});
 it('considera fechamento e vencimento do cartão',()=>{expect(invoiceMonthForPurchase('2026-11-25',28,5)).toBe('2026-12');expect(invoiceMonthForPurchase('2026-11-29',28,5)).toBe('2027-01');expect(invoiceMonthForPurchase('2026-11-05',2,12)).toBe('2026-12')});
 it('prepara vencimento com último dia do mês',()=>{expect(dueDate('2027-02',31)).toBe('2027-02-28');expect(monthShift('2026-12',1)).toBe('2027-01')});
 it('parcela despesas e receitas fora do cartão com centavos exatos',()=>{const parts=installmentPlan(100001,3,'2026-11',10);expect(parts.map(p=>p.amount_cents)).toEqual([33334,33334,33333]);expect(parts.map(p=>p.due_date)).toEqual(['2026-11-10','2026-12-10','2027-01-10']);expect(parts.reduce((sum,p)=>sum+p.amount_cents,0)).toBe(100001)});
 it('regra fixa pausada não entra nas projeções',()=>{const rule={id:'r',owner_id:'u1',household_id:null,scope:'private' as const,type:'income' as const,description:'Salário',category:'Salário',amount_cents:500000,day_of_month:5,account_id:null,start_month:'2026-11',end_month:null,is_active:false};expect(forecast({...blankData,recurring_rules:[rule]},'all','u1','2026-11',2).map(x=>x.income)).toEqual([0,0])});
 it('converte reais para centavos sem erro binário',()=>{expect(cents('1.234,56')).toBe(123456);expect(cents('0,29')).toBe(29);expect(cents('1.005,01')).toBe(100501);expect(cents('0,00')).toBe(0);expect(cents('-150,25')).toBe(-15025);expect(Number.isNaN(cents('1,234'))).toBe(true)});
});