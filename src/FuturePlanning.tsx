import {useEffect,useMemo,useState} from 'react';
import {Calculator,CheckCircle2,AlertTriangle,ShieldCheck,ShoppingBag} from 'lucide-react';
import type {Tables} from './types';
import {categories} from './types';
import {cents,money,monthName,visible} from './finance';
import {projectedWithCarryForward,simulatePurchase,type PlanningView} from './planning';

type Props={data:Tables;view:PlanningView;uid:string;month:string};
export default function FuturePlanning({data,view,uid,month}:Props){
 const [cost,setCost]=useState('1.200,00');
 const [amountMode,setAmountMode]=useState<'total'|'installment'>('total');
 const [installments,setInstallments]=useState('6');
 const [purchaseMonth,setPurchaseMonth]=useState(month);
 useEffect(()=>setPurchaseMonth(month),[month]);
 const [purchaseDay,setPurchaseDay]=useState('10');
 const [category,setCategory]=useState('Compras');
 const [cardId,setCardId]=useState('');
 const cards=visible(data.credit_cards,view,uid);
 const projected=useMemo(()=>projectedWithCarryForward(data,view,uid,month,12),[data,view,uid,month]);
 const sim=useMemo(()=>{
  try{
   const amountCents=cents(cost);
   if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('Informe o preço da compra');
   const n=Number(installments),day=Number(purchaseDay);
   if(!purchaseMonth)throw Error('Selecione o mês da compra');
   return {result:simulatePurchase(data,view,uid,month,12,{
    amountCents,amountMode,installments:n,purchaseMonth,purchaseDay:day,category,cardId:cardId||null
   }),error:null as string|null};
  }catch(e){return {result:null,error:e instanceof Error?e.message:'Informe dados válidos'}}
 },[data,view,uid,month,cost,amountMode,installments,purchaseMonth,purchaseDay,category,cardId]);
 const current=projected[0];const negatives=projected.filter(r=>r.balanceCents<0);
 const plannedCost=projected.reduce((s,r)=>s+r.expenseCents,0);
 return <div className="future-planning">
  <div className="section-intro">
   <div><p>Projeção conservadora: orçamentos de categoria valem como <strong>reserva mínima</strong> para os meses seguintes, até serem alterados. O limite dos cartões também é considerado na visão consolidada.</p></div>
  </div>
  <div className="planning-stats">
   <div><small>Despesa total protegida · {monthName(month)}</small><strong>{money(current.expenseCents)}</strong><span>Inclui gastos, parcelas, fixos e reservas</span></div>
   <div><small>Reservas adicionais de categorias</small><strong>{money(current.budgetReserveCents)}</strong><span>Somente o que ainda falta para o piso</span></div>
   <div><small>Reserva complementar dos cartões</small><strong>{money(current.cardReserveCents)}</strong><span>{view==='all'?'Sem repetir lançamentos e categorias usadas no cartão':'Aplicada apenas no consolidado acessível'}</span></div>
   <div><small>Meses com margem negativa</small><strong>{negatives.length}</strong><span>Dentro dos próximos 12 meses</span></div>
  </div>
  <section className="panel">
   <div className="panel-head"><div><h2>Projeção financeira protegida</h2><p>Receitas e compromissos registrados + piso do orçamento + reserva adicional de cartões</p></div><span className="top-badge">12 meses</span></div>
   <div className="table-wrap"><table><thead><tr>
    <th>Mês</th><th className="text-right">Receitas</th><th className="text-right">Já previsto</th><th className="text-right">Reserva categorias</th><th className="text-right">Reserva cartões</th><th className="text-right">Total despesas</th><th className="text-right">Resultado do mês</th><th className="text-right">Saldo acumulado*</th>
   </tr></thead><tbody>{projected.map(r=><tr key={r.month}>
    <td><strong>{monthName(r.month)}</strong></td>
    <td className="text-right positive">{money(r.incomeCents)}</td>
    <td className="text-right">{money(r.knownExpenseCents)}</td>
    <td className="text-right">{money(r.budgetReserveCents)}</td>
    <td className="text-right">{money(r.cardReserveCents)}</td>
    <td className="text-right strong">{money(r.expenseCents)}</td>
    <td className={`text-right strong ${r.balanceCents<0?'danger-text':'positive'}`}>{money(r.balanceCents)}</td>
    <td className={`text-right ${r.cumulativeCents<0?'danger-text':''}`}>{money(r.cumulativeCents)}</td>
   </tr>)}</tbody></table></div>
   <p className="small-hint">*O saldo acumulado transporta a sobra ou o déficit dos meses anteriores, começando pelo mês atual. Exemplo: sobra de R$ 1.000 em dezembro + R$ 80 em janeiro = R$ 1.080 acumulados em janeiro. Não inclui automaticamente o saldo bancário real. A previsão depende de receitas, despesas e limites cadastrados; o teto dos cartões é reserva de planejamento, não cobrança bancária.</p>
  </section>
  <section className="panel">
   <div className="panel-head"><div><h2>Limites das categorias considerados no futuro</h2><p>Exemplo: orçamento de R$ 800, gastos já previstos de R$ 300, reserva adicional de R$ 500.</p></div></div>
   {current.budgetFloors.length?
    <div className="table-wrap"><table><thead><tr><th>Categoria</th><th>Visibilidade</th><th>Vigência</th><th className="text-right">Piso mensal</th><th className="text-right">Já considerado</th><th className="text-right">Complemento</th></tr></thead><tbody>{current.budgetFloors.map(f=><tr key={f.budget.id}>
      <td>{f.budget.category}</td><td>{f.budget.scope==='shared'?'Casal':'Individual'}</td><td>{monthName(f.budget.sourceMonth)}</td>
      <td className="text-right">{money(f.budget.amount_cents)}</td><td className="text-right">{money(f.knownCents)}</td><td className="text-right strong">{money(f.extraCents)}</td>
     </tr>)}</tbody></table></div>
    :<div className="empty"><p>Nenhum limite de categoria vigente. Defina os pisos em Limites e orçamentos para protegê-los na projeção.</p></div>}
  </section>
  <section className="panel purchase-simulator">
   <div className="panel-head"><div><h2><ShoppingBag size={20}/> Simular uma compra</h2><p>Teste uma compra sem gravá-la e avalie o impacto no orçamento dos próximos 12 meses.</p></div><Calculator size={24}/></div>
   <div className="scenario-form">
    <label className="field"><span>Como deseja informar o preço?</span><select value={amountMode} onChange={e=>setAmountMode(e.target.value as 'total'|'installment')}>
     <option value="total">Valor total da compra</option><option value="installment">Valor de cada parcela</option>
    </select></label>
    <label className="field"><span>{amountMode==='total'?'Preço total (R$)':'Valor da parcela (R$)'}</span><input inputMode="decimal" value={cost} onChange={e=>setCost(e.target.value)} placeholder="Ex.: 1.200,00"/></label>
    <label className="field"><span>Quantidade de parcelas</span><input type="number" min={1} step={1} value={installments} onChange={e=>setInstallments(e.target.value)}/></label>
    <label className="field"><span>Mês da compra</span><input type="month" value={purchaseMonth} onChange={e=>setPurchaseMonth(e.target.value)}/></label>
    <label className="field"><span>Dia da compra ou vencimento</span><input type="number" min={1} max={28} value={purchaseDay} onChange={e=>setPurchaseDay(e.target.value)}/></label>
    <label className="field"><span>Categoria</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    <label className="field"><span>Forma de pagamento</span><select value={cardId} onChange={e=>setCardId(e.target.value)}>
     <option value="">À vista / parcelado fora do cartão</option>{cards.map(c=><option value={c.id} key={c.id}>Cartão: {c.name}</option>)}
    </select></label>
   </div>
   {sim.error&&<div className="scenario-feedback warn"><AlertTriangle size={20}/>{sim.error}</div>}
   {sim.result&&<><div className={`scenario-feedback ${sim.result.verdict==='fits'?'ok':sim.result.verdict==='tight'?'warn':'neutral'}`}>
     {sim.result.verdict==='fits'?<CheckCircle2 size={23}/>:<AlertTriangle size={23}/>}
     <div><strong>{sim.result.verdict==='fits'?'A compra cabe na projeção cadastrada':sim.result.verdict==='tight'?'Esta compra pressiona o orçamento':sim.result.verdict==='partial'?'Análise parcial: parcelas seguem após 12 meses':'Ainda não há receitas previstas suficientes para concluir'}</strong>
      <p>{sim.result.verdict==='fits'?'Não foram identificados déficits mensais nem estouro de limites com os valores informados.':
       sim.result.verdict==='tight'?'Pelo menos um mês ficaria negativo ou ultrapassaria um orçamento ou teto de cartão. Confira os períodos abaixo.':
       sim.result.verdict==='partial'?'A compra não pressiona os 12 meses exibidos, mas há parcelas além desse período. Ainda não é possível afirmar que ela cabe no orçamento completo.':
       'Registre ou atualize as receitas futuras antes de confiar no resultado da simulação.'}</p></div>
    </div>
    <div className="planning-stats scenario-stats">
     <div><small>Valor da compra</small><strong>{money(sim.result.totalPurchaseCents)}</strong></div>
     <div><small>Impacto adicional na projeção*</small><strong>{money(sim.result.impactCents)}</strong></div>
     <div><small>Absorvido por reservas existentes*</small><strong>{money(sim.result.absorbedCents)}</strong></div>
     <div><small>Primeiro vencimento</small><strong>{monthName(sim.result.firstDueMonth)}</strong></div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Mês</th><th className="text-right">Resultado mensal antes</th><th className="text-right">Resultado mensal após</th><th className="text-right">Saldo acumulado após</th><th className="text-right">Efeito na despesa</th></tr></thead><tbody>
     {sim.result.withPurchase.map((row,i)=><tr key={row.month}><td>{monthName(row.month)}</td><td className="text-right">{money(sim.result!.baseline[i].balanceCents)}</td><td className={`text-right strong ${row.balanceCents<0?'danger-text':'positive'}`}>{money(row.balanceCents)}</td><td className={`text-right strong ${row.cumulativeCents<0?'danger-text':'positive'}`}>{money(row.cumulativeCents)}</td><td className="text-right">{money(Math.max(0,row.expenseCents-sim.result!.baseline[i].expenseCents))}</td></tr>)}
    </tbody></table></div>
    {sim.result.extendsBeyondHorizon&&<p className="scenario-note"><AlertTriangle size={15}/> Algumas parcelas vencem depois do horizonte analisado. A compra exige planejamento adicional.</p>}
    {sim.result.monthsOverCardCap.length>0&&<p className="scenario-note"><AlertTriangle size={15}/> Teto de cartões ultrapassado em {sim.result.monthsOverCardCap.map(monthName).join(', ')}.</p>}
    {sim.result.categoryOverages.length>0&&<p className="scenario-note"><AlertTriangle size={15}/> A categoria {category} ultrapassaria o limite cadastrado em {Array.from(new Set(sim.result.categoryOverages.map(x=>x.month))).map(monthName).join(', ')}.</p>}
    {sim.result.monthsWithDeficit.length>0&&<p className="scenario-note"><AlertTriangle size={15}/> Resultado mensal negativo em {sim.result.monthsWithDeficit.map(monthName).join(', ')}.</p>}
    <p className="small-hint">*Reservas podem absorver parte da compra simulada sem aumentar o total planejado. Isso não significa que o dinheiro já esteja disponível em conta. O simulador considera apenas as parcelas que vencem dentro dos 12 meses mostrados; ele não salva a compra.</p>
   </>}
  </section>
  <div className="planning-footnote"><ShieldCheck size={17}/><span>Planejamento preventivo: <strong>{money(plannedCost)}</strong> em despesas e reservas previstas no horizonte. Reveja valores periodicamente para manter o cenário realista.</span></div>
 </div>;
}
