import {Check,Download,Pencil,Plus,X} from 'lucide-react';
import type {Tx} from './types';
import {isoMonth,money} from './finance';
import {settlementVariance} from './settlements';
import SettlementSummaryPanel from './SettlementSummaryPanel';

type Props={
 transactions:Tx[];month:string;uid:string;
 onNew:()=>void;onNewFixed:()=>void;onExport:()=>void;
 onDelete:(id:string)=>void;onSettle:(id:string)=>void;
};
const prettyDate=(date:string)=>date?new Date(date+'T12:00:00').toLocaleDateString('pt-BR'):'—';

export default function TransactionsPage({
 transactions,month,uid,onNew,onNewFixed,onExport,onDelete,onSettle
}:Props){
 const current=[...transactions].filter(t=>isoMonth(t.due_date)===month)
  .sort((a,b)=>a.due_date.localeCompare(b.due_date));
 return <>
  <SettlementSummaryPanel transactions={transactions} month={month}/>
  <section className="panel">
   <div className="panel-head">
    <div><h2>Movimentações do mês</h2>
     <p>Baixe receitas e despesas com o valor realmente pago ou recebido. O previsto original fica preservado.</p></div>
    <div className="panel-actions">
     <button className="secondary" onClick={onExport}><Download size={16}/> Exportar CSV</button>
     <button className="secondary" onClick={onNewFixed}><Plus size={16}/> Despesa fixa</button>
     <button className="primary" onClick={onNew}><Plus size={17}/> Novo lançamento</button>
    </div>
   </div>
   {current.length?<div className="table-wrap"><table>
    <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th>
     <th>Visibilidade</th><th>Status</th><th className="text-right">Previsto</th>
     <th className="text-right">Realizado</th><th className="text-right">Diferença</th><th/></tr></thead>
    <tbody>{current.map(t=>{
     const planned=t.planned_amount_cents??t.amount_cents;
     const delta=settlementVariance(t);
     return <tr key={t.id}>
      <td><strong>{t.description}</strong>
       {t.installment_number&&<div className="table-note">Parcela {t.installment_number}/{t.installment_total}</div>}
      </td>
      <td>{t.category}</td>
      <td>{prettyDate(t.due_date)}</td>
      <td><span className={`tag ${t.scope}`}>{t.scope==='shared'?'Casal':'Individual'}</span></td>
      <td><span className={`status ${t.in_opening_balance?'paid':t.card_id?'neutral':t.paid_at?'paid':'pending'}`}>
       {t.in_opening_balance?'Já no saldo inicial':t.card_id?'Na fatura':t.paid_at?(t.type==='income'?'Recebido':'Pago'):'Pendente'}
      </span></td>
      <td className={`text-right strong ${t.type==='income'?'positive':''}`}>{t.type==='income'?'+':'−'} {money(planned)}</td>
      <td className="text-right">{t.paid_at&&!t.card_id?money(t.amount_cents):'—'}</td>
      <td className={`text-right ${delta===null?'':delta>=0?'positive':'danger-text'}`}>
       {delta===null?'—':delta===0?'Conforme':`${delta>0?'+':'−'} ${money(Math.abs(delta))}`}
      </td>
      <td><div className="table-buttons">
       {(t.owner_id===uid||t.scope==='shared')&&!t.card_id&&!t.in_opening_balance&&
        <button aria-label={t.paid_at?'Corrigir valor realizado':'Dar baixa com valor realizado'}
         title={t.paid_at?'Corrigir valor realizado':'Dar baixa com valor realizado'}
         onClick={()=>onSettle(t.id)}>{t.paid_at?<Pencil size={16}/>:<Check size={16}/>}</button>}
       {(t.owner_id===uid||t.scope==='shared')&&
        <button title="Excluir" onClick={()=>onDelete(t.id)}><X size={16}/></button>}
      </div></td>
     </tr>;
    })}</tbody></table></div>:
     <div className="empty-state"><p>Ainda não há lançamentos neste mês.</p>
      <button className="secondary" onClick={onNew}>Cadastrar lançamento</button>
     </div>}
  </section>
 </>;
}
