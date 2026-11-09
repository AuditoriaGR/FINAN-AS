/**
 * Simulador CLT 2026. ESTIMATIVA, não substitui holerite.
 * Fontes: tabela de contribuição INSS 2026, tabela IRRF 2026 (Lei 15.270),
 * CLT arts. 142/143/145 e orientações oficiais do eSocial.
 * Limitações: diferenças de tributação das férias entre competências, médias,
 * convenções coletivas, descontos específicos e encargos de outros empregos.
 * Nenhum valor é contabilizado na base financeira até lançamento explícito.
 */
export type VacationVariant='normal'|'sell10'|'hypothetical30';
export type PayrollInputs={
 baseSalaryCents:number;
 hazardCents:number;
 extrasCents:number;
 monthlyDeductionsCents:number;
 vacationDeductionsCents:number;
 thirteenDeductionsCents:number;
 dependents:number;
 vacationStart:string;
 entitlementDays:number;
 thirteenMonths:number;
 thirteenAlreadyPaidCents:number;
 thirteenOnVacation:boolean;
};
export type TaxBreakdown={grossCents:number;inssCents:number;irrfCents:number;netCents:number};
export type PayrollPayment={date:string;label:string;netCents:number;kind:'vacation'|'salary'|'thirteen_first'|'thirteen_second'};
export type PayrollResult={
 variant:VacationVariant;legal:boolean;
 monthlyGrossCents:number;
 salary:TaxBreakdown & {workedDays:number;vacationDaysInMonth:number;deductionsCents:number;payDate:string};
 vacation:{
  startDate:string;payDate:string|null;daysOff:number;daysSold:number;
  leaveGrossCents:number;leaveThirdCents:number;abonoCents:number;abonoThirdCents:number;
  taxableCents:number;inssCents:number;irrfCents:number;otherDeductionsCents:number;
  grossCents:number;netCents:number|null;hypotheticalExtraGrossCents:number;
 };
 thirteen:{
  annualGrossCents:number;firstCents:number;alreadyPaidCents:number;
  inssCents:number;irrfCents:number;otherDeductionsCents:number;secondNetCents:number;
  firstDueDate:string;secondDueDate:string;
 };
 payments:PayrollPayment[];
 netInMonthCents:number;netFollowingMonthCents:number;totalNetCents:number|null;
 warnings:string[];
};
export const blankPayroll:PayrollInputs={
 baseSalaryCents:0,hazardCents:0,extrasCents:0,
 monthlyDeductionsCents:0,vacationDeductionsCents:0,thirteenDeductionsCents:0,
 dependents:0,vacationStart:'',entitlementDays:30,thirteenMonths:12,
 thirteenAlreadyPaidCents:0,thirteenOnVacation:false
};
const moneyRound=(n:number)=>Math.round(n);
const bound=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
const isoValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const dayMs=86400000;
function dayOrdinal(s:string){return Math.floor(Date.parse(s+'T00:00:00Z')/dayMs)}
function fromOrdinal(n:number){return new Date(n*dayMs).toISOString().slice(0,10)}
export function shiftDate(iso:string,days:number):string|null{
 if(!isoValid(iso))return null;
 return fromOrdinal(dayOrdinal(iso)+days);
}
export function overlappingLeaveDays(start:string,days:number,month:string):number{
 if(!start||!isoValid(start)||days<=0||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return 0;
 const first=dayOrdinal(month+'-01');
 const last=dayOrdinal(fromOrdinal(dayOrdinal(month+'-01')+32).slice(0,7)+'-01')-1;
 return Math.max(0,Math.min(last,dayOrdinal(start)+days-1)-Math.max(first,dayOrdinal(start))+1);
}
export function inss2026(grossCents:number):number{
 const income=bound(grossCents,0,847555);
 const bands=[162100,290284,435427,847555];
 const rates=[0.075,0.09,0.12,0.14];
 let due=0,previous=0;
 for(let i=0;i<bands.length;i++){
  const taxable=Math.max(0,Math.min(income,bands[i])-previous);
  due+=taxable*rates[i];previous=bands[i];
 }
 return moneyRound(due);
}
export function irrf2026(grossCents:number,inssCents:number,dependents=0):number{
 if(grossCents<=0)return 0;
 const legalDeduction=inssCents+bound(dependents,0,30)*18959;
 const deduction=Math.max(legalDeduction,60720);
 const basis=Math.max(0,grossCents-deduction);
 let rate=0,subtract=0;
 if(basis>466468){rate=0.275;subtract=90873}
 else if(basis>375105){rate=0.225;subtract=67549}
 else if(basis>282665){rate=0.15;subtract=39416}
 else if(basis>242880){rate=0.075;subtract=18216}
 const original=Math.max(0,moneyRound(basis*rate-subtract));
 const relief=grossCents<=500000?31289:
  grossCents<=735000?Math.max(0,moneyRound(97862-0.133145*grossCents)):0;
 return Math.max(0,original-Math.min(original,relief));
}
export function taxes2026(grossCents:number,dependents=0):TaxBreakdown{
 const inssCents=inss2026(grossCents);
 const irrfCents=irrf2026(grossCents,inssCents,dependents);
 return {grossCents,inssCents,irrfCents,netCents:grossCents-inssCents-irrfCents};
}
function addPayments(items:PayrollPayment[],kind:PayrollPayment['kind'],date:string|null,net:number,label:string){
 if(date&&net>0)items.push({kind,date,netCents:net,label});
}
export function calculatePayroll(input:PayrollInputs,variant:VacationVariant,month='2026-11'):PayrollResult{
 if(!/^2026-(0[1-9]|1[0-2])$/.test(month))throw new Error('A calculadora usa exclusivamente as tabelas vigentes em 2026.');
 const annualStart=month.slice(0,4);
 const monthlyGrossCents=Math.max(0,
  moneyRound(input.baseSalaryCents)+moneyRound(input.hazardCents)+moneyRound(input.extrasCents));
 const deps=bound(input.dependents,0,30);
 const rightDays=bound(input.entitlementDays,12,30);
 const sold=variant==='sell10'?Math.floor(rightDays/3):variant==='hypothetical30'?rightDays:0;
 const daysOff=variant==='hypothetical30'?0:rightDays-sold;
 const hasStart=isoValid(input.vacationStart);
 // A data-limite da CLT é dois dias antes do início; se cair no fim
 // de semana, a previsão bancária recua para a sexta-feira.
 const rawVacationPayDate=hasStart?shiftDate(input.vacationStart,-2):null;
 const payWeekday=rawVacationPayDate
  ?new Date(rawVacationPayDate+'T00:00:00Z').getUTCDay():-1;
 const payDate=rawVacationPayDate?
  shiftDate(rawVacationPayDate,payWeekday===0?-2:payWeekday===6?-1:0):null;
 const monthlySalaryDay=fromOrdinal(dayOrdinal(month+'-01')+32).slice(0,7)+'-05';
 const daysOffInMonth=hasStart?overlappingLeaveDays(input.vacationStart,daysOff,month):0;
 const [yearNum,monthNum]=month.split('-').map(Number);
 const calendarDays=new Date(Date.UTC(yearNum,monthNum,0)).getUTCDate();
 // Converter férias em dias equivalentes de folha (divisor 30).
 // Evita atribuir salário residual fictício num fevereiro inteiro de férias.
 const workedDays=bound(Math.round(30*(calendarDays-daysOffInMonth)/calendarDays),0,30);
 const salaryGross=moneyRound(monthlyGrossCents*workedDays/30);
 const salaryTaxes=taxes2026(salaryGross,deps);
 const monthlyDeductions=moneyRound(input.monthlyDeductionsCents);
 const salaryNet=Math.max(0,salaryTaxes.netCents-monthlyDeductions);
 const leaveGross=moneyRound(monthlyGrossCents*daysOff/30);
 const leaveThird=moneyRound(leaveGross/3);
 const abono=variant==='sell10'?moneyRound(monthlyGrossCents*sold/30):0;
 const abonoThird=moneyRound(abono/3);
 const taxableVacation=leaveGross+leaveThird;
 const vacationTaxes=taxes2026(taxableVacation,deps);
 const vacationDiscount=moneyRound(input.vacationDeductionsCents);
 const holidayGross=leaveGross+leaveThird+abono+abonoThird;
 // No legally cognizable receipt/net estimate for selling 100% of leave.
 const vacationNet=variant==='hypothetical30'?null:
  Math.max(0,holidayGross-vacationTaxes.inssCents-vacationTaxes.irrfCents-vacationDiscount);
 const hypotheticalExtra=variant==='hypothetical30'?
  moneyRound(monthlyGrossCents*rightDays/30*4/3):0;
 const thirteenGross=moneyRound(monthlyGrossCents*bound(input.thirteenMonths,1,12)/12);
 const advancePaid=moneyRound(input.thirteenAlreadyPaidCents);
 const firstTarget=moneyRound(thirteenGross/2);
 const first=Math.max(0,firstTarget-advancePaid);
 const thirteenTaxes=taxes2026(thirteenGross,deps);
 const thirteenDeduction=moneyRound(input.thirteenDeductionsCents);
 const secondNet=Math.max(0,thirteenGross-advancePaid-first-
  thirteenTaxes.inssCents-thirteenTaxes.irrfCents-thirteenDeduction);
 const firstDue= input.thirteenOnVacation&&payDate&&payDate<=annualStart+'-11-30'
  ?payDate:annualStart+'-11-30';
 const secondDue=annualStart+'-12-20';
 const payments:PayrollPayment[]=[];
 if(vacationNet!==null)addPayments(payments,'vacation',payDate,vacationNet,'Férias líquidas estimadas');
 addPayments(payments,'salary',monthlySalaryDay,salaryNet,'Salário líquido da competência '+month);
 addPayments(payments,'thirteen_first',firstDue,first,'1ª parcela do 13º ainda a receber');
 addPayments(payments,'thirteen_second',secondDue,secondNet,'2ª parcela líquida do 13º');
 payments.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label));
 const sumMonth=payments.filter(p=>p.date.slice(0,7)===month).reduce((s,p)=>s+p.netCents,0);
 const nextMonth=monthlySalaryDay.slice(0,7);
 const sumNext=payments.filter(p=>p.date.slice(0,7)===nextMonth).reduce((s,p)=>s+p.netCents,0);
 const warnings:string[]=[];
 if(!hasStart)warnings.push('Informe a data de início das férias para calcular os dias realmente trabalhados no mês e a data do recibo.');
 if(variant==='hypothetical30')warnings.push('Cenário hipotético: vender 100% do período não é abono legal. A verba extra é apenas valor bruto de referência, sem cálculo líquido ou lançamento financeiro.');
 if(input.thirteenAlreadyPaidCents>thirteenGross)warnings.push('O adiantamento do 13º informado ultrapassa o valor anual estimado; confirme o holerite.');
 if(!input.thirteenOnVacation)warnings.push('A 1ª parcela do 13º foi posicionada em 30/11 apenas como referência de prazo máximo; se sua empresa já antecipou, informe o valor recebido.');
 if(salaryGross<monthlyGrossCents&&hasStart)warnings.push('O salário de 05/12 considera apenas os dias não cobertos por férias em novembro (divisor 30). Ajustes de INSS, IR e adiantamentos no fechamento da folha podem mudar o líquido.');
 return {
  variant,legal:variant!=='hypothetical30',monthlyGrossCents,
  salary:{...salaryTaxes,netCents:salaryNet,workedDays,vacationDaysInMonth:daysOffInMonth,
   deductionsCents:monthlyDeductions,payDate:monthlySalaryDay},
  vacation:{startDate:input.vacationStart,payDate,daysOff,daysSold:sold,
   leaveGrossCents:leaveGross,leaveThirdCents:leaveThird,abonoCents:abono,
   abonoThirdCents:abonoThird,taxableCents:taxableVacation,
   inssCents:vacationTaxes.inssCents,irrfCents:vacationTaxes.irrfCents,
   otherDeductionsCents:vacationDiscount,grossCents:holidayGross,
   netCents:vacationNet,hypotheticalExtraGrossCents:hypotheticalExtra},
  thirteen:{annualGrossCents:thirteenGross,firstCents:first,alreadyPaidCents:advancePaid,
   inssCents:thirteenTaxes.inssCents,irrfCents:thirteenTaxes.irrfCents,
   otherDeductionsCents:thirteenDeduction,secondNetCents:secondNet,
   firstDueDate:firstDue,secondDueDate:secondDue},
  payments,netInMonthCents:sumMonth,netFollowingMonthCents:sumNext,
  totalNetCents:variant==='hypothetical30'?null:payments.reduce((s,p)=>s+p.netCents,0),
  warnings
 };
}
