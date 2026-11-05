import {useEffect,useState,type FormEvent} from 'react';
import {AlertTriangle,CheckCircle2,CreditCard,Save} from 'lucide-react';
import {cents,money,monthName,cardSpendingSummary} from './finance';

type Summary=ReturnType<typeof cardSpendingSummary>;
type Props={summary:Summary;month:string;onSave:(amountCents:number)=>Promise<void>;busy:boolean};

export default function CardSpendingBudget({summary,month,onSave,busy}:Props){
 const [entered,setEntered]=useState('');
 const [error,setError]=useState('');
 useEffect(()=>{
  setEntered(summary.limitCents===null?'':(summary.limitCents/100).toFixed(2).replace('.',','));
  setError('');
 },[month,summary.limitCents,summary.limit?.effective_month]);
 const onSubmit=async(event:FormEvent)=>{
  event.preventDefault();
  const value=cents(entered);
  if(!Number.isSafeInteger(value)||value<=0){setError('Informe um teto mensal válido, maior que zero.');return}
  setError('');
  await onSave(value);
 };
 const pct=summary.percent;
 const remaining=summary.remainingCents;
 return <section className="panel card-spending-budget">
  <div className="panel-head">
   <div>
    <h2><CreditCard size={20}/> Limite total dos cartões</h2>
    <p>Uma meta de gastos para todos os seus cartões, somando faturas e despesas fixas previstas.</p>
   </div>
   {pct!==null&&<span className={`status ${pct>=100?'pending':pct>=80?'neutral':'paid'}`}>
    {pct>=100?<><AlertTriangle size={14}/> Acima do limite</>:pct>=80?'Próximo do limite':<><CheckCircle2 size={14}/> Dentro do limite</>}
   </span>}
  </div>
  <form onSubmit={onSubmit} className="card-limit-form">
   <label className="field">
    <span>Teto mensal de todos os cartões (R$)</span>
    <input required type="text" inputMode="decimal" placeholder="Ex.: 2.000,00" value={entered}
      onChange={event=>setEntered(event.target.value)} pattern="[0-9.,]+"/>
   </label>
   <button className="primary" disabled={busy} type="submit"><Save size={16}/> {summary.limit?.effective_month===month?'Atualizar teto':'Programar teto'}</button>
  </form>
  {error&&<p className="danger-text">{error}</p>}
  <p className="small-hint">O teto escolhido para {monthName(month)} valerá também nos meses seguintes, até você definir outro. Este é um limite de planejamento, não altera o limite bancário dos cartões.</p>
  <div className="card-budget-stats">
   <div><small>Faturas registradas</small><strong>{money(summary.chargedCents)}</strong></div>
   <div><small>Fixos futuros ainda não lançados</small><strong>{money(summary.fixedPendingCents)}</strong></div>
   <div><small>Comprometido no mês</small><strong>{money(summary.committedCents)}</strong></div>
   <div><small>{remaining!==null?(remaining>=0?'Disponível para gastar':'Teto ultrapassado'):'Limite ainda não configurado'}</small>
    <strong className={remaining!==null&&remaining<0?'danger-text':''}>{remaining===null?'—':money(Math.abs(remaining))}</strong></div>
  </div>
  {pct!==null&&<><div className="meter"><span className={pct>=100?'danger':pct>=80?'warn':''} style={{width:`${Math.min(100,Math.max(0,pct))}%`}}/></div>
    <div className="line-between budget-foot"><span>{summary.limit?.effective_month? `Limite vigente desde ${monthName(summary.limit.effective_month)}`:''}</span><strong className={pct>=100?'danger-text':''}>{pct}% utilizado</strong></div></>}
  <div className="card-budget-breakdown">
   <h3>Distribuição por cartão · {monthName(month)}</h3>
   {summary.cards.map(c=><div className="card-budget-card" key={c.card_id}>
    <div><strong>{c.name}</strong><small>Fatura: {money(c.chargedCents)} {c.fixedPendingCents>0?`· Fixos previstos: ${money(c.fixedPendingCents)}`:''}</small></div>
    <strong>{money(c.committedCents)}</strong>
   </div>)}
   {!summary.cards.length&&<p className="small-hint">Cadastre seus cartões na área Cartões para acompanhar o teto geral.</p>}
  </div>
  <p className="small-hint">As faturas entram pelo valor integral, mesmo quando já pagas. Gastos fixos já contabilizados nas faturas ({money(summary.fixedChargedCents)}) não são somados novamente. Cartões privados de outra pessoa não são exibidos nem contabilizados no seu limite.</p>
 </section>;
}
