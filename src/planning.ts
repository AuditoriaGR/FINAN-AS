import type {Budget, MoneyType, Scope, Tables, Tx} from './types';
import {
  activeCardLimit,dueDate,invoiceMonthForPurchase,isoMonth,monthShift,today,
  recurringDueDateForCharge,visible
} from './finance';

export type PlanningView='all'|'mine'|'shared';
export type EffectiveBudget=Budget&{sourceMonth:string};
export type PlanExpense={category:string;scope:Scope;owner_id:string;household_id:string|null;card_id:string|null;type:MoneyType;amount_cents:number};
export type BudgetFloor={budget:EffectiveBudget;knownCents:number;extraCents:number;probablyCard:boolean};
export type PlannedMonth={
 month:string;incomeCents:number;knownExpenseCents:number;
 budgetReserveCents:number;cardReserveCents:number;expenseCents:number;
 balanceCents:number;cumulativeCents:number;
 cardCommittedCents:number;cardLimitCents:number|null;
 budgetFloors:BudgetFloor[];hasIncome:boolean
};

const budgetKey=(b:Budget)=>
  b.scope==='shared'? `shared:${b.household_id}:${b.category}` : `private:${b.owner_id}:${b.category}`;

export function effectiveCategoryBudgets(data:Tables,view:PlanningView,uid:string,month:string):EffectiveBudget[]{
 const eligible=visible(data.category_budgets,view,uid)
  .filter(b=>b.month<=month)
  .sort((a,b)=>b.month.localeCompare(a.month));
 const keys=new Set<string>();
 const selected:EffectiveBudget[]=[];
 for(const b of eligible){
  const key=budgetKey(b);
  if(keys.has(key))continue;
  keys.add(key);selected.push({...b,month,sourceMonth:b.month});
 }
 return selected.sort((a,b)=>a.category.localeCompare(b.category,'pt-BR'));
}

export function expectedMonthlyRows(data:Tables,view:PlanningView,uid:string,month:string):PlanExpense[]{
 const txs=visible(data.transactions,view,uid);
 const rules=visible(data.recurring_rules,view,uid);
 const cards=visible(data.credit_cards,view,uid);
 const rows:PlanExpense[]=txs.filter(t=>isoMonth(t.due_date)===month)
   .map(t=>({category:t.category,type:t.type,scope:t.scope,owner_id:t.owner_id,
     household_id:t.household_id,card_id:t.card_id,amount_cents:t.amount_cents}));
 for(const r of rules){
  if(r.is_active===false)continue;
  const chargeMonths=r.card_id?[month,monthShift(month,-1),monthShift(month,-2)]:[month];
  for(const chargeMonth of chargeMonths){
   if(r.start_month>chargeMonth||(r.end_month&&r.end_month<chargeMonth))continue;
   const due=recurringDueDateForCharge(r,chargeMonth,cards,txs);
   if(isoMonth(due)!==month)continue;
   // Uma fatura real informada manualmente já cobre o total dessas cobranças.
   if(r.card_id&&data.card_statement_totals.some(st=>st.card_id===r.card_id&&st.statement_month===month))continue;
   if(txs.some(t=>t.recurring_rule_id===r.id&&isoMonth(t.transaction_date)===chargeMonth))continue;
   rows.push({category:r.category,type:r.type,scope:r.scope,owner_id:r.owner_id,
     household_id:r.household_id,card_id:r.card_id??null,amount_cents:r.amount_cents});
  }
 }
 // Diferença entre fatura oficial e compras já detalhadas; pode ser negativa
 // quando o cadastro de lançamentos supera o total informado no banco.
 for(const card of cards){
  const record=data.card_statement_totals.find(st=>st.card_id===card.id&&st.statement_month===month);
  if(!record)continue;
  const itemized=txs.filter(t=>t.card_id===card.id&&t.type==='expense'&&isoMonth(t.due_date)===month)
   .reduce((sum,t)=>sum+t.amount_cents,0);
  const diff=record.actual_amount_cents-itemized;
  if(diff!==0)rows.push({category:'Fatura sem detalhamento',type:'expense',
   scope:card.scope,owner_id:card.owner_id,household_id:card.household_id,card_id:card.id,amount_cents:diff});
 }
 return rows;
}

function matchesBudget(row:PlanExpense,budget:Budget){
 return row.type==='expense'&&row.category===budget.category&&row.scope===budget.scope
  &&(budget.scope==='shared'?row.household_id===budget.household_id:row.owner_id===budget.owner_id);
}

/** Piso de despesas: cada limite de categoria vigente é tratado como reserva MÍNIMA
 * do mês, sem somar de novo despesas e recorrências já reconhecidas.
 * O teto do cartão é outra reserva: só é complementado após abater despesas lançadas
 * e a parcela de reserva de categorias comprovadamente usadas no cartão.
 */
export function protectedProjection(data:Tables,view:PlanningView,uid:string,start:string,months=12):PlannedMonth[]{
 let cumulativeCents=0;
 const cards=visible(data.credit_cards,view,uid);
 const cardIds=new Set(cards.map(c=>c.id));
 const txHistory=visible(data.transactions,view,uid);
 const ruleHistory=visible(data.recurring_rules,view,uid);
 return Array.from({length:months},(_,i)=>{
  const month=monthShift(start,i);
  const rows=expectedMonthlyRows(data,view,uid,month);
  const incomeCents=rows.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount_cents,0);
  const expenses=rows.filter(r=>r.type==='expense');
  const knownExpenseCents=expenses.reduce((s,r)=>s+r.amount_cents,0);
  const floors=effectiveCategoryBudgets(data,view,uid,month).map(b=>{
   const knownCents=expenses.filter(e=>matchesBudget(e,b)).reduce((s,e)=>s+e.amount_cents,0);
   const extraCents=Math.max(0,b.amount_cents-knownCents);
   // Identifica categorias que o usuário realmente utiliza no cartão.
   const probablyCard=txHistory.some(t=>t.category===b.category&&!!t.card_id&&cardIds.has(t.card_id)
      &&t.scope===b.scope&&(b.scope==='shared'?t.household_id===b.household_id:t.owner_id===b.owner_id))
     ||ruleHistory.some(r=>r.category===b.category&&!!r.card_id&&cardIds.has(r.card_id)
      &&r.scope===b.scope&&(b.scope==='shared'?r.household_id===b.household_id:r.owner_id===b.owner_id));
   return {budget:b,knownCents,extraCents,probablyCard};
  });
  const budgetReserveCents=floors.reduce((s,b)=>s+b.extraCents,0);
  const cardCommittedCents=expenses.filter(r=>!!r.card_id&&cardIds.has(r.card_id)).reduce((s,r)=>s+r.amount_cents,0);
  // Aplica o teto pessoal apenas à visão consolidada. Em visões parciais,
  // misturar despesas de uma só pessoa com limite de cartões compartilhados
  // geraria resultados inconsistentes.
  const cap=view==='all'?activeCardLimit(data,uid,month):null;
  const cardLimitCents=cap?.amount_cents??null;
  const knownCardFloorCents=floors.filter(x=>x.probablyCard).reduce((s,x)=>s+x.extraCents,0);
  const cardReserveCents=cardLimitCents===null?0:Math.max(0,cardLimitCents-cardCommittedCents-knownCardFloorCents);
  const expenseCents=knownExpenseCents+budgetReserveCents+cardReserveCents;
  const balanceCents=incomeCents-expenseCents;
  cumulativeCents+=balanceCents;
  return {month,incomeCents,knownExpenseCents,budgetReserveCents,cardReserveCents,
   expenseCents,balanceCents,cumulativeCents,cardCommittedCents,cardLimitCents,budgetFloors:floors,hasIncome:incomeCents>0};
 });
}


/** Projeção com saldo transportado entre meses.
 * Mudar a visualização de dezembro para janeiro não zera o acumulado:
 * o resultado de janeiro se soma ao fechamento projetado de dezembro.
 * O marco inicial padrão é o mês atual, nunca o saldo bancário real.
 */
export function projectedWithCarryForward(
 data:Tables,view:PlanningView,uid:string,selectedMonth:string,months=12,
 referenceMonth=today().slice(0,7)
):PlannedMonth[]{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(referenceMonth))throw Error('Mês de projeção inválido');
 if(!Number.isSafeInteger(months)||months<1)throw Error('Período de projeção inválido');
 const ordinal=(m:string)=>Number(m.slice(0,4))*12+Number(m.slice(5,7));
 const anchor=selectedMonth<referenceMonth?selectedMonth:referenceMonth;
 const skip=ordinal(selectedMonth)-ordinal(anchor);
 const full=protectedProjection(data,view,uid,anchor,skip+months);
 return full.slice(skip);
}

export type PurchaseScenario={
 amountCents:number;amountMode:'total'|'installment';installments:number;
 purchaseMonth:string;purchaseDay:number;category:string;cardId:string|null
};
export type PurchaseImpact={
 baseline:PlannedMonth[];withPurchase:PlannedMonth[];
 totalPurchaseCents:number;impactCents:number;absorbedCents:number;
 monthsWithDeficit:string[];monthsOverCardCap:string[];
 categoryOverages:{month:string;category:string;excessCents:number}[];
 verdict:'fits'|'tight'|'insufficient'|'partial';firstDueMonth:string;extendsBeyondHorizon:boolean;
};

/** Um cenário é calculado inteiramente em memória, SEM gravar lançamentos.
 * O impacto líquido respeita os limites existentes: a compra pode ocupar
 * uma reserva já constituída e, nesse caso, não aumentar as despesas previstas.
 */
export function simulatePurchase(data:Tables,view:PlanningView,uid:string,start:string,months:number,input:PurchaseScenario):PurchaseImpact{
 const n=input.installments;
 if(!Number.isSafeInteger(n)||n<1)throw Error('Quantidade de parcelas inválida');
 if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw Error('Valor inválido');
 if(!Number.isSafeInteger(input.purchaseDay)||input.purchaseDay<1||input.purchaseDay>28)throw Error('Informe um dia entre 1 e 28');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.purchaseMonth))throw Error('Mês inválido');
 const card=input.cardId?visible(data.credit_cards,view,uid).find(c=>c.id===input.cardId):undefined;
 if(input.cardId&&!card)throw Error('Cartão não disponível nesta visão');
 const totalPurchaseCents=input.amountMode==='total'?input.amountCents:input.amountCents*n;
 if(!Number.isSafeInteger(totalPurchaseCents)||totalPurchaseCents<=0||totalPurchaseCents<n)throw Error('Valor incompatível com as parcelas');
 const last=monthShift(start,months-1);
 if(input.purchaseMonth<start||input.purchaseMonth>last)
  throw Error('A compra precisa ocorrer dentro dos 12 meses da projeção.');
 const purchaseDate=dueDate(input.purchaseMonth,input.purchaseDay);
 const firstDueMonth=card?invoiceMonthForPurchase(purchaseDate,card.closing_day,card.due_day):input.purchaseMonth;
 const day=card?card.due_day:input.purchaseDay;
 const basePart=Math.floor(totalPurchaseCents/n),extra=totalPurchaseCents%n;
 const extendsBeyondHorizon=n>months+36||monthShift(firstDueMonth,n-1)>last;
 const created:Tx[]=[];
 // Simula somente parcelas cujo vencimento pode cair dentro do horizonte;
 // não cria milhares de registros mesmo para financiamentos muito longos.
 for(let i=0;i<Math.min(n,months+36);i++){
  const dueMonth=monthShift(firstDueMonth,i);
  if(dueMonth>last)break;
  if(dueMonth<start)continue;
  const scope:Scope=card?.scope||'private';
  created.push({
   id:`scenario-${i}`,owner_id:uid,household_id:scope==='shared'?card?.household_id||null:null,
   scope,description:`Simulação de compra (${i+1}/${n})`,type:'expense',category:input.category,
   amount_cents:basePart+(i<extra?1:0),transaction_date:purchaseDate,
   due_date:dueDate(dueMonth,day),paid_at:null,account_id:null,card_id:card?.id||null,
   installment_group_id:'simulation-only',installment_number:i+1,installment_total:n,recurring_rule_id:null
  });
 }
 const baseline=projectedWithCarryForward(data,view,uid,start,months);
 // A simulação é uma NOVA compra: não pode usar como crédito a diferença
 // de uma fatura oficial já confirmada pelo usuário. Preservamos a fatura
 // como fotografia histórica e aumentamos apenas o cenário hipotético.
 const simulatedStatements=data.card_statement_totals.map(st=>{
  const added=created.filter(t=>t.card_id===st.card_id&&isoMonth(t.due_date)===st.statement_month)
   .reduce((sum,t)=>sum+t.amount_cents,0);
  return added?{...st,actual_amount_cents:st.actual_amount_cents+added}:st;
 });
 const simulatedData={...data,transactions:[...data.transactions,...created],card_statement_totals:simulatedStatements};
 const withPurchase=projectedWithCarryForward(simulatedData,view,uid,start,months);
 const impactCents=withPurchase.reduce((s,r,i)=>s+Math.max(0,r.expenseCents-baseline[i].expenseCents),0);
 const monthsWithDeficit=withPurchase.filter(r=>r.balanceCents<0).map(r=>r.month);
 const monthsOverCardCap=withPurchase.filter(r=>r.cardLimitCents!==null&&r.cardCommittedCents>r.cardLimitCents).map(r=>r.month);
 const categoryOverages:{month:string;category:string;excessCents:number}[]=[];
 for(const row of withPurchase){
  const spent=expectedMonthlyRows(simulatedData,view,uid,row.month).filter(r=>r.type==='expense'&&r.category===input.category);
  const original=expectedMonthlyRows(data,view,uid,row.month).filter(r=>r.type==='expense'&&r.category===input.category);
  for(const floor of row.budgetFloors.filter(x=>x.budget.category===input.category)){
   const sum=(arr:PlanExpense[])=>arr.filter(e=>matchesBudget(e,floor.budget)).reduce((s,e)=>s+e.amount_cents,0);
   const newExcess=Math.max(0,sum(spent)-floor.budget.amount_cents);
   const previousExcess=Math.max(0,sum(original)-floor.budget.amount_cents);
   if(newExcess>previousExcess)categoryOverages.push({month:row.month,category:input.category,excessCents:newExcess});
  }
 }
 const missingIncome=withPurchase.some(r=>!r.hasIncome);
 const verdict:PurchaseImpact['verdict']=missingIncome?'insufficient'
  :monthsWithDeficit.length||monthsOverCardCap.length||categoryOverages.length?'tight':extendsBeyondHorizon?'partial':'fits';
 return {baseline,withPurchase,totalPurchaseCents,impactCents,
  absorbedCents:Math.max(0,created.reduce((s,t)=>s+t.amount_cents,0)-impactCents),
  monthsWithDeficit,monthsOverCardCap,categoryOverages,verdict,firstDueMonth,extendsBeyondHorizon};
}

const canReview=new Set(['Assinaturas','Lazer','Compras','Alimentação','Transporte']);
export type SpendingInsights={
 historicalMonths:number;
 months:{month:string;incomeCents:number;expenseCents:number}[];
 averageExpenseCents:number;averageIncomeCents:number;
 opportunities:{category:string;averageCents:number;illustrativeSavingsCents:number;growthPercent:number|null;message:string}[];
 recurringReviews:{id:string;description:string;category:string;amountCents:number;illustrativeSavingsCents:number}[];
 signal:'insufficient'|'negative'|'attention'|'positive';
 projectedSurplusPercent:number|null;
 notes:string[];
};
export function spendingInsights(data:Tables,view:PlanningView,uid:string,anchor:string):SpendingInsights{
 // Apenas meses encerrados: o atual incompleto pode distorcer médias.
 const months=Array.from({length:6},(_,i)=>monthShift(anchor,i-6));
 const txs=visible(data.transactions,view,uid);
 const rows=months.map(month=>{
  const entries=txs.filter(t=>isoMonth(t.due_date)===month);
  // Compras feitas no cartão são compromissos reais, mesmo sem 'pago'.
  const recognized=entries.filter(t=>t.type==='expense'&&(!!t.card_id||!!t.paid_at))
    .reduce((s,t)=>s+t.amount_cents,0);
  // Inclui o saldo oficial das faturas com valor real informado, sem duplicar lançamentos.
  const visibleCards=visible(data.credit_cards,view,uid);
  const adjustment=visibleCards.reduce((sum,c)=>{
   const st=data.card_statement_totals.find(s=>s.card_id===c.id&&s.statement_month===month);
   if(!st)return sum;
   const detail=entries.filter(t=>t.type==='expense'&&t.card_id===c.id).reduce((s,t)=>s+t.amount_cents,0);
   return sum+st.actual_amount_cents-detail;
  },0);
  const expenseCents=recognized+adjustment;
  const incomeCents=entries.filter(t=>t.type==='income'&&!!t.paid_at).reduce((s,t)=>s+t.amount_cents,0);
  return {month,expenseCents,incomeCents};
 });
 const historicalMonths=rows.filter(r=>r.expenseCents>0||r.incomeCents>0).length;
 const lastThree=rows.slice(3);
 const averageExpenseCents=Math.round(lastThree.reduce((s,r)=>s+r.expenseCents,0)/3);
 const averageIncomeCents=Math.round(lastThree.reduce((s,r)=>s+r.incomeCents,0)/3);
 const opportunities:{category:string;averageCents:number;illustrativeSavingsCents:number;growthPercent:number|null;message:string}[]=[];
 if(lastThree.every(r=>r.expenseCents>0)){
  for(const category of canReview){
   const sum=(period:string[])=>txs.filter(t=>period.includes(isoMonth(t.due_date))&&t.type==='expense'
      &&t.category===category&&(!!t.card_id||!!t.paid_at)).reduce((s,t)=>s+t.amount_cents,0);
   const recent=sum(lastThree.map(r=>r.month));
   if(recent<30000)continue;
   const prior=sum(rows.slice(0,3).map(r=>r.month));
   const averageCents=Math.round(recent/3);
   const growthPercent=rows.slice(0,3).every(r=>r.expenseCents>0)&&prior>0
    ?Math.round((recent-prior)/prior*100):null;
   const illustrativeSavingsCents=Math.round(averageCents*.10);
   const message=category==='Assinaturas'
    ?'Revise serviços recorrentes pouco utilizados.'
    :growthPercent!==null&&growthPercent>20
    ?'O gasto cresceu frente aos três meses anteriores; confira os lançamentos.'
    :'Avalie quais itens são opcionais, sem cortar despesas essenciais.';
   opportunities.push({category,averageCents,illustrativeSavingsCents,growthPercent,message});
  }
  opportunities.sort((a,b)=>b.illustrativeSavingsCents-a.illustrativeSavingsCents);
 }
 const recurringReviews=visible(data.recurring_rules,view,uid)
  .filter(r=>r.type==='expense'&&r.is_active!==false&&r.start_month<=anchor
    &&(!r.end_month||r.end_month>=anchor)
    &&['Assinaturas','Lazer','Compras'].includes(r.category))
  .map(r=>({id:r.id,description:r.description,category:r.category,
    amountCents:r.amount_cents,illustrativeSavingsCents:Math.round(r.amount_cents*.1)}))
  .sort((a,b)=>b.amountCents-a.amountCents).slice(0,5);
 const next=protectedProjection(data,view,uid,anchor,3);
 const totalIncome=next.reduce((s,r)=>s+r.incomeCents,0);
 const totalExpense=next.reduce((s,r)=>s+r.expenseCents,0);
 const projectedSurplusPercent=totalIncome>0?Math.round((totalIncome-totalExpense)/totalIncome*100):null;
 const signal:SpendingInsights['signal']=projectedSurplusPercent===null?'insufficient'
  :projectedSurplusPercent<0?'negative':projectedSurplusPercent<15?'attention':'positive';
 const notes=[
  'Tendências usam gastos pagos fora do cartão e compras registradas no cartão; cobranças pendentes sem pagamento não contam como gasto realizado.',
  'Oportunidades são cenários de redução ilustrativos de 10%, não economias garantidas.',
  'A margem futura inclui reservas de orçamento; não é saldo disponível no banco.'
 ];
 if(historicalMonths<3)notes.unshift('Menos de três meses encerrados com movimentações: ainda não há histórico suficiente para tendências confiáveis.');
 if(totalIncome===0)notes.unshift('Cadastre suas receitas futuras para avaliar a margem financeira com segurança.');
 return {historicalMonths,months:rows,averageExpenseCents,averageIncomeCents,
  opportunities:opportunities.slice(0,5),recurringReviews,signal,projectedSurplusPercent,notes};
}
