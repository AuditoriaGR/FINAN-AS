import type {Tx} from './types';
import {isoMonth} from './finance';

export type RealizationTotals={
 count:number;plannedCents:number;actualCents:number;favorableCents:number;
};
export type RealizationSummary={
 income:RealizationTotals;
 expense:RealizationTotals;
 netFavorableCents:number;
 settledCount:number;
};

/** Positivo = melhor para o caixa; negativo = pior.
 *  Receitas acima do previsto ou despesas abaixo do previsto são favoráveis.
 */
export function settlementVariance(tx:Tx):number|null{
 if(!tx.paid_at||tx.in_opening_balance||tx.card_id||tx.planned_amount_cents==null)return null;
 return tx.type==='income'
  ? tx.amount_cents-tx.planned_amount_cents
  : tx.planned_amount_cents-tx.amount_cents;
}

/** Compara apenas baixas confirmadas com valor original preservado.
 * O período é o mês de vencimento do planejamento, não o dia da baixa.
 * Contas no cartão são reconciliadas separadamente, pelo valor real da fatura.
 */
export function settlementSummary(transactions:Tx[],month:string):RealizationSummary{
 const empty=():RealizationTotals=>({count:0,plannedCents:0,actualCents:0,favorableCents:0});
 const result:RealizationSummary={income:empty(),expense:empty(),netFavorableCents:0,settledCount:0};
 for(const tx of transactions){
  if(isoMonth(tx.due_date)!==month)continue;
  const variance=settlementVariance(tx);
  if(variance===null)continue;
  const bucket=tx.type==='income'?result.income:result.expense;
  bucket.count++;
  bucket.plannedCents+=tx.planned_amount_cents!;
  bucket.actualCents+=tx.amount_cents;
  bucket.favorableCents+=variance;
  result.netFavorableCents+=variance;
  result.settledCount++;
 }
 return result;
}
