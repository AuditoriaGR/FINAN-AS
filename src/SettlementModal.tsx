import {useState,type FormEvent} from 'react';
import {Check,X,Info} from 'lucide-react';
import type {Account,Tx} from './types';
import {cents,isInvestmentAccount,money,today} from './finance';

export type SettleInput={transactionId:string;actualCents:number;paidOn:string;accountId:string};
type Props={
 tx:Tx;
 accounts:Account[];
 busy:boolean;
 onSave:(input:SettleInput)=>Promise<boolean>;
 onClose:()=>void;
};

export default function SettlementModal({tx,accounts,busy,onSave,onClose}:Props){
 const availableAccounts=accounts.filter(a=>!isInvestmentAccount(a));
 const planned=tx.planned_amount_cents??tx.amount_cents;
 const [actual,setActual]=useState((tx.amount_cents/100).toFixed(2).replace('.',','));
 const [paidOn,setPaidOn]=useState(tx.paid_at||today());
 const [accountId,setAccountId]=useState(
  availableAccounts.some(a=>a.id===tx.account_id)?tx.account_id!:availableAccounts[0]?.id||''
 );
 const actualCents=cents(actual);
 const valid=Number.isSafeInteger(actualCents)&&actualCents>0&&!!paidOn&&paidOn<=today()&&!!accountId;
 const variance=valid?(tx.type==='income'?actualCents-planned:planned-actualCents):null;
 const savingType=tx.type==='income'?'recebimento':'pagamento';
 const handleSubmit=async(e:FormEvent)=>{
  e.preventDefault();
  if(!valid)return;
  const okay=await onSave({transactionId:tx.id,actualCents,paidOn,accountId});
  if(okay)onClose();
 };
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <form className="modal settlement-modal" onSubmit={e=>void handleSubmit(e)}>
   <div className="modal-head">
    <div><span className="eyebrow">PREVISTO × REALIZADO</span>
     <h2>{tx.paid_at?'Corrigir baixa registrada':tx.type==='income'?'Confirmar receita recebida':'Confirmar despesa paga'}</h2>
    </div>
    <button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Fechar"><X size={21}/></button>
   </div>
   <div className="modal-body">
    <p className="small-hint">Confirme o valor que efetivamente entrou ou saiu da conta. A previsão original será preservada para acompanhar a diferença.</p>
    <div className="settlement-detail">
     <strong>{tx.description}</strong>
     <small>{tx.type==='income'?'Receita prevista':'Despesa prevista'} · {tx.category}</small>
     <div className="settlement-plan-line"><span>Valor previsto originalmente</span><strong>{money(planned)}</strong></div>
    </div>
    <label className="field"><span>Valor realmente {tx.type==='income'?'recebido':'pago'} (R$)</span>
     <input required type="text" inputMode="decimal" pattern="[0-9.,]+" value={actual}
      onChange={e=>setActual(e.target.value)} placeholder="0,00" autoFocus/>
    </label>
    <label className="field"><span>Data do {savingType}</span>
     <input required type="date" value={paidOn} max={today()} onChange={e=>setPaidOn(e.target.value)}/>
    </label>
    <label className="field"><span>Conta do casal usada para o {savingType}</span>
     <select required value={accountId} onChange={e=>setAccountId(e.target.value)}>
      <option value="">Selecione a conta</option>
      {availableAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
     </select>
    </label>
    {!availableAccounts.length&&<p className="small-hint"><Info size={14}/> Cadastre uma conta corrente ou disponível para registrar a baixa. Aplicações CDB não são usadas para pagamentos.</p>}
    {variance!==null&&<div className={`settlement-preview ${variance>=0?'favorable':'unfavorable'}`}>
     <span>{variance===0?'Exatamente conforme o previsto':variance>0?'Resultado favorável ao orçamento':'Resultado desfavorável ao orçamento'}</span>
     <strong>{variance>0?'+':variance<0?'−':''}{money(Math.abs(variance))}</strong>
     <small>{tx.type==='income'?'Receber mais melhora o caixa; receber menos reduz o caixa.':'Pagar menos libera dinheiro; pagar mais reduz o caixa.'}</small>
    </div>}
    <p className="small-hint">O valor realizado passa a atualizar o saldo da conta e a projeção. A diferença não altera as próximas parcelas nem os valores das recorrências futuras.</p>
   </div>
   <div className="modal-actions">
    <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancelar</button>
    <button type="submit" className="primary" disabled={busy||!valid}>{busy?'Salvando…':tx.paid_at?'Atualizar realizado':'Confirmar baixa'} <Check size={16}/></button>
   </div>
  </form>
 </div>;
}
