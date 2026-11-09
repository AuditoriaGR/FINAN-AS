import {ArrowDownRight,ArrowUpRight,ChartNoAxesCombined} from 'lucide-react';
import type {Tx} from './types';
import {money,monthName} from './finance';
import {settlementSummary} from './settlements';

type Props={transactions:Tx[];month:string};
export default function SettlementSummaryPanel({transactions,month}:Props){
 const summary=settlementSummary(transactions,month);
 const hasData=summary.settledCount>0;
 return <section className="panel realization-panel">
  <div className="panel-head">
   <div><h2>Previsto × realizado</h2>
    <p>Compare o planejado com o que foi realmente pago ou recebido em {monthName(month)}.</p>
   </div>
   <span className="realization-period">{summary.settledCount} baixa(s)</span>
  </div>
  {hasData?<div className="realization-metrics">
   <div className="realization-tile">
    <div className="realization-heading"><ArrowDownRight size={17}/><strong>Receitas recebidas</strong></div>
    <div className="realization-line"><span>Previsto</span><strong>{money(summary.income.plannedCents)}</strong></div>
    <div className="realization-line"><span>Realizado</span><strong>{money(summary.income.actualCents)}</strong></div>
    <div className={`realization-variance ${summary.income.favorableCents<0?'unfavorable':'favorable'}`}>
     {summary.income.favorableCents<0?'Recebemos menos':'Recebemos igual ou mais'}: {summary.income.favorableCents<0?'−':summary.income.favorableCents>0?'+':''}{money(Math.abs(summary.income.favorableCents))}
    </div>
   </div>
   <div className="realization-tile">
    <div className="realization-heading"><ArrowUpRight size={17}/><strong>Despesas pagas</strong></div>
    <div className="realization-line"><span>Previsto</span><strong>{money(summary.expense.plannedCents)}</strong></div>
    <div className="realization-line"><span>Realizado</span><strong>{money(summary.expense.actualCents)}</strong></div>
    <div className={`realization-variance ${summary.expense.favorableCents<0?'unfavorable':'favorable'}`}>
     {summary.expense.favorableCents<0?'Gastamos mais':'Economia / conforme'}: {summary.expense.favorableCents<0?'−':summary.expense.favorableCents>0?'+':''}{money(Math.abs(summary.expense.favorableCents))}
    </div>
   </div>
   <div className={`realization-tile realization-total ${summary.netFavorableCents<0?'unfavorable':'favorable'}`}>
    <div className="realization-heading"><ChartNoAxesCombined size={17}/><strong>Impacto líquido das baixas</strong></div>
    <div className="realization-big">{summary.netFavorableCents>0?'+':summary.netFavorableCents<0?'−':''}{money(Math.abs(summary.netFavorableCents))}</div>
    <p>{summary.netFavorableCents>0?'Melhor do que o previsto':summary.netFavorableCents<0?'Pior do que o previsto':'Conforme o orçamento'} nas movimentações já confirmadas.</p>
   </div>
  </div>:<p className="small-hint">As comparações aparecerão após a primeira baixa de uma receita ou despesa com valor realizado informado. Movimentos ainda pendentes não são tratados como realizados.</p>}
  <p className="small-hint">Comparação limitada às receitas e despesas baixadas individualmente. Faturas de cartão são controladas separadamente pelo valor real da fatura, e valores já incluídos no saldo inicial não são somados de novo.</p>
 </section>;
}
