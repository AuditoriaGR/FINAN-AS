import {describe,it,expect} from 'vitest';
import {blankData,type Tables,type Budget,type Tx,type Recurring,type Card} from '../src/types';
import {effectiveCategoryBudgets,expectedMonthlyRows,protectedProjection,projectedWithCarryForward,simulatePurchase,spendingInsights} from '../src/planning';
import {generateAlerts} from '../src/finance';

const uid='u1',house='home';
const tx=(id:string,month:string,category:string,amount_cents:number,more:Partial<Tx>={}):Tx=>({
 id,owner_id:uid,household_id:null,scope:'private',description:id,type:'expense',
 category,amount_cents,transaction_date:month+'-05',due_date:month+'-10',paid_at:month+'-10',
 account_id:null,card_id:null,installment_group_id:null,installment_number:null,installment_total:null,
 recurring_rule_id:null,...more
});
const budget=(id:string,month:string,category:string,amount_cents:number,more:Partial<Budget>={}):Budget=>({
 id,owner_id:uid,household_id:null,scope:'private',month,category,amount_cents,...more
});
const rule=(id:string,type:'income'|'expense',category:string,amount_cents:number,more:Partial<Recurring>={}):Recurring=>({
 id,owner_id:uid,household_id:null,scope:'private',type,description:id,category,
 amount_cents,day_of_month:10,account_id:null,card_id:null,start_month:'2026-11',end_month:null,
 is_active:true,amount_mode:'fixed',...more
});
const card:Card={id:'card',owner_id:uid,household_id:null,scope:'private',name:'Meu cartão',
 credit_limit_cents:500000,closing_day:20,due_day:5};

describe('planejamento protegido',()=>{
 it('carrega orçamento por categoria adiante e permite atualizar valor a partir de janeiro',()=>{
  const data:Tables={...blankData,category_budgets:[
    budget('b1','2026-11','Supermercado',90000),
    budget('b2','2027-01','Supermercado',110000)
  ],transactions:[tx('groceries','2026-11','Supermercado',40000)]};
  const months=protectedProjection(data,'all',uid,'2026-11',4);
  expect(months.map(x=>x.expenseCents)).toEqual([90000,90000,110000,110000]);
  expect(months[0].budgetReserveCents).toBe(50000);
  expect(months[1].budgetReserveCents).toBe(90000);
  expect(effectiveCategoryBudgets(data,'all',uid,'2026-12')[0].sourceMonth).toBe('2026-11');
  expect(effectiveCategoryBudgets(data,'all',uid,'2027-02')[0].sourceMonth).toBe('2027-01');
 });
 it('um orçamento compartilhado não substitui o privado da mesma categoria',()=>{
  const data:Tables={...blankData,category_budgets:[
   budget('private','2026-11','Supermercado',50000),
   budget('shared','2026-11','Supermercado',60000,{scope:'shared',household_id:house})
  ]};
  const result=protectedProjection(data,'all',uid,'2026-11',1)[0];
  expect(result.budgetReserveCents).toBe(110000);
  expect(result.budgetFloors).toHaveLength(2);
 });
 it('soma piso de categoria do cartão com teto do cartão sem contar duas vezes',()=>{
  const data:Tables={...blankData,credit_cards:[card],category_budgets:[
   budget('b','2026-11','Compras',90000)
  ],card_spending_limits:[{id:'lim',owner_id:uid,effective_month:'2026-11',amount_cents:150000}],
  transactions:[tx('purchase','2026-11','Compras',40000,{card_id:card.id,paid_at:null})]};
  const r=protectedProjection(data,'all',uid,'2026-11',1)[0];
  expect(r.knownExpenseCents).toBe(40000);
  expect(r.budgetReserveCents).toBe(50000);
  expect(r.cardReserveCents).toBe(60000);
  expect(r.expenseCents).toBe(150000);
 });
 it('mantém alerta de limite de categoria mesmo no mês seguinte ao cadastro',()=>{
  const data:Tables={...blankData,category_budgets:[budget('b','2026-11','Compras',20000)],
   transactions:[tx('compras','2026-12','Compras',19000)]};
  const alerts=generateAlerts(data,'all',uid,'2026-12');
  expect(alerts.some(a=>a.title.startsWith('Compras:')&&a.kind==='warn')).toBe(true);
 });
 it('preserva separadamente piso de categoria pago fora do cartão e reserva do cartão',()=>{
  const data:Tables={...blankData,category_budgets:[budget('b','2026-11','Moradia',80000)],
   card_spending_limits:[{id:'lim',owner_id:uid,effective_month:'2026-11',amount_cents:120000}]};
  const r=protectedProjection(data,'all',uid,'2026-11',1)[0];
  expect(r.budgetReserveCents).toBe(80000);
  expect(r.cardReserveCents).toBe(120000);
  expect(r.expenseCents).toBe(200000);
 });
 it('receitas e fixos futuros são reconhecidos sem repetir valores já materializados',()=>{
  const incomeRule=rule('salary','income','Salário',300000);
  const expenseRule=rule('internet','expense','Assinaturas',30000);
  const materialized=tx('already','2026-11','Assinaturas',30000,
   {recurring_rule_id:'internet',transaction_date:'2026-11-10',paid_at:null});
  const data:Tables={...blankData,recurring_rules:[incomeRule,expenseRule],transactions:[materialized]};
  expect(expectedMonthlyRows(data,'all',uid,'2026-11').reduce((s,x)=>s+(x.type==='expense'?x.amount_cents:0),0)).toBe(30000);
  const p=protectedProjection(data,'all',uid,'2026-11',2);
  expect(p.map(x=>x.incomeCents)).toEqual([300000,300000]);
  expect(p.map(x=>x.expenseCents)).toEqual([30000,30000]);
 });
 it('teto pessoal dos cartões é aplicado somente na visão consolidada',()=>{
  const data:Tables={...blankData,card_spending_limits:[{id:'cap',owner_id:uid,effective_month:'2026-11',amount_cents:200000}]};
  expect(protectedProjection(data,'all',uid,'2026-11',1)[0].cardReserveCents).toBe(200000);
  expect(protectedProjection(data,'mine',uid,'2026-11',1)[0].cardReserveCents).toBe(0);
 });
});

describe('saldo projetado acumulado entre meses',()=>{
 it('dezembro sobra R$ 1.000, janeiro sobra R$ 80: janeiro acumulado R$ 1.080',()=>{
  const data:Tables={...blankData,transactions:[
   tx('dec-income','2026-12','Salário',100000,{type:'income'}),
   tx('jan-income','2027-01','Renda extra',8000,{type:'income'})
  ]};
  const december=projectedWithCarryForward(data,'all',uid,'2026-12',2,'2026-11');
  expect(december.map(m=>m.balanceCents)).toEqual([100000,8000]);
  expect(december.map(m=>m.cumulativeCents)).toEqual([100000,108000]);
  const january=projectedWithCarryForward(data,'all',uid,'2027-01',1,'2026-11');
  expect(january[0].balanceCents).toBe(8000);
  expect(january[0].cumulativeCents).toBe(108000);
 });
 it('inclui déficits negativos dos meses anteriores no saldo acumulado',()=>{
  const data:Tables={...blankData,transactions:[
   tx('income','2026-12','Salário',100000,{type:'income'}),
   tx('expense','2027-01','Moradia',40000)
  ]};
  const january=projectedWithCarryForward(data,'all',uid,'2027-01',1,'2026-12')[0];
  expect(january.balanceCents).toBe(-40000);
  expect(january.cumulativeCents).toBe(60000);
 });
 it('aplica as reservas orçamentárias mês a mês ao transportar o saldo',()=>{
  const data:Tables={...blankData,
   recurring_rules:[rule('salary','income','Salário',150000)],
   category_budgets:[budget('floor','2026-11','Moradia',120000)]
  };
  const january=projectedWithCarryForward(data,'all',uid,'2027-01',1,'2026-11')[0];
  expect(january.balanceCents).toBe(30000);
  expect(january.cumulativeCents).toBe(90000);
 });
 it('não adiciona automaticamente o saldo das contas bancárias ao saldo projetado',()=>{
  const data:Tables={...blankData,accounts:[{id:'bank',owner_id:uid,household_id:null,scope:'private',
   name:'Conta',kind:'Corrente',opening_balance_cents:500000}],
   transactions:[tx('income','2026-12','Salário',100000,{type:'income'})]
  };
  const result=projectedWithCarryForward(data,'all',uid,'2026-12',1,'2026-12');
  expect(result[0].cumulativeCents).toBe(100000);
 });
});

describe('simulador não persistente de compras',()=>{
 it('uma compra que cabe na reserva não aumenta a despesa protegida',()=>{
  const data:Tables={...blankData,recurring_rules:[rule('salary','income','Salário',220000)],
   category_budgets:[budget('b','2026-11','Compras',120000)]};
  const previous=data.transactions.length;
  const x=simulatePurchase(data,'all',uid,'2026-11',3,{
    amountCents:60000,amountMode:'total',installments:1,purchaseMonth:'2026-11',purchaseDay:10,
    category:'Compras',cardId:null
  });
  expect(x.totalPurchaseCents).toBe(60000);
  expect(x.impactCents).toBe(0);
  expect(x.absorbedCents).toBe(60000);
  expect(x.withPurchase[0].expenseCents).toBe(120000);
  expect(x.verdict).toBe('fits');
  expect(data.transactions).toHaveLength(previous);
 });
 it('detecta mês deficitário com compra fora da reserva',()=>{
  const data:Tables={...blankData,recurring_rules:[rule('salary','income','Salário',100000)],
   category_budgets:[budget('b','2026-11','Supermercado',85000)]};
  const x=simulatePurchase(data,'all',uid,'2026-11',2,{
   amountCents:30000,amountMode:'total',installments:1,purchaseMonth:'2026-11',purchaseDay:10,
   category:'Viagem',cardId:null
  });
  expect(x.impactCents).toBe(30000);
  expect(x.monthsWithDeficit).toContain('2026-11');
  expect(x.verdict).toBe('tight');
 });
 it('reconhece compras parceladas na fatura e alerta quando a reserva do cartão estoura',()=>{
  const data:Tables={...blankData,credit_cards:[card],recurring_rules:[rule('salary','income','Salário',250000)],
   card_spending_limits:[{id:'cap',owner_id:uid,effective_month:'2026-11',amount_cents:50000}],
   transactions:[tx('existing','2026-12','Compras',20000,{card_id:card.id,paid_at:null})]};
  const x=simulatePurchase(data,'all',uid,'2026-11',4,{
   amountCents:80000,amountMode:'total',installments:2,purchaseMonth:'2026-11',purchaseDay:10,
   category:'Compras',cardId:'card'
  });
  expect(x.firstDueMonth).toBe('2026-12');
  expect(x.withPurchase[1].cardCommittedCents).toBe(60000);
  expect(x.monthsOverCardCap).toContain('2026-12');
  expect(x.verdict).toBe('tight');
 });
 it('sinaliza análise parcial quando há prestações após o horizonte de 12 meses',()=>{
  const data:Tables={...blankData,recurring_rules:[rule('salary','income','Salário',150000)]};
  const x=simulatePurchase(data,'all',uid,'2026-11',12,{
   amountCents:240000,amountMode:'total',installments:24,purchaseMonth:'2026-11',
   purchaseDay:10,category:'Compras',cardId:null
  });
  expect(x.extendsBeyondHorizon).toBe(true);
  expect(x.verdict).toBe('partial');
  expect(x.impactCents).toBe(120000);
 });
 it('não considera compras fora do período simulado',()=>{
  expect(()=>simulatePurchase(blankData,'all',uid,'2026-11',12,{
    amountCents:120000,amountMode:'total',installments:1,
    purchaseMonth:'2028-11',purchaseDay:10,category:'Compras',cardId:null
  })).toThrow('12 meses');
 });
 it('reconhece valor individual de parcela',()=>{
  const data:Tables={...blankData};
  const x=simulatePurchase(data,'all',uid,'2026-11',3,{
   amountCents:15000,amountMode:'installment',installments:4,
   purchaseMonth:'2026-11',purchaseDay:10,category:'Compras',cardId:null
  });
  expect(x.totalPurchaseCents).toBe(60000);
  expect(x.withPurchase.map(r=>r.expenseCents)).toEqual([15000,15000,15000]);
  expect(x.impactCents).toBe(45000);
  expect(x.verdict).toBe('insufficient');
 });
});

describe('tendências e oportunidades',()=>{
 it('não inventa cortes com histórico insuficiente',()=>{
  const i=spendingInsights(blankData,'all',uid,'2026-11');
  expect(i.historicalMonths).toBe(0);
  expect(i.opportunities).toHaveLength(0);
  expect(i.signal).toBe('insufficient');
  expect(i.notes.some(x=>x.includes('três meses'))).toBe(true);
 });
 it('detecta oportunidade ilustrativa em gastos revisáveis com três meses completos',()=>{
  const data:Tables={...blankData,transactions:[
   tx('a','2026-08','Assinaturas',15000),
   tx('b','2026-09','Assinaturas',18000),
   tx('c','2026-10','Assinaturas',21000),
  ]};
  const i=spendingInsights(data,'all',uid,'2026-11');
  expect(i.historicalMonths).toBe(3);
  expect(i.opportunities[0].category).toBe('Assinaturas');
  expect(i.opportunities[0].averageCents).toBe(18000);
  expect(i.opportunities[0].illustrativeSavingsCents).toBe(1800);
  expect(i.opportunities[0].growthPercent).toBeNull();
 });
 it('aponta assinaturas para revisão sem inventar tendência histórica',()=>{
  const data:Tables={...blankData,recurring_rules:[
   rule('stream','expense','Assinaturas',4500),
   rule('luz','expense','Energia elétrica',16000)
  ]};
  const result=spendingInsights(data,'all',uid,'2026-11');
  expect(result.historicalMonths).toBe(0);
  expect(result.opportunities).toHaveLength(0);
  expect(result.recurringReviews).toHaveLength(1);
  expect(result.recurringReviews[0].description).toBe('stream');
  expect(result.recurringReviews[0].illustrativeSavingsCents).toBe(450);
 });
 it('não trata contas pendentes fora do cartão como gasto realizado',()=>{
  const data:Tables={...blankData,transactions:[
    tx('not-paid','2026-10','Lazer',50000,{paid_at:null}),
    tx('card-spent','2026-10','Assinaturas',15000,{card_id:'card-id',paid_at:null})
  ]};
  const i=spendingInsights(data,'all',uid,'2026-11');
  expect(i.months[5].expenseCents).toBe(15000);
 });
});
