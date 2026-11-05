import {ArrowDownRight, ArrowUpRight, CreditCard, Plus, RotateCcw, X} from 'lucide-react';
import type {Recurring, Tx} from './types';
import {money, monthName, today} from './finance';

type Props={
  rules:Recurring[];
  transactions:Tx[];
  uid:string;
  month:string;
  onNewFixed:(kind:'income'|'expense')=>void;
  onEditFixed:(id:string)=>void;
  onToggleFixed:(rule:Recurring)=>void;
  onRemoveFixed:(id:string)=>void;
  onAdjustFixed:(rule:Recurring)=>void;
  onNewInstallment:()=>void;
  onGenerate:()=>void;
};

export default function FixedCommitments({rules,transactions,uid,month,onNewFixed,onEditFixed,onToggleFixed,onRemoveFixed,onAdjustFixed,onNewInstallment,onGenerate}:Props){
 const active=rules.filter(r=>r.is_active!==false&&r.start_month<=month&&(!r.end_month||r.end_month>=month));
 const groups=new Map<string,Tx[]>();
 for(const t of transactions){
  if(!t.installment_group_id||!t.installment_total||t.installment_total<=1)continue;
  const k=t.installment_group_id;
  groups.set(k,[...(groups.get(k)||[]),t]);
 }
 const schedules=[...groups.entries()].map(([id,parts])=>{
  const items=[...parts].sort((a,b)=>(a.installment_number||0)-(b.installment_number||0));
  const next=items.filter(t=>t.card_id||!t.paid_at).sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
  const outstanding=items.filter(t=>t.card_id||!t.paid_at).reduce((sum,t)=>sum+t.amount_cents,0);
  return {id,first:items[0],total:items.reduce((sum,t)=>sum+t.amount_cents,0),outstanding,next,registered:items.length};
 }).sort((a,b)=>(a.next?.due_date||'9999').localeCompare(b.next?.due_date||'9999'));

 return <>
  <div className="section-intro">
   <p>Cadastre salários e contas fixas, como luz e água, com valores mensais fixos ou variáveis. Parcelamentos podem ter qualquer quantidade positiva de parcelas, no cartão ou fora dele.</p>
   <div className="panel-actions">
    <button className="secondary" onClick={()=>onNewFixed('income')}><Plus size={16}/> Receita fixa</button>
    <button className="secondary" onClick={()=>onNewFixed('expense')}><Plus size={16}/> Despesa fixa</button>
    <button className="primary" onClick={onNewInstallment}><Plus size={17}/> Novo parcelamento</button>
   </div>
  </div>
  <div className="kpis compact-kpis">
   <div className="kpi"><small>Receitas fixas do mês</small><strong className="positive">{money(active.filter(r=>r.type==='income').reduce((s,r)=>s+r.amount_cents,0))}</strong></div>
   <div className="kpi"><small>Despesas fixas do mês</small><strong>{money(active.filter(r=>r.type==='expense').reduce((s,r)=>s+r.amount_cents,0))}</strong></div>
   <div className="kpi"><small>Compras e receitas parceladas</small><strong>{schedules.length}</strong></div>
  </div>
  {(['income','expense'] as const).map(kind=><section className="panel" key={kind}>
   <div className="panel-head"><div><h2>{kind==='income'?'Receitas fixas':'Despesas fixas'}</h2><p>{kind==='income'?'Salário, renda recorrente e aluguéis recebidos':'Aluguel, condomínio, energia, internet e assinaturas'}</p></div>
    <button className="secondary small" onClick={()=>onNewFixed(kind)}><Plus size={15}/> Adicionar</button></div>
   <div className="recurring-list">
   {rules.filter(r=>r.type===kind).map(r=>{const actual=transactions.find(t=>t.recurring_rule_id===r.id&&t.due_date.startsWith(month));return <div className="recurring-row fixed-row" key={r.id}>
    <span className="icon-badge teal">{kind==='income'?<ArrowDownRight size={17}/>:<ArrowUpRight size={17}/>}</span>
    <div className="fixed-details">
     <strong>{r.description}</strong>
     <small>Dia {r.day_of_month} · {r.category} · Início {monthName(r.start_month)} {r.end_month?`· Até ${monthName(r.end_month)}`:''}{r.amount_mode==='variable'?' · Valor variável':''}</small>
     <div className="fixed-tags"><span className={`tag ${r.scope}`}>{r.scope==='shared'?'Casal':'Individual'}</span><span className={`status ${r.is_active===false?'pending':'paid'}`}>{r.is_active===false?'Pausada':'Ativa'}</span></div>
    </div>
    <div className="fixed-amount"><strong className={kind==='income'?'positive':''}>{kind==='income'?'+':'−'} {money(actual?.amount_cents??r.amount_cents)}</strong><small>{r.amount_mode==='variable'?(actual?'valor deste mês':'estimativa mensal'):'por mês'}</small></div>
    {r.owner_id===uid&&<div className="fixed-actions">
     {r.amount_mode==='variable'&&<button className="secondary small" onClick={()=>onAdjustFixed(r)}>Informar valor do mês</button>}
     <button className="secondary small" onClick={()=>onEditFixed(r.id)}>Editar regra</button>
     <button className="secondary small" onClick={()=>onToggleFixed(r)}>{r.is_active===false?'Retomar':'Pausar'}</button>
     <button className="icon-button" title="Excluir regra fixa; os lançamentos anteriores permanecem" onClick={()=>onRemoveFixed(r.id)}><X size={17}/></button>
    </div>}
   </div>})}
   {!rules.some(r=>r.type===kind)&&<div className="empty"><p>Nenhuma {kind==='income'?'receita':'despesa'} fixa cadastrada.</p><button className="link-button" onClick={()=>onNewFixed(kind)}>Adicionar primeira {kind==='income'?'receita':'despesa'}</button></div>}
   </div>
  </section>)}
  <section className="panel">
   <div className="panel-head"><div><h2>Parcelamentos</h2><p>Compras e recebimentos com pagamento em vários meses</p></div><button className="secondary" onClick={onNewInstallment}><Plus size={16}/> Novo parcelamento</button></div>
   {schedules.length?<div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Parcelas</th><th className="text-right">Valor total</th><th className="text-right">Pendente / nas faturas</th><th>Próximo vencimento</th></tr></thead><tbody>
    {schedules.map(g=><tr key={g.id}>
     <td><strong>{g.first.description.replace(/ \(\d+\/\d+\)$/,'')}</strong><div className="table-note">{g.first.card_id?<><CreditCard size={13}/> No cartão</>:g.first.type==='income'?'Recebimento parcelado':'Despesa parcelada'} · {g.first.scope==='shared'?'Casal':'Individual'}</div></td>
     <td>{g.registered}/{g.first.installment_total}</td>
     <td className="text-right">{money(g.total)}</td>
     <td className="text-right">{money(g.outstanding)}</td>
     <td>{g.next?g.next.due_date.split('-').reverse().join('/'):'Concluído'}</td>
    </tr>)}
   </tbody></table></div>:<div className="empty"><p>Nenhum parcelamento cadastrado.</p><button className="link-button" onClick={onNewInstallment}>Criar primeiro parcelamento</button></div>}
   <p className="small-hint">No cartão, o valor pendente inclui parcelas distribuídas nas faturas. Pagar a fatura não duplica a despesa.</p>
  </section>
  <div className="section-intro">
   <p>As contas fixas são geradas automaticamente ao acessar o mês. Contas variáveis usam uma estimativa que pode ser ajustada só para o mês atual. Alterações da regra não modificam períodos anteriores.</p>
   <button className="secondary" onClick={onGenerate}><RotateCcw size={16}/> Conferir fixas de {monthName(month)}</button>
  </div>
  <p className="small-hint">Referência de hoje: {today().split('-').reverse().join('/')}.</p>
 </>;
}
