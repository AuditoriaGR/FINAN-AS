import type { Account, BalanceAdjustment, Budget, Card, CardPayment, CardStatementTotal, Contribution, Goal, Recurring, Scope, Tables, Tx } from './types';
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const cents=(value:string | number)=>{
 const raw=String(value).trim();
 const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'): /^-?\d{1,3}(\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
 if(!/^-?\d+(\.\d{1,2})?$/.test(normalized))return NaN;
 const negative=normalized.startsWith('-');const [whole,fraction='']=normalized.replace('-','').split('.');
 const centavos=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(centavos)?(negative?-centavos:centavos):NaN;
};
export const isoMonth=(date:string)=>date.slice(0,7);
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const monthShift=(m:string,offset:number)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+offset,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
export const dueDate=(month:string,day:number)=>{const [y,m]=month.split('-').map(Number);const last=new Date(y,m,0).getDate();return `${month}-${String(Math.min(day,last)).padStart(2,'0')}`};
export const invoiceMonthForPurchase=(date:string,closingDay:number,dueDay:number)=>monthShift(isoMonth(date),(dueDay<=closingDay?1:0)+(Number(date.slice(8,10))>closingDay?1:0));
export const monthName=(m:string)=>new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR',{month:'short',year:'numeric'});
export const unique=<T,>(list:T[])=>Array.from(new Set(list));
export function visible<T extends {scope:Scope;owner_id:string}>(rows:T[],view:'all'|'mine'|'shared',uid:string){return rows.filter(x=>view==='shared'?x.scope==='shared':view==='mine'?x.owner_id===uid:x.scope==='shared'||x.owner_id===uid)}
export function inMonth(t:Tx,month:string){return isoMonth(t.due_date)===month}
export function totals(transactions:Tx[],month:string){const rows=transactions.filter(t=>inMonth(t,month)); return {income:rows.filter(t=>t.type==='income').reduce((a,x)=>a+x.amount_cents,0),expense:rows.filter(t=>t.type==='expense').reduce((a,x)=>a+x.amount_cents,0),paidIncome:rows.filter(t=>t.type==='income'&&(t.paid_at||t.in_opening_balance)).reduce((a,x)=>a+x.amount_cents,0),paidExpense:rows.filter(t=>t.type==='expense'&&(t.paid_at||t.in_opening_balance)).reduce((a,x)=>a+x.amount_cents,0)}}
export function spentCategory(txs:Tx[],month:string,category:string){return txs.filter(t=>t.type==='expense'&&inMonth(t,month)&&t.category===category).reduce((a,t)=>a+t.amount_cents,0)}
export function budgetStatus(b:Budget,txs:Tx[]){const spent=spentCategory(txs.filter(t=>b.scope==='shared'?t.scope==='shared':t.owner_id===b.owner_id),b.month,b.category);return {spent,remaining:b.amount_cents-spent,percent:b.amount_cents?Math.round(spent/b.amount_cents*100):0}}
export function goalProgress(g:Goal,c:Contribution[]){const saved=c.filter(x=>x.goal_id===g.id).reduce((a,x)=>a+x.amount_cents,0);return {saved,percent:g.target_cents?Math.round(saved/g.target_cents*100):0,remaining:Math.max(0,g.target_cents-saved)}}
export function accountBalance(a:Account,txs:Tx[],payments:CardPayment[],adjustments:BalanceAdjustment[]=[]){
 const paid=txs.filter(x=>x.account_id===a.id&&!!x.paid_at&&!x.in_opening_balance).reduce((sum,x)=>sum+(x.type==='income'?x.amount_cents:-x.amount_cents),0);
 const cards=payments.filter(p=>p.account_id===a.id).reduce((sum,p)=>sum+p.amount_cents,0);
 const correction=adjustments.filter(j=>j.account_id===a.id).reduce((sum,j)=>sum+j.delta_cents,0);
 return a.opening_balance_cents+paid-cards+correction;
}
/** Investimentos são patrimônio, mas não representam dinheiro disponível
 * para faturas e compras. A classificação é feita pelo tipo da conta.
 * Um nome CDB também é protegido caso a conta tenha sido cadastrada com
 * o tipo incorreto, sem reclassificar a conta bancária no banco.
 */
export function isInvestmentAccount(account:Pick<Account,'kind'|'name'>):boolean{
 const kind=account.kind.trim().toLocaleLowerCase('pt-BR');
 return kind==='investimentos'||kind==='investimento'||kind==='cdb'||/\bcdb\b/i.test(account.name);
}
export function accountBalancesByPurpose(
 accounts:Account[],txs:Tx[],payments:CardPayment[],adjustments:BalanceAdjustment[]=[]
){
 let availableCents=0,investmentCents=0;
 for(const account of accounts){
  const amount=accountBalance(account,txs,payments,adjustments);
  if(isInvestmentAccount(account))investmentCents+=amount;
  else availableCents+=amount;
 }
 return {availableCents,investmentCents,totalCents:availableCents+investmentCents};
}
export function cardInvoice(cardId:string,month:string,txs:Tx[],payments:CardPayment[],statements:CardStatementTotal[]=[]){
 const itemized=txs.filter(x=>x.card_id===cardId&&isoMonth(x.due_date)===month).reduce((a,x)=>a+x.amount_cents,0);
 const record=statements.find(x=>x.card_id===cardId&&x.statement_month===month);
 const actual=record?.actual_amount_cents??null;
 const charged=actual??itemized;
 const difference=actual===null?0:actual-itemized;
 const paid=payments.filter(x=>x.card_id===cardId&&x.statement_month===month).reduce((a,x)=>a+x.amount_cents,0);
 return {charged,paid,outstanding:Math.max(0,charged-paid),itemized,difference,actual,hasActual:actual!==null};
}
export function cardStatementAdjustment(cardId:string,month:string,data:Tables){
 return cardInvoice(cardId,month,data.transactions,data.card_payments,data.card_statement_totals).difference;
}
/** Usa a fatura oficial também nos indicadores mensais e comparativos.
 * A parcela sem detalhamento não é lançada como transação fictícia. */
export function adjustedMonthlyTotals(data:Tables,view:'all'|'mine'|'shared',uid:string,month:string){
 const txs=visible(data.transactions,view,uid);
 const base=totals(txs,month);
 const cards=visible(data.credit_cards,view,uid);
 const statementAdjustment=cards.reduce((sum,card)=>{
  const record=data.card_statement_totals.find(st=>st.card_id===card.id&&st.statement_month===month);
  if(!record)return sum;
  const detailed=txs.filter(t=>t.card_id===card.id&&isoMonth(t.due_date)===month&&t.type==='expense')
   .reduce((part,t)=>part+t.amount_cents,0);
  return sum+record.actual_amount_cents-detailed;
 },0);
 return {...base,expense:base.expense+statementAdjustment,statementAdjustment};
}
export type InstallmentAmountMode='total'|'installment';
export function installmentSummary(inputCents:number,n:number,mode:InstallmentAmountMode){
 if(!Number.isSafeInteger(n)||n<1)throw Error('Informe uma quantidade inteira e positiva de parcelas');
 if(!Number.isSafeInteger(inputCents)||inputCents<=0)throw Error('Informe um valor positivo e válido');
 if(mode!=='total'&&mode!=='installment')throw Error('Forma de cálculo das parcelas inválida');
 if(mode==='total'&&inputCents<n)throw Error('O valor total deve permitir pelo menos R$ 0,01 em cada parcela');
 const totalCents=mode==='total'?inputCents:inputCents*n;
 if(!Number.isSafeInteger(totalCents))throw Error('O valor total excede a precisão permitida');
 const base=Math.floor(totalCents/n);
 const remainder=totalCents%n;
 return {totalCents,firstCents:base+(remainder>0?1:0),lastCents:base,amountPerCents:mode==='installment'?inputCents:null};
}
export function installmentPlan(amountCents:number,n:number,startingMonth:string,day:number){
 installmentSummary(amountCents,n,'total');
 const base=Math.floor(amountCents/n),rest=amountCents%n;
 return Array.from({length:n},(_,i)=>({amount_cents:base+(i<rest?1:0),due_date:dueDate(monthShift(startingMonth,i),day),installment_number:i+1,installment_total:n}));
}
export function budgetForView(budgets:Budget[],view:'all'|'mine'|'shared',uid:string,month:string){return visible(budgets,view,uid).filter(b=>b.month===month)}
/** Vencimento previsto para uma cobrança feita no mês de referência.
 * Cartão: usa fechamento e vencimento, sem confundir mês da compra com mês da fatura.
 * Para uma regra compartilhada com cartão privado invisível ao segundo integrante,
 * recupera o deslocamento de uma cobrança compartilhada anterior, quando disponível.
 */
export function recurringDueDateForCharge(rule:Recurring,chargeMonth:string,cards:Card[],txs:Tx[]=[]){
 const chargeDate=dueDate(chargeMonth,rule.day_of_month);
 if(!rule.card_id)return chargeDate;
 const card=cards.find(c=>c.id===rule.card_id);
 if(card)return dueDate(invoiceMonthForPurchase(chargeDate,card.closing_day,card.due_day),card.due_day);
 const previous=txs.find(t=>t.recurring_rule_id===rule.id&&t.card_id===rule.card_id);
 if(previous){
  const [dy,dm]=isoMonth(previous.due_date).split('-').map(Number);
  const [cy,cm]=isoMonth(previous.transaction_date).split('-').map(Number);
  return dueDate(monthShift(chargeMonth,(dy*12+dm)-(cy*12+cm)),Number(previous.due_date.slice(8,10)));
 }
 // Não exibe a identidade do cartão privado de outro integrante.
 // Antes da primeira cobrança, esta estimativa é pelo mês da compra.
 return chargeDate;
}
export function forecast(data:Tables,view:'all'|'mine'|'shared',uid:string,start:string,months=12){
 const txs=visible(data.transactions,view,uid);
 const rules=visible(data.recurring_rules,view,uid);
 const cards=visible(data.credit_cards,view,uid);
 return Array.from({length:months},(_,i)=>{
  const month=monthShift(start,i);
  const base=totals(txs,month);
  const knownCards=visible(data.credit_cards,view,uid);
  const adjustments=knownCards.reduce((sum,c)=>sum+cardStatementAdjustment(c.id,month,data),0);
  let income=base.income,expense=base.expense+adjustments;
  for(const r of rules){
   if(r.is_active===false)continue;
   // O vencimento da fatura pode cair até dois meses após a cobrança.
   const chargeMonths=r.card_id?[month,monthShift(month,-1),monthShift(month,-2)]:[month];
   for(const chargeMonth of chargeMonths){
    if(r.start_month>chargeMonth||(r.end_month&&r.end_month<chargeMonth))continue;
    const due=recurringDueDateForCharge(r,chargeMonth,cards,txs);
    if(isoMonth(due)!==month)continue;
    if(r.card_id&&data.card_statement_totals.some(s=>s.card_id===r.card_id&&s.statement_month===month))continue;
    // Um lançamento já criado faz parte do realizado e não deve ser previsto outra vez.
    const exists=txs.some(t=>t.recurring_rule_id===r.id&&isoMonth(t.transaction_date)===chargeMonth);
    if(!exists){
     if(r.type==='income')income+=r.amount_cents;
     else expense+=r.amount_cents;
    }
   }
  }
  return {month,short:monthName(month),income,expense,balance:income-expense};
 });
}
/** Orçamento consolidado de cartões acessíveis ao usuário: uma fatura paga continua
 * fazendo parte do gasto do mês. Assinaturas ainda não lançadas entram na previsão.
 * Cartões particulares da outra pessoa permanecem invisíveis. */
export function activeCardLimit(data:Tables,uid:string,month:string){
 const householdId=data.household_members.find(m=>m.user_id===uid)?.household_id;
 // Shared household budget must be identical for both partners.
 return data.card_spending_limits
   .filter(l=>l.effective_month<=month&&
      (l.household_id?l.household_id===householdId:l.owner_id===uid))
   .sort((a,b)=>b.effective_month.localeCompare(a.effective_month))[0]??null;
}
export function cardSpendingSummary(data:Tables,uid:string,month:string){
 const cards=visible(data.credit_cards,'all',uid);
 const ids=new Set(cards.map(c=>c.id));
 const txs=visible(data.transactions,'all',uid);
 const rules=visible(data.recurring_rules,'all',uid);
 const visibleCardTransactions=txs.filter(t=>t.type==='expense'&&t.card_id&&ids.has(t.card_id));
 const cardRows=cards.map(card=>{
  const entries=visibleCardTransactions.filter(t=>t.card_id===card.id&&isoMonth(t.due_date)===month);
  const invoice=cardInvoice(card.id,month,data.transactions,data.card_payments,data.card_statement_totals);
  const chargedCents=invoice.charged;
  const fixedChargedCents=entries.filter(t=>t.recurring_rule_id!==null).reduce((sum,t)=>sum+t.amount_cents,0);
  let fixedPendingCents=0;
  for(const r of rules){
   if(invoice.hasActual||r.card_id!==card.id||r.type!=='expense'||r.is_active===false)continue;
   for(const chargeMonth of [month,monthShift(month,-1),monthShift(month,-2)]){
    if(r.start_month>chargeMonth||(r.end_month&&r.end_month<chargeMonth))continue;
    const expectedDue=recurringDueDateForCharge(r,chargeMonth,cards,txs);
    if(isoMonth(expectedDue)!==month)continue;
    const exists=txs.some(t=>t.recurring_rule_id===r.id&&isoMonth(t.transaction_date)===chargeMonth);
    if(!exists)fixedPendingCents+=r.amount_cents;
   }
  }
  return {card_id:card.id,name:card.name,chargedCents,fixedChargedCents,fixedPendingCents,committedCents:chargedCents+fixedPendingCents};
 });
 const chargedCents=cardRows.reduce((sum,r)=>sum+r.chargedCents,0);
 const fixedChargedCents=cardRows.reduce((sum,r)=>sum+r.fixedChargedCents,0);
 const fixedPendingCents=cardRows.reduce((sum,r)=>sum+r.fixedPendingCents,0);
 const committedCents=chargedCents+fixedPendingCents;
 const limit=activeCardLimit(data,uid,month);
 const limitCents=limit?.amount_cents??null;
 return {month,limit,limitCents,cards:cardRows,chargedCents,fixedChargedCents,
   fixedPendingCents,committedCents,
   remainingCents:limitCents===null?null:limitCents-committedCents,
   percent:limitCents?Math.round(committedCents/limitCents*100):null};
}
export function generateAlerts(data:Tables,view:'all'|'mine'|'shared',uid:string,month:string){const txs=visible(data.transactions,view,uid),res:{kind:'danger'|'warn'|'info',title:string,detail:string}[]=[];(()=>{const latest=new Map<string,Budget>();
  for(const b of visible(data.category_budgets,view,uid).filter(x=>x.month<=month).sort((a,b)=>b.month.localeCompare(a.month))){
   const key=b.scope==='shared'?`shared:${b.household_id}:${b.category}`:`private:${b.owner_id}:${b.category}`;
   if(!latest.has(key))latest.set(key,{...b,month});
  }
  return Array.from(latest.values())
 })().forEach(b=>{const st=budgetStatus(b,txs);if(st.percent>=80)res.push({kind:st.percent>=100?'danger':'warn',title:`${b.category}: ${st.percent}% do orçamento (${st.percent>=100?'limite excedido':st.percent>=90?'atenção 90%':'atenção 80%'})`,detail:st.remaining<0?`Excedido em ${money(-st.remaining)}`:`Restante: ${money(st.remaining)}`})}); const near=new Date();near.setDate(near.getDate()+7);const future=`${near.getFullYear()}-${String(near.getMonth()+1).padStart(2,'0')}-${String(near.getDate()).padStart(2,'0')}`;txs.filter(t=>t.type==='expense'&&!t.card_id&&!t.paid_at&&t.due_date<=future).forEach(t=>res.push({kind:t.due_date<today()?'danger':'warn',title:t.due_date<today()?'Despesa vencida':'Próximo vencimento',detail:`${t.description} · ${money(t.amount_cents)} · ${t.due_date.split('-').reverse().join('/')}`}));visible(data.credit_cards,view,uid).forEach(card=>{const debt=cardInvoice(card.id,month,data.transactions,data.card_payments,data.card_statement_totals).outstanding;const due=dueDate(month,card.due_day);if(debt>0&&due<=future)res.push({kind:due<today()?'danger':'warn',title:due<today()?'Fatura vencida':'Fatura próxima do vencimento',detail:`${card.name} · ${money(debt)} · ${due.split('-').reverse().join('/')}`})});const projected=forecast(data,view,uid,month,3);if(projected.some(m=>m.balance<0))res.push({kind:'warn',title:'Mês com fluxo negativo',detail:'A previsão indica despesas superiores às receitas em pelo menos um dos próximos 3 meses.'});visible(data.financial_goals,view,uid).forEach(g=>{const p=goalProgress(g,data.goal_contributions);if(g.deadline&&g.deadline<today()&&p.remaining>0)res.push({kind:'warn',title:`Meta atrasada: ${g.name}`,detail:`Faltam ${money(p.remaining)} para concluir.`})});const cap=cardSpendingSummary(data,uid,month);
 if(cap.percent!==null&&cap.percent>=80){
  res.push({kind:cap.percent>=100?'danger':'warn',
   title:`Cartões: ${cap.percent}% do limite total`,
   detail:cap.remainingCents!==null&&cap.remainingCents<0
    ?`Teto excedido em ${money(-cap.remainingCents)}, incluindo os gastos fixos previstos.`
    :`Total comprometido: ${money(cap.committedCents)}. Restante: ${money(cap.remainingCents??0)}.`});
 }
 return res}