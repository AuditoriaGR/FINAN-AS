import {PiggyBank,Plus,Wallet} from 'lucide-react';
import type {Account,Tables} from './types';
import {accountBalance,accountBalancesByPurpose,isInvestmentAccount,money} from './finance';

type Props={
 accounts:Account[];
 data:Tables;
 onNew:()=>void;
 onUpdateBalance:(id:string)=>void;
};

export default function AccountsOverview({accounts,data,onNew,onUpdateBalance}:Props){
 const {availableCents,investmentCents,totalCents}=accountBalancesByPurpose(
  accounts,data.transactions,data.card_payments,data.account_balance_adjustments
 );
 return <>
  <div className="section-intro">
   <p>O saldo usado para pagar contas fica separado do patrimônio investido. <strong>Os CDBs não entram no saldo projetado nem no simulador de compras.</strong> Um resgate só é considerado quando você registrar a entrada do dinheiro numa conta disponível.</p>
   <button className="primary" onClick={onNew}><Plus size={17}/> Nova conta ou investimento</button>
  </div>
  <div className="investment-overview">
   <div className="investment-summary-tile">
    <Wallet size={23}/>
    <div><small>Disponível em contas</small><strong>{money(availableCents)}</strong>
     <span>Para pagar despesas e faturas</span></div>
   </div>
   <div className="investment-summary-tile">
    <PiggyBank size={23}/>
    <div><small>Investimentos aplicados</small><strong>{money(investmentCents)}</strong>
     <span>Separados da projeção financeira</span></div>
   </div>
  </div>
  {(['cash','investments'] as const).map(kind=>{
   const assets=accounts.filter(a=>isInvestmentAccount(a)===(kind==='investments'));
   if(!assets.length)return null;
   const invested=kind==='investments';
   return <section className="account-purpose-section" key={kind}>
    <div className="account-purpose-heading">
     <div><h2>{invested?'Investimentos · CDB':'Contas para pagamentos'}</h2>
      <p>{invested?'Valores aplicados e preservados como patrimônio do casal':'Dinheiro disponível para despesas e compras programadas'}</p></div>
     <strong>{money(invested?investmentCents:availableCents)}</strong>
    </div>
    <div className="card-grid">{assets.map(a=>{
     const balance=accountBalance(a,data.transactions,data.card_payments,data.account_balance_adjustments);
     const last=data.account_balance_adjustments.filter(x=>x.account_id===a.id)
      .sort((x,y)=>y.created_at.localeCompare(x.created_at))[0];
     return <article className="panel account-card" key={a.id}>
      <div className="line-between"><span className={`icon-badge ${invested?'blue':''}`}>
       {invested?<PiggyBank size={20}/>:<Wallet size={20}/>}</span>
       <span className={`tag ${a.scope}`}>{a.scope==='shared'?'Casal':'Individual'}</span></div>
      <h3>{a.name}</h3><p>{a.kind}</p>
      <small>{invested?'Saldo investido':'Saldo disponível calculado'}</small>
      <div className="account-value">{money(balance)}</div>
      <small>Saldo inicial registrado: {money(a.opening_balance_cents)}</small>
      {last&&<p className="small-hint">Última conciliação: {money(last.balance_after_cents)} · {new Date(last.created_at).toLocaleDateString('pt-BR')}</p>}
      {invested&&<p className="small-hint">Esta aplicação não é utilizada para cobrir despesas futuras automaticamente.</p>}
      <button className="secondary full" onClick={()=>onUpdateBalance(a.id)}>
       {invested?'Atualizar saldo investido':'Atualizar saldo atual'}
      </button>
     </article>;
    })}</div>
   </section>;
  })}
  {accounts.length>0&&<p className="small-hint">Patrimônio financeiro registrado: {money(totalCents)}. Este total inclui aplicações, que não são dinheiro livre para gastar.</p>}
  {!accounts.length&&<section className="panel empty"><p>Nenhuma conta ou investimento cadastrado.</p><button className="link-button" onClick={onNew}>Cadastrar</button></section>}
 </>;
}
