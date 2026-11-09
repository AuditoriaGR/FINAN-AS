import {CalendarDays,Info,ShieldAlert,Wallet} from 'lucide-react';
import {money,monthName} from './finance';
import type {SalaryRecoveryPlan,SalaryRecoveryRow} from './salaryReserve';

function MonthRows({rows,combined=false}:{rows:SalaryRecoveryRow[];combined?:boolean}){
 return <div className="table-wrap">
  <table className="payroll-reserve-table">
   <thead><tr><th>Recebimento</th>{!combined&&<th>Dias trabalhados</th>}
    <th className="text-right">Salário líquido previsto</th>
    <th className="text-right">Média líquida habitual</th>
    <th className="text-right">Complementar com reserva</th>
    <th>Separar o dinheiro em</th>
   </tr></thead>
   <tbody>{rows.map(r=><tr key={r.payMonth}>
    <td><strong>{monthName(r.payMonth)}</strong>
     <small>Dia 5 como referência</small></td>
    {!combined&&<td>{r.daysWorked}/30</td>}
    <td className="text-right">{money(r.expectedNetCents)}</td>
    <td className="text-right">{money(r.ordinaryNetCents)}</td>
    <td className={`text-right strong ${r.reserveNeededCents>0?'danger-text':'positive'}`}>
     {r.reserveNeededCents>0?money(r.reserveNeededCents):'Sem complemento'}
    </td>
    <td><strong>{monthName(r.reserveMonth)}</strong>
     <small>{r.reserveNeededCents>0?'Guardar no mês anterior':'Nenhuma reserva necessária'}</small></td>
   </tr>)}</tbody>
  </table>
 </div>;
}

export function IndividualSalaryReserve({
 plan,person
}:{plan:SalaryRecoveryPlan;person:string}){
 return <section className="panel payroll-reserve">
  <div className="panel-head">
   <div><h2><Wallet size={19}/> Reserva para complementar salário</h2>
    <p>Mostra os salários dos três meses após o início das férias de {person}, com a recomposição gradual.</p></div>
   <CalendarDays size={20}/>
  </div>
  {!plan.hasOrdinaryNet?
   <div className="payroll-reserve-empty">
    Informe a <strong>média líquida que recebe normalmente</strong> para calcular quanto deverá separar dos adiantamentos de férias e outras entradas.
   </div>:
   <>
    <div className="payroll-reserve-summary">
     <div><small>Reserva total para os três salários</small>
      <strong>{money(plan.totalReserveCents)}</strong>
      <span>É dinheiro a guardar e utilizar depois, não uma receita extra.</span></div>
     <div><small>Primeira reserva: {monthName(plan.firstReserveMonth)}</small>
      <strong>{money(plan.rows[0]?.reserveNeededCents??0)}</strong>
      <span>Para complementar o salário de {plan.rows[0]?monthName(plan.rows[0].payMonth):'mês seguinte'}.</span></div>
    </div>
    <MonthRows rows={plan.rows}/>
    <p className="small-hint"><Info size={14}/> Exemplo: se a média é R$ 4.340 e o salário previsto para dezembro é R$ 3.500,
     separe R$ 840 em novembro e use essa reserva para completar dezembro. O valor é separado da própria entrada já recebida; não deve ser somado como nova receita.</p>
   </>
  }
  <p className="small-hint"><ShieldAlert size={14}/> Datas no dia 5 são referências de planejamento, não confirmação do depósito.
   Para salários pagos em 2027, o cálculo usa temporariamente as faixas INSS/IRRF de 2026. Ajustes do RH podem alterar os líquidos.</p>
 </section>;
}

export function HouseholdSalaryReserve({
 rows,names
}:{rows:SalaryRecoveryRow[];names:string[]}){
 if(!rows.length)return null;
 const total=rows.reduce((s,row)=>s+row.reserveNeededCents,0);
 return <section className="panel payroll-reserve payroll-reserve-household">
  <div className="panel-head"><div><h2><Wallet size={19}/> Reserva conjunta dos próximos salários</h2>
   <p>{names.join(' + ')} · comparação com as médias líquidas de cada um.</p></div></div>
  <div className="payroll-reserve-summary">
   <div><small>Total que o casal precisa reservar</small><strong>{money(total)}</strong>
    <span>Para complementar os três salários previstos, sem contar duas vezes o dinheiro guardado.</span></div>
   <div><small>Primeira separação ({monthName(rows[0].reserveMonth)})</small>
    <strong>{money(rows[0].reserveNeededCents)}</strong>
    <span>Ajuda a manter a renda habitual em {monthName(rows[0].payMonth)}.</span></div>
  </div>
  <MonthRows rows={rows} combined/>
  <p className="small-hint">A reserva do casal soma os déficits individuais. Uma sobra de uma pessoa não cancela automaticamente o valor que a outra precisa preservar. Nenhuma transferência ou movimentação financeira foi lançada.</p>
 </section>;
}
