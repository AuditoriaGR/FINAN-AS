import {useMemo} from 'react';
import {TrendingUp,TrendingDown,Search,Lightbulb,ShieldCheck,AlertTriangle} from 'lucide-react';
import type {Tables} from './types';
import {money,monthName,today} from './finance';
import {spendingInsights,type PlanningView} from './planning';

type Props={data:Tables;view:PlanningView;uid:string;month:string};
export default function SpendingInsightsPanel({data,view,uid,month}:Props){
 const anchor=month<=today().slice(0,7)?month:today().slice(0,7);
 const insights=useMemo(()=>spendingInsights(data,view,uid,anchor),[data,view,uid,anchor]);
 const maxExpense=Math.max(1,...insights.months.map(x=>x.expenseCents));
 const labels={
  insufficient:'Dados de receitas insuficientes',
  negative:'Margem projetada negativa',
  attention:'Margem projetada apertada',
  positive:'Margem projetada favorável'
 };
 return <div className="spending-insights">
  <div className="section-intro">
   <p>Entenda padrões dos seus gastos, encontre custos que merecem revisão e confira se seu planejamento protege uma margem para imprevistos.</p>
  </div>
  <div className="planning-stats">
   <div><small>Média mensal de despesas registradas*</small><strong>{money(insights.averageExpenseCents)}</strong></div>
   <div><small>Média mensal de receitas recebidas*</small><strong>{money(insights.averageIncomeCents)}</strong></div>
   <div><small>Meses com dados</small><strong>{insights.historicalMonths} de 6</strong><span>Períodos encerrados</span></div>
   <div><small>Margem projetada dos próximos 3 meses</small><strong className={insights.projectedSurplusPercent!==null&&insights.projectedSurplusPercent<0?'danger-text':''}>{insights.projectedSurplusPercent===null?'—':`${insights.projectedSurplusPercent}%`}</strong><span>{labels[insights.signal]}</span></div>
  </div>
  <section className="panel">
   <div className="panel-head"><div><h2><TrendingUp size={20}/> Tendência de gastos</h2><p>Seis meses anteriores a {monthName(anchor)} — despesas pagas e compras no cartão</p></div><span className="top-badge">6 meses</span></div>
   {insights.historicalMonths<3&&<div className="scenario-feedback neutral"><Search size={20}/><div><strong>Histórico ainda curto</strong><p>Precisamos de ao menos três meses encerrados com registros consistentes para gerar sugestões de economia mais confiáveis.</p></div></div>}
   <div className="spending-trend-bars">
    {insights.months.map(row=><div className="spending-trend-row" key={row.month}>
     <span>{monthName(row.month)}</span>
     <div className="spending-trend-track"><div style={{width:`${Math.round(row.expenseCents/maxExpense*100)}%`}}/></div>
     <strong>{money(row.expenseCents)}</strong>
    </div>)}
   </div>
   <p className="small-hint">Períodos sem lançamentos aparecem como zero, mas podem representar registros incompletos, não necessariamente ausência de gastos.</p>
  </section>
  <section className="panel">
   <div className="panel-head"><div><h2><Lightbulb size={20}/> Oportunidades de economia</h2><p>Exemplos de redução em despesas revisáveis, baseados apenas em dados registrados</p></div></div>
   {insights.opportunities.length?<>
    <div className="opportunity-grid">{insights.opportunities.map(item=><div className="opportunity-item" key={item.category}>
     <div className="line-between"><strong>{item.category}</strong><span>{item.growthPercent!==null?item.growthPercent>0?<><TrendingUp size={15}/> +{item.growthPercent}%</>:<><TrendingDown size={15}/> {item.growthPercent}%</>:'Sem base para tendência'}</span></div>
     <p>Média mensal: <strong>{money(item.averageCents)}</strong></p>
     <p>{item.message}</p>
     <div className="opportunity-saving"><span>Simulação de reduzir 10%</span><strong>{money(item.illustrativeSavingsCents)}/mês</strong></div>
    </div>)}</div>
   </>:<div className="empty"><Lightbulb size={29}/><p>Não há histórico suficiente de despesas revisáveis para sugerir cortes com segurança. Continue registrando seus gastos e voltaremos a comparar os próximos meses.</p></div>}
   <p className="small-hint">Os cortes são hipóteses para análise. Não recomendamos reduzir medicamentos, alimentação básica, contas essenciais ou obrigações financeiras sem avaliar consequências.</p>
  </section>
  <section className="panel">
   <div className="panel-head"><div><h2><ShieldCheck size={20}/> Saúde do planejamento</h2><p>Indicador orientativo, não uma pontuação bancária ou recomendação de investimento</p></div></div>
   <div className={`scenario-feedback ${insights.signal==='positive'?'ok':insights.signal==='negative'?'warn':'neutral'}`}>
    {insights.signal==='positive'?<ShieldCheck size={22}/>:<AlertTriangle size={22}/>}
    <div><strong>{labels[insights.signal]}</strong>
     <p>{insights.signal==='positive'?'A previsão mantém ao menos 15% das receitas como margem nos próximos três meses, considerando os orçamentos cadastrados.':
       insights.signal==='attention'?'A margem projetada está abaixo de 15%. Reveja despesas não essenciais e atualize os limites das categorias.':
       insights.signal==='negative'?'Os compromissos e reservas projetados superam as receitas registradas. Antes de novas compras, confira valores e prioridades.':
       'Cadastre as receitas futuras para comparar seus compromissos previstos com a renda disponível.'}</p>
    </div>
   </div>
   <div className="insight-notes">{insights.notes.map((note,i)=><p key={i}><Search size={14}/>{note}</p>)}</div>
  </section>
 </div>;
}
