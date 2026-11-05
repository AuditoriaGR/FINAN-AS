import {useCallback,useEffect,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import {Area,AreaChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {TrendingUp,LayoutDashboard,ArrowLeftRight,Wallet,CreditCard,PieChart as PieIcon,Target,Bell,ChartNoAxesCombined,CalendarDays,Settings,LogOut,Plus,ArrowUpRight,ArrowDownRight,Users,Menu,X,ChevronLeft,ChevronRight,Check,AlertTriangle,Info,ShieldCheck,Copy,LogIn,Download,RotateCcw,Coins,CheckCircle2} from 'lucide-react';
import type {User} from '@supabase/supabase-js';
import {db,configured} from './supabase';
import {demoData,demoHousehold,demoUser} from './demo';
import FixedCommitments from './FixedCommitments';
import CardSpendingBudget from './CardSpendingBudget';
import FuturePlanning from './FuturePlanning';
import SpendingInsightsPanel from './SpendingInsightsPanel';
import {effectiveCategoryBudgets,protectedProjection} from './planning';
import {blankData,categories,type Tables,type Tx,type Scope,type Household} from './types';
import {money,cents,monthShift,dueDate,today,monthName,visible,adjustedMonthlyTotals,budgetStatus,goalProgress,accountBalance,cardInvoice,generateAlerts,installmentPlan,installmentSummary,invoiceMonthForPurchase,isoMonth,recurringDueDateForCharge,cardSpendingSummary} from './finance';

type Page='dashboard'|'transactions'|'fixed'|'budgets'|'goals'|'cards'|'accounts'|'planning'|'comparison'|'insights'|'alerts'|'settings';
type Modal='transaction'|'budget'|'goal'|'contribution'|'account'|'accountbalance'|'card'|'cardstatement'|'recurring'|'adjustfixed'|'payment'|null;
type View='all'|'mine'|'shared';
const nav:{id:Page;name:string;icon:typeof LayoutDashboard}[]=[{id:'dashboard',name:'Visão geral',icon:LayoutDashboard},{id:'transactions',name:'Lançamentos',icon:ArrowLeftRight},{id:'fixed',name:'Fixas e parcelas',icon:RotateCcw},{id:'budgets',name:'Limites e orçamentos',icon:PieIcon},{id:'goals',name:'Metas',icon:Target},{id:'cards',name:'Cartões',icon:CreditCard},{id:'accounts',name:'Contas',icon:Wallet},{id:'planning',name:'Planejamento',icon:CalendarDays},{id:'comparison',name:'Comparativos',icon:ChartNoAxesCombined},{id:'insights',name:'Tendências e economia',icon:TrendingUp},{id:'alerts',name:'Alertas',icon:Bell},{id:'settings',name:'Configurações',icon:Settings}];
const palette=['#1c7c78','#e3a864','#8691ce','#d27c74','#72a3ba','#bb92a6','#738d71','#ad998a'];
const mDate=(s:string)=>s ? s.split('-').reverse().join('/') : '—';
function IconBadge({children,variant='teal'}:{children:ReactNode;variant?:'teal'|'coral'|'gold'|'blue'}){return <span className={`icon-badge ${variant}`}>{children}</span>}
function Empty({text,action}:{text:string;action?:()=>void}){return <div className="empty"><Coins size={35}/><p>{text}</p>{action&&<button className="link-button" onClick={action}>Criar primeiro registro</button>}</div>}
function Meter({percent}:{percent:number}){return <div className="meter"><span className={percent>=100?'danger':percent>=80?'warn':''} style={{width:`${Math.max(0,Math.min(100,percent))}%`}}/></div>}
function Tag({scope}:{scope:Scope}){return <span className={`tag ${scope}`}>{scope==='shared'?'Casal':'Individual'}</span>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function Badge({children}:{children:ReactNode}){return <span className="top-badge">{children}</span>}
function downloadCSV(txs:Tx[]){const sep=';';const headings=['Data','Vencimento','Descrição','Tipo','Categoria','Valor (R$)','Status','Visibilidade'];const rows=txs.map(t=>[t.transaction_date,t.due_date,t.description,t.type==='income'?'Receita':'Despesa',t.category,(t.amount_cents/100).toFixed(2).replace('.',','),t.paid_at?'Pago':'Pendente',t.scope==='shared'?'Casal':'Individual']);const escape=(v:string)=>`"${v.replaceAll('"','""')}"`;const output='\uFEFF'+[headings,...rows].map(r=>r.map(escape).join(sep)).join('\r\n');const url=URL.createObjectURL(new Blob([output],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='meu-financeiro-lancamentos.csv';a.click();URL.revokeObjectURL(url)}

export default function App(){
 const [user,setUser]=useState<User|null>(null),[authLoaded,setAuthLoaded]=useState(!configured),[authMode,setAuthMode]=useState<'login'|'register'>('login');
 const [authEmail,setAuthEmail]=useState(''),[authPass,setAuthPass]=useState(''),[authName,setAuthName]=useState(''),[authMessage,setAuthMessage]=useState('');
 const [data,setData]=useState<Tables>(()=>structuredClone(configured?blankData:demoData)),[household,setHousehold]=useState<Household|null>(configured?null:demoHousehold);
 const [page,setPage]=useState<Page>('dashboard'),[view,setView]=useState<View>('all'),[month,setMonth]=useState(today().slice(0,7));
 const [modal,setModal]=useState<Modal>(null),[form,setForm]=useState<Record<string,string>>({}),[context,setContext]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[sidebar,setSidebar]=useState(false);
 const [familyName,setFamilyName]=useState('Nossa casa'),[displayName,setDisplayName]=useState(''),[invite,setInvite]=useState(''),[inviteInput,setInviteInput]=useState('');
 const uid=user?.id||demoUser;
 const saveNotice=(v:string)=>{setNotice(v);window.setTimeout(()=>setNotice(''),6500)};
 const refresh=useCallback(async()=>{
  const client=db;
  if(!client)return;
  const who=await client.auth.getUser();if(!who.data.user){setUser(null);setAuthLoaded(true);return}
  const me=who.data.user;setUser(me);
  const tables:(keyof Tables)[]=['account_balance_adjustments','card_statement_totals','card_spending_limits','accounts','credit_cards','transactions','category_budgets','financial_goals','goal_contributions','recurring_rules','card_payments','household_members'];
  const results=await Promise.all(tables.map(async table=>{
    const rows:unknown[]=[];let error:null|{message:string}=null;let offset=0;
    // Paginação evita o limite padrão de 1.000 registros por consulta, importante para parcelamentos longos.
    while(true){
     const r=await client.from(table).select('*').range(offset,offset+499);
     if(r.error){error=r.error;break}
     rows.push(...(r.data||[]));
     if(!r.data||r.data.length<500)break;
     offset+=500;
    }
    return {table,rows,error}
  }));
  const next={...blankData} as Tables;
  for(const item of results){if(item.error)saveNotice(`Falha ao carregar ${item.table}: ${item.error.message}`);(next as unknown as Record<string,unknown[]>)[item.table]=item.rows}
  setData(next);
  const hm=next.household_members.find(m=>m.user_id===me.id);
  if(hm){const r=await client.from('households').select('*').eq('id',hm.household_id).single();setHousehold(r.data as Household|null)}else setHousehold(null);
  setAuthLoaded(true)
 },[]);
 useEffect(()=>{if(!db)return;void refresh();const {data:sub}=db.auth.onAuthStateChange((_event,session)=>{if(!session?.user){setUser(null);setData({...blankData});setHousehold(null);setAuthLoaded(true)}else setTimeout(()=>void refresh(),0)});return()=>sub.subscription.unsubscribe()},[refresh]);
 const handleAuth=async(e:FormEvent)=>{e.preventDefault();if(!db)return;setBusy(true);setAuthMessage('');const result=authMode==='login'?await db.auth.signInWithPassword({email:authEmail,password:authPass}):await db.auth.signUp({email:authEmail,password:authPass,options:{data:{display_name:authName},emailRedirectTo:window.location.origin}});if(result.error)setAuthMessage(result.error.message);else if(authMode==='register'&&!result.data.session)setAuthMessage('Cadastro criado. Confira seu e-mail para confirmar a conta e depois entre.');else{setAuthMessage('');await refresh()}setBusy(false)};
 const handleNewHousehold=async()=>{if(!db||!user)return;setBusy(true);try{const r=await db.rpc('create_household_space',{p_name:familyName.trim(),p_display_name:(displayName||user.user_metadata?.display_name||'Titular').trim()});if(r.error)saveNotice(r.error.message);else{saveNotice('Espaço financeiro criado.');await refresh()}}finally{setBusy(false)}};
 const joinFamily=async()=>{if(!db||!user||!inviteInput.trim())return;setBusy(true);const r=await db.rpc('join_household',{p_token:inviteInput.trim(),p_display_name:displayName||user.user_metadata?.display_name||'Integrante'});if(r.error)saveNotice(r.error.message);else{saveNotice('Convite aceito! Bem-vindo ao grupo.');await refresh()}setBusy(false)};
 const createInvite=async()=>{if(!db||!household)return;const r=await db.rpc('create_household_invitation',{p_household_id:household.id});if(r.error)saveNotice(r.error.message);else{setInvite(String(r.data));saveNotice('Convite gerado. Compartilhe o código por um canal seguro.')}};
 const create=async(table:keyof Tables,payload:Record<string,unknown>|Record<string,unknown>[])=>{if(!db){const vals=(Array.isArray(payload)?payload:[payload]).map(p=>({...p,id:crypto.randomUUID(),created_at:today()}));setData(old=>({...old,[table]:[...((old as unknown as Record<string,unknown[]>)[table]||[]),...vals]}));saveNotice('Registro adicionado à demonstração (não persistente).');return true}const r=await db.from(table).insert(payload as never);if(r.error){saveNotice(r.error.message);return false}await refresh();saveNotice('Registro salvo com sucesso.');return true};
 const patch=async(table:keyof Tables,id:string,fields:Record<string,unknown>)=>{if(!db){setData(old=>({...old,[table]:(old[table] as {id?:string}[]).map(x=>x.id===id?{...x,...fields}:x)}));saveNotice('Demonstração atualizada.');return true}const r=await db.from(table).update(fields as never).eq('id',id);if(r.error){saveNotice(r.error.message);return false}await refresh();saveNotice('Registro atualizado.');return true};
 const del=async(table:keyof Tables,id:string)=>{if(!window.confirm('Excluir este registro? Esta ação não pode ser desfeita.'))return;if(!db){setData(old=>({...old,[table]:(old[table] as {id?:string}[]).filter(x=>x.id!==id)}));return}const r=await db.from(table).delete().eq('id',id);if(r.error)saveNotice(r.error.message);else{await refresh();saveNotice('Registro excluído.')}};
 const open=(m:Modal,id='')=>{
  setModal(m);setContext(id);
  const initial={scope:household?'shared':'private',type:'expense',category:'Supermercado',date:today(),due:today(),month,amount:'',installments:'1',installmentAmountMode:'total',fixedAmountMode:'fixed',day:'10',closing:'2',dueDay:'12',kind:'Conta corrente',deadline:'',name:'',description:'',paid:'no',...(m==='account'?{amount:'0,00'}:{})};
  const existing=(m==='recurring'||m==='adjustfixed')&&id?data.recurring_rules.find(r=>r.id===id):null;
  const actual=m==='adjustfixed'&&existing?data.transactions.find(t=>t.recurring_rule_id===existing.id&&isoMonth(t.transaction_date)===month):null;
  if(m==='accountbalance'){
   const account=data.accounts.find(a=>a.id===id);
   if(account){const value=accountBalance(account,data.transactions,data.card_payments,data.account_balance_adjustments);
    setForm({...initial,amount:(value/100).toFixed(2).replace('.',','),reason:'Conciliação de saldo atual'});return}
  }
  if(m==='cardstatement'){
   const card=data.credit_cards.find(c=>c.id===id);
   if(card){
    const bill=cardInvoice(card.id,month,data.transactions,data.card_payments,data.card_statement_totals);
    const existingRecord=data.card_statement_totals.find(x=>x.card_id===id&&x.statement_month===month);
    setForm({...initial,amount:(bill.charged/100).toFixed(2).replace('.',','),statementMonth:month,notes:existingRecord?.notes||'Fatura real informada no início do controle'});return}
  }
  setForm(existing?{...initial,scope:existing.scope,type:existing.type,category:existing.category,description:existing.description,day:String(existing.day_of_month),month:existing.start_month,endMonth:existing.end_month||'',paymentTarget:existing.card_id||existing.account_id||'',fixedAmountMode:existing.amount_mode||'fixed',amount:((actual?.amount_cents??existing.amount_cents)/100).toFixed(2).replace('.',',')}:initial);
 };
 const f=(key:string,value:string)=>setForm(old=>({...old,[key]:value}));
 const scopeProps=()=>({owner_id:uid,scope:form.scope||'private',household_id:form.scope==='shared'?household?.id:null});
 const submitModal=async(e:FormEvent)=>{e.preventDefault();if(!modal)return;setBusy(true);let okay=false;const amount=cents(form.amount||'0');try{if(!Number.isSafeInteger(amount)||((modal!=='account'&&modal!=='accountbalance'&&modal!=='cardstatement')&&amount<=0)|| (modal==='cardstatement'&&amount<0))throw Error('Informe um valor válido');
  if(modal==='transaction'){
   const card=data.credit_cards.find(c=>c.id===form.paymentTarget);
   const count=Number(form.installments||1);
   if(!Number.isSafeInteger(count)||count<1||count>2147483647)throw Error('Informe uma quantidade inteira válida de parcelas');
   if(card&&form.type!=='expense')throw Error('Receitas não podem ser lançadas no cartão de crédito');
   const isParcelado=count>1;
   const mode=(form.installmentAmountMode||'total') as 'total'|'installment';
   const total=installmentSummary(amount,count,isParcelado?mode:'total');
   if(isParcelado&&count>1200&&!window.confirm(`Você informou ${count.toLocaleString('pt-BR')} parcelas. Esse registro longo pode consumir mais espaço e processamento no banco. Deseja continuar?`))throw Error('Cadastro de parcelas cancelado');
   const firstMonth=card?invoiceMonthForPurchase(form.date||today(),card.closing_day,card.due_day):isoMonth(form.due||form.date);
   const firstDue=card?dueDate(firstMonth,card.due_day):form.due||form.date||today();
   if(isParcelado&&db){
    const r=await db.rpc('create_installment_plan',{
     p_description:form.description.trim(),p_type:form.type,p_category:form.category,
     p_scope:form.scope,p_household_id:form.scope==='shared'?household?.id:null,
     p_amount_mode:mode,p_amount_cents:amount,p_installments:count,
     p_transaction_date:form.date||today(),p_first_due_date:firstDue,
     p_account_id:card?null:(form.paymentTarget||null),p_card_id:card?.id||null,
     p_first_paid_at:!card&&form.paid==='yes'?(form.date||today()):null
    });
    if(r.error)saveNotice(r.error.message);
    else{okay=true;await refresh();saveNotice(`${count} parcelas cadastradas com sucesso!`)}
   }else if(isParcelado){
    const plan=installmentPlan(total.totalCents,count,firstMonth,card?card.due_day:Number(firstDue.slice(8,10)));
    const group=crypto.randomUUID();
    const base={...scopeProps(),type:form.type,category:form.category,transaction_date:form.date||today(),account_id:card?null:(form.paymentTarget||null),card_id:card?.id||null,recurring_rule_id:null};
    okay=await create('transactions',plan.map((p,idx)=>({...base,...p,description:`${form.description} (${p.installment_number}/${count})`,paid_at:!card&&idx===0&&form.paid==='yes'?(form.date||today()):null,installment_group_id:group})));
   }else{
    const base={...scopeProps(),description:form.description,type:form.type,category:form.category,transaction_date:form.date||today(),paid_at:card?null:form.paid==='yes'?(form.date||today()):null,account_id:card?null:(form.paymentTarget||null),card_id:card?.id||null,recurring_rule_id:null};
    okay=await create('transactions',{...base,amount_cents:amount,due_date:firstDue,installment_group_id:null,installment_number:null,installment_total:null});
   }
  }else if(modal==='budget'){
   const exact=data.category_budgets.find(b=>b.month===form.month&&b.category===form.category&&b.scope===form.scope&&
     (b.scope==='shared'?b.household_id===household?.id:b.owner_id===uid));
   if(exact&&exact.owner_id!==uid)throw Error('Esse limite compartilhado pertence a outro responsável. Peça que ele atualize.');
   okay=exact?await patch('category_budgets',exact.id,{amount_cents:amount})
    :await create('category_budgets',{...scopeProps(),category:form.category,month:form.month,amount_cents:amount});
  }
  else if(modal==='goal')okay=await create('financial_goals',{...scopeProps(),name:form.name,target_cents:amount,deadline:form.deadline||null});
  else if(modal==='contribution')okay=await create('goal_contributions',{goal_id:context,owner_id:uid,amount_cents:amount});
  else if(modal==='account')okay=await create('accounts',{...scopeProps(),name:form.name,kind:form.kind,opening_balance_cents:cents(form.amount||'0')});
  else if(modal==='card')okay=await create('credit_cards',{...scopeProps(),name:form.name,credit_limit_cents:amount,closing_day:Number(form.closing),due_day:Number(form.dueDay)});
  else if(modal==='accountbalance'){
   const account=data.accounts.find(a=>a.id===context);
   if(!account||account.owner_id!==uid)throw Error('Somente o titular pode atualizar o saldo desta conta');
   if(db){
    const r=await db.rpc('reconcile_account_balance',{
     p_account_id:context,p_new_balance_cents:amount,p_reason:form.reason||'Conciliação manual de saldo'
    });
    if(r.error)throw Error(r.error.message);
    await refresh();saveNotice(Number(r.data)===0?'O saldo já estava atualizado.':'Saldo da conta atualizado e conciliação registrada.');okay=true;
   }else{
    const current=accountBalance(account,data.transactions,data.card_payments,data.account_balance_adjustments);
    if(amount!==current)okay=await create('account_balance_adjustments',{
     account_id:context,owner_id:uid,delta_cents:amount-current,
     balance_before_cents:current,balance_after_cents:amount,reason:form.reason||'Conciliação manual'
    });else okay=true;
   }
  }
  else if(modal==='cardstatement'){
   const card=data.credit_cards.find(c=>c.id===context);
   if(!card||card.owner_id!==uid)throw Error('Somente o titular pode informar o valor da fatura');
   const statementMonth=form.statementMonth||month;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth))throw Error('Mês da fatura inválido');
   const paid=data.card_payments.filter(p=>p.card_id===context&&p.statement_month===statementMonth).reduce((sum,p)=>sum+p.amount_cents,0);
   if(amount<paid)throw Error('O valor real não pode ser inferior ao que já foi pago da fatura');
   if(db){
    const r=await db.rpc('set_card_statement_total',{
     p_card_id:context,p_statement_month:statementMonth,p_actual_amount_cents:amount,p_notes:form.notes||''
    });
    if(r.error)throw Error(r.error.message);
    await refresh();saveNotice('Valor real da fatura salvo. O detalhamento não será somado duas vezes.');okay=true;
   }else{
    const record=data.card_statement_totals.find(st=>st.card_id===context&&st.statement_month===statementMonth);
    if(record)okay=await patch('card_statement_totals',record.id,{actual_amount_cents:amount,notes:form.notes||'',updated_at:new Date().toISOString()});
    else okay=await create('card_statement_totals',{
     card_id:context,owner_id:uid,statement_month:statementMonth,actual_amount_cents:amount,notes:form.notes||''
    });
   }
  }

  else if(modal==='recurring'){
   if(form.endMonth&&form.endMonth<form.month)throw Error('O fim não pode ser anterior ao início');
   const card=data.credit_cards.find(c=>c.id===form.paymentTarget);
   if(card&&form.type!=='expense')throw Error('Somente despesas fixas podem ser vinculadas a cartão de crédito');
   const changes={...scopeProps(),type:form.type,description:form.description,category:form.category,amount_cents:amount,amount_mode:form.fixedAmountMode||'fixed',day_of_month:Number(form.day),account_id:card?null:(form.paymentTarget||null),card_id:card?.id||null,start_month:form.month,end_month:form.endMonth||null};
   okay=context?await patch('recurring_rules',context,changes):await create('recurring_rules',{...changes,is_active:true});
   if(okay&&db){const r=await db.rpc('materialize_recurring_month',{p_month:month});if(r.error)saveNotice(r.error.message);else await refresh()}
  }
  else if(modal==='adjustfixed'){
   const rule=data.recurring_rules.find(r=>r.id===context);
   if(!rule||rule.owner_id!==uid)throw Error('Conta fixa não encontrada ou sem permissão');
   if(rule.amount_mode!=='variable')throw Error('Esta conta tem valor fixo; edite a regra no cadastro');
   if(month<rule.start_month||(rule.end_month&&month>rule.end_month))throw Error('Essa despesa não está ativa no mês');
   if(db){
    const generated=await db.rpc('materialize_recurring_month',{p_month:month});
    if(generated.error)throw Error(generated.error.message);
    const result=await db.from('transactions').select('id').eq('recurring_rule_id',context).gte('transaction_date',month+'-01').lt('transaction_date',monthShift(month,1)+'-01').maybeSingle();
    if(result.error||!result.data)throw Error(result.error?.message||'Lançamento mensal não encontrado');
    okay=await patch('transactions',result.data.id,{amount_cents:amount});
   }else{
    const tx=data.transactions.find(t=>t.recurring_rule_id===context&&isoMonth(t.transaction_date)===month);
    if(!tx)throw Error('Gere os lançamentos do mês para ajustar o valor');
    okay=await patch('transactions',tx.id,{amount_cents:amount});
   }
  }
  else if(modal==='payment'){
    const card=data.credit_cards.find(c=>c.id===context);const due=cardInvoice(context,form.month,data.transactions,data.card_payments,data.card_statement_totals);if(!card)throw Error('Cartão inválido');if(amount>due.outstanding)throw Error('Valor excede o saldo pendente da fatura');okay=await create('card_payments',{card_id:context,owner_id:uid,account_id:form.paymentTarget,statement_month:form.month,amount_cents:amount,paid_at:form.date});
  }
  if(okay)setModal(null)
 }catch(err){saveNotice(err instanceof Error?err.message:'Falha inesperada')}finally{setBusy(false)}};
 const saveCardLimit=async(amountCents:number)=>{
  setBusy(true);
  try{
   const exact=data.card_spending_limits.find(l=>l.owner_id===uid&&l.effective_month===month);
   if(exact)await patch('card_spending_limits',exact.id,{amount_cents:amountCents});
   else await create('card_spending_limits',{owner_id:uid,effective_month:month,amount_cents:amountCents});
  }finally{setBusy(false)}
 };
 const materialize=async()=>{
  if(!db){
   const owned=data.recurring_rules.filter(r=>r.owner_id===uid&&r.is_active!==false&&r.start_month<=month&&(!r.end_month||r.end_month>=month));
   const entries=owned.filter(r=>!data.transactions.some(t=>t.recurring_rule_id===r.id&&isoMonth(t.transaction_date)===month)).map(r=>({owner_id:r.owner_id,household_id:r.household_id,scope:r.scope,description:r.description,type:r.type,category:r.category,amount_cents:r.amount_cents,transaction_date:dueDate(month,r.day_of_month),due_date:recurringDueDateForCharge(r,month,data.credit_cards,data.transactions),paid_at:null,account_id:r.card_id?null:r.account_id,card_id:r.card_id||null,installment_group_id:null,installment_number:null,installment_total:null,recurring_rule_id:r.id}));
   if(entries.length)await create('transactions',entries);else saveNotice('As receitas e despesas fixas do mês já estão lançadas.');
   return;
  }
  const r=await db.rpc('materialize_recurring_month',{p_month:month});
  if(r.error)saveNotice(r.error.message);else{await refresh();saveNotice(Number(r.data)>0?`${r.data} lançamento(s) fixo(s) criado(s).`:'O mês já está atualizado.')}
 };
 useEffect(()=>{
  if(!db||!user||!household)return;
  let current=true;
  void (async()=>{
   const r=await db.rpc('materialize_recurring_month',{p_month:month});
   if(current&&r.error)saveNotice(`Não foi possível gerar as contas fixas: ${r.error.message}`);
   if(current&&!r.error&&Number(r.data)>0)await refresh();
  })();
  return()=>{current=false};
 },[user?.id,household?.id,month,refresh]);

 const transactions=useMemo(()=>visible(data.transactions,view,uid),[data.transactions,view,uid]);
 const accounts=useMemo(()=>visible(data.accounts,view,uid),[data.accounts,view,uid]);
 const cards=useMemo(()=>visible(data.credit_cards,view,uid),[data.credit_cards,view,uid]);
 const budgets=useMemo(()=>visible(data.category_budgets,view,uid),[data.category_budgets,view,uid]);
 const effectiveBudgets=useMemo(()=>effectiveCategoryBudgets(data,view,uid,month),[data,view,uid,month]);
 const goals=useMemo(()=>visible(data.financial_goals,view,uid),[data.financial_goals,view,uid]);
 const cardSummary=useMemo(()=>cardSpendingSummary(data,uid,month),[data,uid,month]);
 const metrics=useMemo(()=>adjustedMonthlyTotals(data,view,uid,month),[data,view,uid,month]);
 const alerts=useMemo(()=>generateAlerts(data,view,uid,month),[data,view,uid,month]);
 const projections=useMemo(()=>protectedProjection(data,view,uid,month,12),[data,view,uid,month]);
 const accountSum=accounts.reduce((sum,a)=>sum+accountBalance(a,data.transactions,data.card_payments,data.account_balance_adjustments),0);
 const chartData=Array.from({length:6},(_,i)=>{const m=monthShift(month,i-5);const v=adjustedMonthlyTotals(data,view,uid,m);return {mes:monthName(m),Receitas:Math.round(v.income/100),Despesas:Math.round(v.expense/100)}});
 const categoryChart=[...categories.map(category=>({name:category,value:Math.round(transactions.filter(t=>t.type==='expense'&&isoMonth(t.due_date)===month&&t.category===category).reduce((s,t)=>s+t.amount_cents,0)/100)})),...(metrics.statementAdjustment>0?[{name:'Faturas sem detalhamento',value:Math.round(metrics.statementAdjustment/100)}]:[])].filter(c=>c.value>0).sort((a,b)=>b.value-a.value);
 const projectedMonth=projections[0]?.balanceCents||0;
 const title=nav.find(x=>x.id===page)?.name||'Visão geral';
 const availBudget=effectiveBudgets.reduce((a,b)=>a+Math.max(0,b.amount_cents-budgetStatus(b,transactions).spent),0);

 if(!authLoaded)return <div className="loading-screen"><span className="spinner"/>Abrindo Meu Financeiro…</div>;
 if(configured&&!user)return <div className="auth-page"><div className="auth-decoration"><div className="big-emblem"><Wallet size={40}/></div><h1>Seu dinheiro.<br/>Seus planos.<br/><i>Juntos.</i></h1><p>Uma forma mais clara de cuidar das suas finanças pessoais e dos objetivos do casal.</p><div className="auth-note"><ShieldCheck size={20}/>Dados individuais protegidos no seu projeto Supabase.</div></div><div className="auth-panel"><div className="brand dark"><span className="brand-icon"><Wallet size={21}/></span>Meu <strong>Financeiro</strong></div><h2>{authMode==='login'?'Bem-vindo de volta':'Crie sua conta'}</h2><p>{authMode==='login'?'Entre com seu e-mail e senha.':'Você poderá convidar sua parceira depois do cadastro.'}</p><form onSubmit={handleAuth} className="form-stack">{authMode==='register'&&<Field label="Como gostaria de ser chamado?"><input required minLength={2} value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="Seu nome"/></Field>}<Field label="E-mail"><input required type="email" autoComplete="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="voce@exemplo.com"/></Field><Field label="Senha"><input required minLength={6} type="password" autoComplete={authMode==='register'?'new-password':'current-password'} value={authPass} onChange={e=>setAuthPass(e.target.value)} placeholder="Sua senha"/></Field>{authMessage&&<div className="feedback">{authMessage}</div>}<button className="primary full" disabled={busy} type="submit">{busy?'Processando…':authMode==='login'?'Entrar':'Criar conta'} <LogIn size={17}/></button></form><div className="auth-switch">{authMode==='login'?'Ainda não tem acesso?':'Já possui uma conta?'} <button onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthMessage('')}}>{authMode==='login'?'Criar conta':'Entrar'}</button></div></div></div>;
 if(configured&&!household)return <div className="setup-page"><div className="setup-card"><div className="brand dark"><span className="brand-icon"><Wallet size={20}/></span>Meu <strong>Financeiro</strong></div><h1>Vamos organizar a casa?</h1><p>Crie o espaço financeiro do casal ou entre usando o convite enviado por sua parceira.</p><Field label="Seu nome"><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nome para o grupo"/></Field><div className="setup-grid"><div className="setup-option"><Users/><h3>Criar um grupo</h3><Field label="Nome do grupo"><input value={familyName} onChange={e=>setFamilyName(e.target.value)}/></Field><button className="primary" onClick={handleNewHousehold} disabled={busy}>Criar grupo</button></div><div className="setup-option"><Copy/><h3>Entrar com convite</h3><Field label="Código de convite"><input value={inviteInput} onChange={e=>setInviteInput(e.target.value)} placeholder="Cole o código recebido"/></Field><button className="secondary" onClick={joinFamily} disabled={busy}>Aceitar convite</button></div></div>{notice&&<div className="feedback">{notice}</div>}<button className="small-link" onClick={()=>db?.auth.signOut()}>Sair da conta</button></div></div>;
 return <div className="app-shell">
  {sidebar&&<div className="mobile-overlay" onClick={()=>setSidebar(false)}/>}
  <aside className={`sidebar ${sidebar?'open':''}`}><div className="sidebar-top"><div className="brand"><span className="brand-icon"><Wallet size={20}/></span>Meu <strong>Financeiro</strong></div><button className="mobile-close" onClick={()=>setSidebar(false)}><X size={21}/></button></div><div className="sidebar-caption">ORGANIZAÇÃO</div><nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setSidebar(false)}}><Icon size={19}/><span>{item.name}</span>{item.id==='alerts'&&alerts.length>0&&<span className="nav-count">{alerts.length}</span>}</button>})}</nav><div className="sidebar-footer"><div className="family-chip"><span className="family-avatar"><Users size={18}/></span><div><strong>{household?.name||'Nossa casa'}</strong><small>Espaço financeiro</small></div></div><div className="sidebar-secure"><ShieldCheck size={14}/>Ambiente {configured?'privado':'demonstrativo'}</div></div></aside>
  <main className="main"><header className="topbar"><div className="topbar-left"><button className="hamburger" onClick={()=>setSidebar(true)}><Menu size={22}/></button><span className="breadcrumb">Meu Financeiro</span><span className="breadcrumb-divider">/</span><strong>{title}</strong></div><div className="topbar-right"><button className="icon-button alert-button" title="Alertas" onClick={()=>setPage('alerts')}><Bell size={20}/>{alerts.length>0&&<span className="alert-dot"/>}</button><div className="avatar" title={user?.email||'Demonstração'}>{(user?.user_metadata?.display_name||'Você').slice(0,1).toUpperCase()}</div></div></header>
  <div className="content"><div className="page-heading"><div><span className="eyebrow">CONTROLE FINANCEIRO</span><h1>{page==='dashboard'?'Sua visão financeira':title}</h1><p>{page==='dashboard'?'Acompanhe o presente e planeje o que vem pela frente.':page==='settings'?'Preferências e acesso compartilhado.':'Organize, acompanhe e tome decisões com clareza.'}</p></div><div className="heading-actions"><select aria-label="Visão de dados" value={view} onChange={e=>setView(e.target.value as View)}><option value="all">Consolidado acessível</option><option value="mine">Meus registros</option><option value="shared">Somente casal</option></select><div className="month-switch"><button title="Mês anterior" onClick={()=>setMonth(m=>monthShift(m,-1))}><ChevronLeft size={18}/></button><span>{monthName(month)}</span><button title="Mês seguinte" onClick={()=>setMonth(m=>monthShift(m,1))}><ChevronRight size={18}/></button></div></div></div>
  {!configured&&<div className="demo-warning"><Info size={18}/><span><strong>Modo demonstração:</strong> os valores são fictícios e os registros realizados aqui não são armazenados. Conecte um projeto Supabase pessoal para usar dados reais.</span></div>}
  {notice&&<div className="toast"><Info size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  {page==='dashboard'&&<>
    <div className="kpis"><div className="kpi"><div className="kpi-head"><span>Saldo nas contas</span><IconBadge><Wallet size={20}/></IconBadge></div><strong>{money(accountSum)}</strong><small>Somente contas que você pode acessar</small></div><div className="kpi"><div className="kpi-head"><span>Receitas previstas</span><IconBadge><ArrowDownRight size={20}/></IconBadge></div><strong>{money(projections[0]?.incomeCents||0)}</strong><small>{monthName(month)}</small></div><div className="kpi"><div className="kpi-head"><span>Despesas com reservas</span><IconBadge variant="coral"><ArrowUpRight size={20}/></IconBadge></div><strong>{money(projections[0]?.expenseCents||0)}</strong><small>Inclui pisos de orçamento e teto dos cartões</small></div><div className="kpi highlighted"><div className="kpi-head"><span>Resultado projetado</span><IconBadge variant="gold"><ChartNoAxesCombined size={20}/></IconBadge></div><strong>{money(projectedMonth)}</strong><small>Receitas previstas − despesas previstas</small></div></div>
    <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>Receitas e despesas</h2><p>Evolução dos últimos 6 meses</p></div><Badge>Mensal</Badge></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:6,left:-10,bottom:0}}><defs><linearGradient id="green" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#188b7f" stopOpacity={.28}/><stop offset="100%" stopColor="#188b7f" stopOpacity={0}/></linearGradient><linearGradient id="orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dba16a" stopOpacity={.25}/><stop offset="100%" stopColor="#dba16a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e9eeef" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#80919a'}}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#80919a'}} tickFormatter={n=>n>=1000?`${Math.round(n/1000)}k`:String(n)}/><Tooltip formatter={v=>money(Number(v||0)*100)}/><Legend iconType="circle"/><Area type="monotone" dataKey="Receitas" stroke="#168a7d" strokeWidth={2.5} fill="url(#green)"/><Area type="monotone" dataKey="Despesas" stroke="#d99658" strokeWidth={2.5} fill="url(#orange)"/></AreaChart></ResponsiveContainer></div></section>
    <section className="panel category-panel"><div className="panel-head"><div><h2>Para onde vai?</h2><p>Despesas por categoria</p></div></div>{categoryChart.length?<><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryChart} dataKey="value" innerRadius={67} outerRadius={90} paddingAngle={3} stroke="none">{categoryChart.map((d,i)=><Cell key={d.name} fill={palette[i%palette.length]}/>)}</Pie><Tooltip formatter={v=>money(Number(v||0)*100)}/></PieChart></ResponsiveContainer><div className="donut-center"><small>Total</small><strong>{money(metrics.expense)}</strong></div></div><div className="legend-list">{categoryChart.slice(0,5).map((x,i)=><div key={x.name}><span className="legend-dot" style={{background:palette[i%palette.length]}}/>{x.name}<strong>{money(x.value*100)}</strong></div>)}</div></>:<Empty text="Nenhuma despesa registrada para este mês."/>}</section></div>
    <div className="dashboard-grid bottom-grid"><section className="panel"><div className="panel-head"><div><h2>Orçamento sob controle</h2><p>Quanto ainda cabe no planejamento</p></div><button className="text-action" onClick={()=>setPage('budgets')}>Ver todos <ArrowUpRight size={14}/></button></div>{budgets.filter(x=>x.month===month).slice(0,4).map(b=>{const x=budgetStatus(b,transactions);return <div className="budget-mini" key={b.id}><div className="line-between"><strong>{b.category}</strong><small>{money(x.spent)} de {money(b.amount_cents)}</small></div><Meter percent={x.percent}/></div>})}{!budgets.some(x=>x.month===month)&&<Empty text="Cadastre os limites do orçamento." action={()=>open('budget')}/>}<div className="panel-footer">Disponível nas categorias: <strong>{money(availBudget)}</strong></div></section><section className="panel"><div className="panel-head"><div><h2>Últimos lançamentos</h2><p>Registros do mês selecionado</p></div><button className="text-action" onClick={()=>setPage('transactions')}>Ver todos <ArrowUpRight size={14}/></button></div><div className="recent-list">{transactions.filter(t=>isoMonth(t.due_date)===month).slice(-5).reverse().map(t=><div className="recent-item" key={t.id}><span className={`tx-symbol ${t.type}`}>{t.type==='income'?<ArrowDownRight size={17}/>:<ArrowUpRight size={17}/>}</span><div><strong>{t.description}</strong><small>{t.category} · {mDate(t.due_date)}</small></div><strong className={t.type==='income'?'positive':''}>{t.type==='income'?'+':'−'} {money(t.amount_cents)}</strong></div>)}{!transactions.some(t=>isoMonth(t.due_date)===month)&&<Empty text="Nenhum lançamento neste mês." action={()=>open('transaction')}/>}</div></section></div>
    {alerts.length>0&&<section className="panel alert-summary"><div><Bell size={20}/><strong>{alerts.length} ponto(s) de atenção</strong><span>{alerts[0].title}</span></div><button className="text-action" onClick={()=>setPage('alerts')}>Ver alertas <ArrowUpRight size={14}/></button></section>}
   </>}
  {page==='transactions'&&<section className="panel"><div className="panel-head"><div><h2>Movimentações do mês</h2><p>Valores, vencimentos, status e responsáveis</p></div><div className="panel-actions"><button className="secondary" onClick={()=>downloadCSV(transactions)}><Download size={16}/> Exportar CSV</button><button className="secondary" onClick={()=>{open('recurring');setForm(v=>({...v,type:'expense',category:'Energia elétrica'}))}}><Plus size={16}/> Despesa fixa</button><button className="primary" onClick={()=>open('transaction')}><Plus size={17}/> Novo lançamento</button></div></div>{transactions.filter(t=>isoMonth(t.due_date)===month).length?<div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Visibilidade</th><th>Status</th><th className="text-right">Valor</th><th/></tr></thead><tbody>{[...transactions].filter(t=>isoMonth(t.due_date)===month).sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(t=><tr key={t.id}><td><strong>{t.description}</strong>{t.installment_number&&<div className="table-note">Parcela {t.installment_number}/{t.installment_total}</div>}</td><td>{t.category}</td><td>{mDate(t.due_date)}</td><td><Tag scope={t.scope}/></td><td><span className={`status ${t.card_id?'neutral':t.paid_at?'paid':'pending'}`}>{t.card_id?'Na fatura':t.paid_at?'Pago':'Pendente'}</span></td><td className={`text-right strong ${t.type==='income'?'positive':''}`}>{t.type==='income'?'+':'−'} {money(t.amount_cents)}</td><td><div className="table-buttons">{t.owner_id===uid&&!t.card_id&&!t.paid_at&&<button title="Marcar como pago" onClick={()=>void patch('transactions',t.id,{paid_at:today()})}><Check size={16}/></button>}{t.owner_id===uid&&<button title="Excluir" onClick={()=>void del('transactions',t.id)}><X size={16}/></button>}</div></td></tr>)}</tbody></table></div>:<Empty text="Ainda não há lançamentos neste mês." action={()=>open('transaction')}/>}</section>}
  {page==='fixed'&&<FixedCommitments
    rules={visible(data.recurring_rules,view,uid)}
    transactions={transactions}
    cards={cards}
    uid={uid} month={month}
    onNewFixed={kind=>{open('recurring');setForm(old=>({...old,type:kind,category:kind==='income'?'Salário':'Energia elétrica'}))}}
    onEditFixed={id=>open('recurring',id)}
    onToggleFixed={r=>void patch('recurring_rules',r.id,{is_active:r.is_active===false})}
    onRemoveFixed={id=>void del('recurring_rules',id)}
    onAdjustFixed={rule=>open('adjustfixed',rule.id)}
    onNewInstallment={()=>{open('transaction');setForm(old=>({...old,installments:'2'}))}}
    onGenerate={()=>void materialize()}
  />}
  {page==='budgets'&&<>
    <CardSpendingBudget summary={cardSummary} month={month} onSave={saveCardLimit} busy={busy}/>
    <div className="section-intro"><p>Defina um piso mensal por categoria: se houver R$ 800 de supermercado, essa reserva será considerada nos próximos meses, mesmo sem lançamentos, até você definir outro valor.</p>
      <button className="primary" onClick={()=>open('budget')}><Plus size={17}/> Criar limite de categoria</button></div>
    <div className="card-grid">{effectiveBudgets.map(b=>{const x=budgetStatus(b,transactions);return <section className="panel budget-card" key={b.id}>
      <div className="line-between"><h3>{b.category}</h3><Tag scope={b.scope}/></div>
      <div className="budget-big">{money(x.spent)} <small>/ {money(b.amount_cents)}</small></div><Meter percent={x.percent}/>
      <div className="line-between budget-foot"><span>{x.remaining>=0?`${money(x.remaining)} reservado`:`${money(-x.remaining)} acima do limite`}</span>
        <strong className={x.percent>=100?'danger-text':''}>{x.percent}%</strong></div>
      <p className="small-hint">Limite vigente desde {monthName(b.sourceMonth)}. O valor não utilizado também integra a projeção futura.</p>
      {b.owner_id===uid&&<button className="secondary small" onClick={()=>{open('budget');setForm(old=>({...old,category:b.category,scope:b.scope,month,amount:(b.amount_cents/100).toFixed(2).replace('.',',')}))}}>{b.sourceMonth===month?'Editar limite':'Programar novo valor a partir deste mês'}</button>}
      {b.owner_id===uid&&b.sourceMonth===month&&<button className="subtle-delete" onClick={()=>void del('category_budgets',b.id)}>Excluir limite deste mês</button>}
    </section>})}</div>
    {!effectiveBudgets.length&&<section className="panel"><Empty text="Ainda não há limites de categoria válidos para este mês. Cadastre um para proteger sua projeção financeira." action={()=>open('budget')}/></section>}
   </>}
  {page==='goals'&&<><div className="section-intro"><p>Transforme planos em metas e registre os aportes de cada pessoa.</p><button className="primary" onClick={()=>open('goal')}><Plus size={17}/> Nova meta</button></div><div className="card-grid">{goals.map(g=>{const x=goalProgress(g,data.goal_contributions);return <section className="panel goal-card" key={g.id}><div className="goal-symbol"><Target size={22}/></div><div className="line-between"><h3>{g.name}</h3><Tag scope={g.scope}/></div><p>Prazo: {g.deadline?mDate(g.deadline):'Sem prazo'}</p><div className="goal-values"><strong>{money(x.saved)}</strong><span>de {money(g.target_cents)}</span></div><Meter percent={x.percent}/><div className="line-between goal-foot"><small>{x.percent}% alcançado · faltam {money(x.remaining)}</small><button className="secondary small" onClick={()=>open('contribution',g.id)}><Plus size={15}/> Aporte</button></div>{g.owner_id===uid&&<button className="subtle-delete" onClick={()=>void del('financial_goals',g.id)}>Excluir meta</button>}</section>})}</div>{!goals.length&&<section className="panel"><Empty text="Defina sua primeira meta financeira." action={()=>open('goal')}/></section>}</>}
  {page==='accounts'&&<>
  <div className="section-intro"><p>Confira o saldo atual no banco e ajuste quando necessário, sem lançar receitas ou despesas fictícias. A diferença fica registrada no histórico de conciliações.</p>
   <button className="primary" onClick={()=>open('account')}><Plus size={17}/> Nova conta</button></div>
  <div className="card-grid">{accounts.map(a=>{
   const current=accountBalance(a,data.transactions,data.card_payments,data.account_balance_adjustments);
   const last=data.account_balance_adjustments.filter(j=>j.account_id===a.id).sort((x,y)=>y.created_at.localeCompare(x.created_at))[0];
   return <section className="panel account-card" key={a.id}>
    <div className="line-between"><IconBadge><Wallet size={20}/></IconBadge><Tag scope={a.scope}/></div>
    <h3>{a.name}</h3><p>{a.kind}</p>
    <small>Saldo atual calculado</small><div className="account-value">{money(current)}</div>
    <small>Saldo inicial histórico: {money(a.opening_balance_cents)}</small>
    {last&&<p className="small-hint">Última conciliação: {money(last.balance_after_cents)} · {new Date(last.created_at).toLocaleDateString('pt-BR')}</p>}
    {a.owner_id===uid&&<button className="secondary full" onClick={()=>open('accountbalance',a.id)}>Atualizar saldo atual</button>}
   </section>
  })}</div>
  {!accounts.length&&<section className="panel"><Empty text="Cadastre uma conta para começar." action={()=>open('account')}/></section>}
 </>}
 {page==='cards'&&<>
  <div className="section-intro"><p>Informe o valor real de cada fatura para começar o controle, mesmo sem todos os lançamentos antigos. À medida que cadastrar as compras, a diferença será ajustada automaticamente.</p>
   <button className="primary" onClick={()=>open('card')}><Plus size={17}/> Novo cartão</button></div>
  <div className="card-grid">{cards.map(c=>{
   const x=cardInvoice(c.id,month,data.transactions,data.card_payments,data.card_statement_totals);
   const allDetailed=data.transactions.filter(t=>t.card_id===c.id).reduce((sum,t)=>sum+t.amount_cents,0);
   const allDifferences=data.card_statement_totals.filter(st=>st.card_id===c.id).reduce((sum,st)=>{
    const detailed=data.transactions.filter(t=>t.card_id===c.id&&isoMonth(t.due_date)===st.statement_month).reduce((z,t)=>z+t.amount_cents,0);
    return sum+st.actual_amount_cents-detailed;
   },0);
   const paid=data.card_payments.filter(p=>p.card_id===c.id).reduce((sum,p)=>sum+p.amount_cents,0);
   const openDebt=allDetailed+allDifferences-paid;
   return <section className="panel card-detail" key={c.id}>
    <div className="bank-card"><div className="line-between"><CreditCard size={27}/><span>MEU FINANCEIRO</span></div><div className="card-bank-name">{c.name}</div><div className="line-between"><small>Limite {money(c.credit_limit_cents)}</small><Tag scope={c.scope}/></div></div>
    <div className="line-between"><span>Fatura de {monthName(month)}</span><strong>{money(x.outstanding)}</strong></div>
    {x.hasActual&&<div className="hint-box"><strong>Fatura real informada: {money(x.actual??0)}</strong><p className="small-hint">Ela substitui o total calculado pelos lançamentos deste mês; não é uma nova despesa.</p></div>}
    <div className="line-between smaller"><span>Compras detalhadas nesta fatura</span><strong>{money(x.itemized)}</strong></div>
    {x.hasActual&&<div className="line-between smaller"><span>{x.difference>=0?'Valor ainda sem detalhamento':'Lançamentos acima da fatura real'}</span><strong className={x.difference<0?'danger-text':''}>{money(Math.abs(x.difference))}</strong></div>}
    <div className="line-between smaller"><span>Valor total desta fatura</span><strong>{money(x.charged)}</strong></div>
    <div className="line-between smaller"><span>Pagamentos registrados</span><strong>{money(x.paid)}</strong></div>
    <div className="line-between smaller"><span>Dívida total registrada</span><strong>{money(Math.max(0,openDebt))}</strong></div>
    <div className="line-between smaller"><span>Limite disponível estimado</span><strong>{money(Math.max(0,c.credit_limit_cents-openDebt))}</strong></div>
    <div className="line-between smaller"><span>Fechamento dia {c.closing_day}</span><span>Vencimento dia {c.due_day}</span></div>
    {c.owner_id===uid&&<button className="secondary full" onClick={()=>open('cardstatement',c.id)}>{x.hasActual?'Alterar valor real da fatura':'Informar valor real da fatura'}</button>}
    {x.outstanding>0&&<button className="secondary full" onClick={()=>{open('payment',c.id);setForm(old=>({...old,month,amount:(x.outstanding/100).toFixed(2).replace('.',','),paymentTarget:accounts[0]?.id||''}))}}>Registrar pagamento da fatura</button>}
    {x.difference<0&&<p className="small-hint danger-text">Confira a fatura e os lançamentos: o valor detalhado excede o total informado.</p>}
   </section>
  })}</div>
  {!cards.length&&<section className="panel"><Empty text="Cadastre um cartão para acompanhar as faturas." action={()=>open('card')}/></section>}
 </>}
  {page==='planning'&&<FuturePlanning data={data} view={view} uid={uid} month={month}/>}
  {page==='insights'&&<SpendingInsightsPanel data={data} view={view} uid={uid} month={month}/>}
  {page==='comparison'&&<><div className="panel"><div className="panel-head"><div><h2>Evolução financeira</h2><p>Comparação mensal de receitas e despesas</p></div><Badge>Últimos 6 meses</Badge></div><div className="chart-box taller"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid stroke="#e9eeef" vertical={false}/><XAxis dataKey="mes"/><YAxis tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(Number(v||0)*100)}/><Legend/><Area type="monotone" dataKey="Receitas" stroke="#138979" fill="#138979" fillOpacity={.1}/><Area type="monotone" dataKey="Despesas" stroke="#d99e64" fill="#d99e64" fillOpacity={.1}/></AreaChart></ResponsiveContainer></div></div><div className="panel"><div className="panel-head"><div><h2>Mês atual x anterior</h2><p>Diferença entre os meses e evolução por categoria</p></div></div><div className="compare-kpis">{(['income','expense'] as const).map(k=>{const prev=adjustedMonthlyTotals(data,view,uid,monthShift(month,-1))[k],now=metrics[k];const delta=prev?((now-prev)/prev*100):null;return <div className="compare-item" key={k}><small>{k==='income'?'Receitas':'Despesas'}</small><strong>{money(now)}</strong><span>{delta===null?'Sem base anterior':`${delta>=0?'+':''}${delta.toFixed(1)}% frente ao mês anterior`}</span></div>})}</div><div className="table-wrap"><table><thead><tr><th>Categoria</th><th className="text-right">Mês anterior</th><th className="text-right">Mês atual</th><th className="text-right">Diferença</th></tr></thead><tbody>{categories.filter(c=>transactions.some(t=>t.category===c&&t.type==='expense'&&[month,monthShift(month,-1)].includes(isoMonth(t.due_date)))).map(c=>{const prev=transactions.filter(t=>t.type==='expense'&&t.category===c&&isoMonth(t.due_date)===monthShift(month,-1)).reduce((s,t)=>s+t.amount_cents,0),cur=transactions.filter(t=>t.type==='expense'&&t.category===c&&isoMonth(t.due_date)===month).reduce((s,t)=>s+t.amount_cents,0);return <tr key={c}><td>{c}</td><td className="text-right">{money(prev)}</td><td className="text-right">{money(cur)}</td><td className={`text-right strong ${cur>prev?'danger-text':'positive'}`}>{cur>=prev?'+':''}{money(cur-prev)}</td></tr>})}</tbody></table></div></div></>}
  {page==='alerts'&&<section className="panel"><div className="panel-head"><div><h2>Central de alertas</h2><p>Orçamentos, vencimentos, metas e previsão de resultado</p></div><Badge>{alerts.length} notificações</Badge></div><div className="alert-list">{alerts.map((a,i)=><div className="alert-entry" key={`${a.title}${i}`}><IconBadge variant={a.kind==='danger'?'coral':a.kind==='warn'?'gold':'blue'}>{a.kind==='info'?<Info size={19}/>:<AlertTriangle size={19}/>}</IconBadge><div><strong>{a.title}</strong><p>{a.detail}</p></div><span className={`alert-type ${a.kind}`}>{a.kind==='danger'?'Atenção':a.kind==='warn'?'Aviso':'Informativo'}</span></div>)}{!alerts.length&&<div className="all-good"><CheckCircle2 size={36}/><h3>Sem alertas no momento</h3><p>Os próximos avisos aparecerão automaticamente aqui.</p></div>}</div></section>}
  {page==='settings'&&<div className="settings-grid"><section className="panel"><div className="panel-head"><div><h2>Espaço do casal</h2><p>{household?.name}</p></div><IconBadge><Users size={19}/></IconBadge></div><div className="member-list">{data.household_members.map(m=><div key={m.user_id}><span className="avatar soft">{m.display_name.slice(0,1).toUpperCase()}</span><div><strong>{m.display_name}</strong><small>{m.role==='owner'?'Administrador':'Integrante'}</small></div></div>)}</div>{configured&&user?.id===household?.created_by&&data.household_members.length<2&&<><p className="small-hint">Gere um convite de uso único, válido por 7 dias, para sua parceira.</p><button className="primary" onClick={createInvite}><Copy size={17}/> Gerar convite</button>{invite&&<div className="invite-box"><code>{invite}</code><button onClick={()=>{navigator.clipboard.writeText(invite);saveNotice('Código copiado.')}}><Copy size={17}/></button></div>}</>}</section><section className="panel"><div className="panel-head"><div><h2>Seus dados</h2><p>Segurança, exportação e sessão</p></div><IconBadge variant="blue"><ShieldCheck size={19}/></IconBadge></div><p className="settings-text">Os dados privados são protegidos por regras de acesso no banco. Registros compartilhados podem ser vistos pelos integrantes do grupo.</p><button className="secondary full" onClick={()=>downloadCSV(transactions)}><Download size={17}/> Exportar lançamentos em CSV</button>{configured&&<button className="secondary full" onClick={()=>db?.auth.signOut()}><LogOut size={17}/> Encerrar sessão</button>}</section></div>}
  </div></main>
  {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><form className="modal" onSubmit={submitModal}><div className="modal-head"><div><span className="eyebrow">MEU FINANCEIRO</span><h2>{{transaction:'Novo lançamento',budget:'Criar orçamento',goal:'Nova meta',contribution:'Adicionar aporte',account:'Nova conta',accountbalance:'Atualizar saldo atual',card:'Novo cartão',cardstatement:'Informar valor real da fatura',recurring:context?'Editar receita/despesa fixa':'Nova receita/despesa fixa',adjustfixed:'Valor real da conta no mês',payment:'Pagamento de fatura'}[modal]}</h2></div><button type="button" className="icon-button" onClick={()=>setModal(null)}><X size={21}/></button></div><div className="modal-body">
    {modal!=='contribution'&&modal!=='payment'&&modal!=='adjustfixed'&&modal!=='accountbalance'&&modal!=='cardstatement'&&<Field label="Visibilidade"><select value={form.scope} onChange={e=>f('scope',e.target.value)}><option value="private">Individual (privado)</option>{household&&<option value="shared">Compartilhado com o casal</option>}</select></Field>}
    {(modal==='transaction'||modal==='recurring')&&<Field label="Tipo de movimentação"><select value={form.type} onChange={e=>f('type',e.target.value)}><option value="expense">Despesa</option><option value="income">Receita</option></select></Field>}
    {(modal==='transaction'||modal==='recurring')&&<Field label="Descrição"><input required maxLength={250} value={form.description||''} onChange={e=>f('description',e.target.value)} placeholder="Ex.: compras no supermercado"/></Field>}
    {(modal==='goal'||modal==='card'||modal==='account')&&<Field label="Nome"><input required maxLength={100} value={form.name||''} onChange={e=>f('name',e.target.value)} placeholder={modal==='goal'?'Ex.: reserva de emergência':'Nome para identificar'}/></Field>}
    {(modal==='transaction'||modal==='budget'||modal==='recurring')&&<Field label="Categoria"><select value={form.category} onChange={e=>f('category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field>}
    <Field label={{transaction:form.installments!=='1'?(form.installmentAmountMode==='installment'?'Valor de CADA parcela (R$)':'Valor TOTAL da compra ou receita (R$)'):'Valor (R$)',budget:'Limite mensal (R$)',goal:'Valor da meta (R$)',contribution:'Valor do aporte (R$)',account:'Saldo inicial (R$)',accountbalance:'Novo saldo atual da conta (R$)',card:'Limite do cartão (R$)',cardstatement:'Valor TOTAL real da fatura (R$)',recurring:form.fixedAmountMode==='variable'?'Valor previsto mensal (R$)':'Valor mensal (R$)',adjustfixed:'Valor real neste mês (R$)',payment:'Valor pago (R$)'}[modal]}><input required type="text" inputMode="decimal" pattern="-?[0-9.,]+" value={form.amount||''} onChange={e=>f('amount',e.target.value)} placeholder="0,00"/></Field>
    {modal==='transaction'&&<><Field label="Data da compra / movimentação"><input required type="date" value={form.date} onChange={e=>f('date',e.target.value)}/></Field><Field label="Como registrar"><select value={form.paymentTarget||''} onChange={e=>f('paymentTarget',e.target.value)}><option value="">Sem conta vinculada</option>{accounts.filter(a=>form.scope==='shared'||a.scope==='private').map(a=><option key={a.id} value={a.id}>Conta: {a.name}</option>)}{form.type==='expense'&&cards.filter(c=>form.scope==='shared'||c.scope==='private').map(c=><option key={c.id} value={c.id}>Cartão: {c.name}</option>)}</select></Field><Field label="Forma de lançamento"><select value={form.installments==='1'?'single':'installments'} onChange={e=>f('installments',e.target.value==='single'?'1':'2')}><option value="single">À vista / lançamento único</option><option value="installments">Parcelado em meses</option></select></Field>{form.installments!=='1'&&<><Field label="Quantidade de parcelas (sem limite fixo)"><input required type="number" min={2} step={1} value={form.installments} onChange={e=>f('installments',e.target.value)}/></Field>
<Field label="Qual valor você quer informar?"><select value={form.installmentAmountMode||'total'} onChange={e=>f('installmentAmountMode',e.target.value)}><option value="total">Valor total da compra / receita</option><option value="installment">Valor de cada parcela</option></select></Field>
<div className="hint-box">
 {(()=>{try{const n=Number(form.installments);const val=cents(form.amount||'0');if(!Number.isSafeInteger(n)||n<2||!Number.isSafeInteger(val)||val<=0)return 'Informe o valor e a quantidade para calcular o parcelamento.';const summary=installmentSummary(val,n,(form.installmentAmountMode||'total') as 'total'|'installment');return <>Total: <strong>{money(summary.totalCents)}</strong> · Primeira parcela: <strong>{money(summary.firstCents)}</strong> · {n.toLocaleString('pt-BR')} parcelas.{form.installmentAmountMode==='total'?' Eventuais centavos restantes são distribuídos entre as primeiras parcelas.':''}</>}catch(e){return <span className="danger-text">{e instanceof Error?e.message:'Verifique os valores'}</span>}})()}
</div></>}{!data.credit_cards.some(c=>c.id===form.paymentTarget)&&<><Field label={form.installments!=='1'?'Vencimento da 1ª parcela':'Vencimento'}><input type="date" required value={form.due} onChange={e=>f('due',e.target.value)}/></Field><Field label={form.installments!=='1'?'Primeira parcela':'Situação'}><select value={form.paid} onChange={e=>f('paid',e.target.value)}><option value="yes">{form.installments!=='1'?'1ª parcela já efetivada':'Efetivado / pago'}</option><option value="no">Pendente</option></select></Field></>}</>}
    {modal==='budget'&&<Field label="Mês de referência"><input required type="month" value={form.month} onChange={e=>f('month',e.target.value)}/></Field>}
    {modal==='goal'&&<Field label="Prazo da meta (opcional)"><input type="date" value={form.deadline||''} onChange={e=>f('deadline',e.target.value)}/></Field>}
    {modal==='card'&&<div className="two-fields"><Field label="Fechamento (dia)"><input type="number" required min={1} max={28} value={form.closing} onChange={e=>f('closing',e.target.value)}/></Field><Field label="Vencimento (dia)"><input type="number" required min={1} max={28} value={form.dueDay} onChange={e=>f('dueDay',e.target.value)}/></Field></div>}
    {modal==='accountbalance'&&<>
      <div className="hint-box"><strong>Este ajuste não cria receita ou despesa.</strong> Informe quanto existe de fato na conta, conforme o aplicativo do banco. A diferença será registrada em uma conciliação auditável, preservando seu histórico.</div>
      <Field label="Motivo da conciliação (opcional)"><input maxLength={300} value={form.reason||''} onChange={e=>f('reason',e.target.value)} placeholder="Ex.: alinhamento do saldo bancário"/></Field>
    </>}
    {modal==='cardstatement'&&<>
      <div className="hint-box"><strong>Início do controle:</strong> informe o valor total real da fatura, inclusive compras que ainda não foram cadastradas. Ele substituirá o total estimado desta fatura, sem gerar lançamentos fictícios.</div>
      <Field label="Mês de vencimento da fatura"><input type="month" required value={form.statementMonth||month} onChange={e=>{
       const target=e.target.value;
       const bill=cardInvoice(context,target,data.transactions,data.card_payments,data.card_statement_totals);
       setForm(old=>({...old,statementMonth:target,amount:(bill.charged/100).toFixed(2).replace('.',','),notes:data.card_statement_totals.find(st=>st.card_id===context&&st.statement_month===target)?.notes||''}));
      }}/></Field>
      <div className="hint-box">
       {(()=>{const m=form.statementMonth||month;const bill=cardInvoice(context,m,data.transactions,data.card_payments,data.card_statement_totals);
        const newValue=cents(form.amount||'0');const diff=Number.isSafeInteger(newValue)?newValue-bill.itemized:0;
        return <><div>Compras e parcelas já cadastradas: <strong>{money(bill.itemized)}</strong></div>
         <div>Pagamentos já registrados: <strong>{money(bill.paid)}</strong></div>
         {Number.isSafeInteger(newValue)&&<div>Diferença ainda sem detalhamento: <strong className={diff<0?'danger-text':''}>{diff<0?'-':''}{money(Math.abs(diff))}</strong></div>}
         <p className="small-hint">Compras que você cadastrar depois reduzirão essa diferença. Se os lançamentos ultrapassarem o valor informado, confira a fatura.</p></>;
       })()}
      </div>
      <Field label="Observação (opcional)"><input maxLength={300} value={form.notes||''} onChange={e=>f('notes',e.target.value)} placeholder="Ex.: valor consultado no app do banco"/></Field>
    </>}
    {modal==='account'&&<Field label="Tipo de conta"><select value={form.kind} onChange={e=>f('kind',e.target.value)}><option>Conta corrente</option><option>Conta poupança</option><option>Dinheiro</option><option>Carteira digital</option><option>Investimentos</option></select></Field>}
    {modal==='recurring'&&<><Field label="Comportamento do valor mensal"><select value={form.fixedAmountMode||'fixed'} onChange={e=>f('fixedAmountMode',e.target.value)}><option value="fixed">Valor igual em todos os meses (aluguel, salário)</option><option value="variable">Valor varia a cada mês (luz, água, gás)</option></select></Field>{form.fixedAmountMode==='variable'&&<div className="hint-box">Informe um <strong>valor médio estimado</strong> para o planejamento. Quando chegar a conta do mês, use <strong>Informar valor do mês</strong> na área Fixas e parcelas. O valor real substituirá a estimativa apenas daquele mês.</div>}<p className="small-hint">O sistema gera este compromisso a cada mês. Para um cartão, a cobrança entra na fatura correspondente; para conta bancária, confirme o pagamento nos lançamentos. Mudanças na regra não alteram lançamentos anteriores.</p><div className="two-fields"><Field label={data.credit_cards.some(c=>c.id===form.paymentTarget)?'Dia da cobrança no cartão':'Dia do vencimento/recebimento'}><input type="number" required min={1} max={28} value={form.day} onChange={e=>f('day',e.target.value)}/></Field><Field label="Início"><input type="month" required value={form.month} onChange={e=>f('month',e.target.value)}/></Field></div><Field label="Fim (opcional)"><input type="month" value={form.endMonth||''} onChange={e=>f('endMonth',e.target.value)}/></Field><Field label="Pagamento ou recebimento"><select value={form.paymentTarget||''} onChange={e=>f('paymentTarget',e.target.value)}><option value="">Sem conta/cartão vinculado</option>{accounts.filter(a=>form.scope==='shared'||a.scope==='private').map(a=><option key={a.id} value={a.id}>Conta: {a.name}</option>)}{form.type==='expense'&&cards.filter(c=>form.scope==='shared'||c.scope==='private').map(c=><option key={c.id} value={c.id}>Cartão: {c.name}</option>)}</select></Field>{data.credit_cards.some(c=>c.id===form.paymentTarget)&&form.type==='expense'&&<div className="hint-box">A cobrança fixa entrará automaticamente na <strong>fatura do cartão</strong>, considerando o dia de fechamento e vencimento. O saldo bancário só será reduzido quando você registrar o pagamento da fatura.</div>}</>}
    {modal==='adjustfixed'&&<div className="hint-box">Você está alterando somente o valor da cobrança de <strong>{monthName(month)}</strong>. Se estiver vinculada ao cartão, o valor será atualizado na fatura correspondente; o pagamento é feito pela fatura, não como uma despesa separada.</div>}
    {modal==='payment'&&<><Field label="Fatura"><input type="month" required value={form.month} onChange={e=>{f('month',e.target.value);const x=cardInvoice(context,e.target.value,data.transactions,data.card_payments);f('amount',(x.outstanding/100).toFixed(2).replace('.',','))}}/></Field><Field label="Conta de pagamento"><select required value={form.paymentTarget||''} onChange={e=>f('paymentTarget',e.target.value)}><option value="">Selecione a conta</option>{accounts.filter(a=>data.credit_cards.find(c=>c.id===context)?.scope==='shared'||a.scope==='private').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="Data do pagamento"><input type="date" required value={form.date} onChange={e=>f('date',e.target.value)}/></Field><p className="small-hint">A fatura reduzirá o saldo da conta, sem contabilizar outra despesa.</p></>}
  </div><div className="modal-actions"><button className="secondary" type="button" onClick={()=>setModal(null)}>Cancelar</button><button className="primary" disabled={busy||!Number.isSafeInteger(cents(form.amount||'0'))||((modal!=='account'&&modal!=='accountbalance'&&modal!=='cardstatement')&&cents(form.amount||'0')<=0)||(modal==='cardstatement'&&cents(form.amount||'0')<0)} type="submit">{busy?'Salvando…':'Salvar'} <Check size={16}/></button></div></form></div>}
 </div>
}