/* Simulador CLT 2026 — estimativa para planejamento, não substitui holerite.
 * Regras e tabelas: MTE/CLT arts. 142-145, INSS jan/2026 e IRRF 2026.
 * Valores inteiros em centavos. Nenhum cálculo grava lançamentos no financeiro.
 */
export type SaleScenario=0|10|30;
export type PayrollInput={
 baseSalaryCents:number;
 hazardMode:'percent30'|'fixed';
 hazardFixedCents:number;
 habitualExtrasCents:number;
 salaryDiscountCents:number;
 vacationDiscountCents:number;
 thirteenthDiscountCents:number;
 dependents:number;
 thirteenthMonths:number;
 firstThirteenthPaidCents:number;
 vacationStart:string;
 saleDays:SaleScenario;
 salaryCompetence:string;
};
export type Deduction={grossCents:number;inssCents:number;irrfCents:number;extraCents:number;netCents:number};
export type PayrollEstimate={
 remunerationCents:number;
 hazardCents:number;
 vacation:{
  leaveDays:number;soldDays:number;endDate:string;payDate:string;
  leaveGrossCents:number;oneThirdLeaveCents:number;abonoCents:number;
  abonoOneThirdCents:number;taxableCents:number;
  totalGrossCents:number;inssCents:number;irrfCents:number;
  discountCents:number;netCents:number;
  hypothetical:boolean;hypotheticalGrossCents:number|null;
 };
 salary:{
  month:string;payDate:string;workDays:number;daysInMonth:number;
  grossCents:number;inssCents:number;irrfCents:number;
  discountCents:number;netCents:number
 };
 thirteenth:{
  annualGrossCents:number;firstGrossCents:number;firstPayableCents:number;
  firstAlreadyPaidCents:number;
  inssCents:number;irrfCents:number;secondDiscountCents:number;secondNetCents:number;
  payDateFirst:string;payDateSecond:string
 };
 totalFutureNetCents:number;
 warnings:string[];
};
export const payroll2026Sources={
 inss:'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal/',
 ir:'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
 clt:'https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-5452-1-maio-1943-415500-normaatualizada-pe.html',
 thirteenth:'https://www.gov.br/esocial/pt-br/empregador-domestico/perguntas-frequentes/perguntas-frequentes/'
};
const toCents=(value:number)=>Math.round(value);
const moneyPart=(total:number,days:number,denominator:number)=>toCents(total*days/denominator);
const INSS_BRACKETS:[number,number][]=[
 [162100,.075],[290284,.09],[435427,.12],[847555,.14]
];
const IRRF_BRACKETS:[number,number,number][]=[
 [242880,0,0],[282665,.075,18216],[375105,.15,39416],
 [466468,.225,67549],[Number.POSITIVE_INFINITY,.275,90873]
];
export function inss2026(grossCents:number):number{
 if(!Number.isFinite(grossCents)||grossCents<=0)return 0;
 let left=Math.min(grossCents,847555),previous=0,total=0;
 for(const [end,rate] of INSS_BRACKETS){
  const taxable=Math.max(0,Math.min(left,end)-previous);
  total+=taxable*rate;
  previous=end;
  if(left<=end)break;
 }
 return toCents(total);
}
export function irrf2026(grossCents:number,inssCents:number,dependents:number):number{
 if(!Number.isFinite(grossCents)||grossCents<=0)return 0;
 const legalDeductions=Math.max(0,inssCents)+Math.max(0,Math.min(30,dependents))*18959;
 const base=Math.max(0,grossCents-Math.max(60720,legalDeductions));
 const bracket=IRRF_BRACKETS.find(([end])=>base<=end)!;
 let tax=Math.max(0,toCents(base*bracket[1]-bracket[2]));
 // Lei 15.270/2025: redutor calculado sobre rendimento tributável (não a base).
 let reduction=0;
 if(grossCents<=500000)reduction=Math.min(31289,tax);
 else if(grossCents<=735000)reduction=Math.max(0,toCents(97862-.133145*grossCents));
 return Math.max(0,tax-Math.min(tax,reduction));
}
export function payrollDeduction2026(grossCents:number,dependents:number,otherCents:number):Deduction{
 const inssCents=inss2026(grossCents);
 const irrfCents=irrf2026(grossCents,inssCents,dependents);
 return {grossCents,inssCents,irrfCents,extraCents:otherCents,
  netCents:grossCents-inssCents-irrfCents-otherCents};
}
function isoDate(date:Date){return date.toISOString().slice(0,10)}
function dateAtUTC(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Informe a data de início das férias');
 const date=new Date(value+'T12:00:00.000Z');
 if(Number.isNaN(date.valueOf())||isoDate(date)!==value)throw Error('Data de férias inválida');
 return date;
}
function addDays(day:Date,n:number){return new Date(day.getTime()+n*86400000)}
function countDaysBetween(start:Date,end:Date){return Math.max(0,Math.round((end.getTime()-start.getTime())/86400000))}
function monthlyOverlap(start:Date,leaveDays:number,competence:string){
 if(!/^2026-(0[1-9]|1[0-2])$/.test(competence))throw Error('A competência deve ser de 2026');
 const [year,month]=competence.split('-').map(Number);
 const begin=new Date(Date.UTC(year,month-1,1,12));
 const end=new Date(Date.UTC(year,month,1,12));
 const leaveEnd=addDays(start,leaveDays);
 const intersectionStart=new Date(Math.max(start.getTime(),begin.getTime()));
 const intersectionEnd=new Date(Math.min(leaveEnd.getTime(),end.getTime()));
 const daysInMonth=countDaysBetween(begin,end);
 const absent=Math.min(daysInMonth,countDaysBetween(intersectionStart,intersectionEnd));
 return {workDays:daysInMonth-absent,daysInMonth};
}
export const defaultPayrollInput:PayrollInput={
 baseSalaryCents:0,hazardMode:'percent30',hazardFixedCents:0,
 habitualExtrasCents:0,salaryDiscountCents:0,vacationDiscountCents:0,
 thirteenthDiscountCents:0,dependents:0,thirteenthMonths:12,
 firstThirteenthPaidCents:0,vacationStart:'2026-11-16',
 saleDays:0,salaryCompetence:'2026-11'
};
export function calculatePayroll2026(input:PayrollInput):PayrollEstimate{
 if(!Number.isSafeInteger(input.baseSalaryCents)||input.baseSalaryCents<=0||
    input.baseSalaryCents>100000000)throw Error('Informe um salário-base positivo');
 for(const [name,n] of Object.entries({
  periculosidade:input.hazardFixedCents,adicionais:input.habitualExtrasCents,
  descontos:input.salaryDiscountCents,descontosFerias:input.vacationDiscountCents,
  descontosDecimo:input.thirteenthDiscountCents,primeiraParcela:input.firstThirteenthPaidCents
 })){
  if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error('Valor inválido em '+name);
 }
 if(![0,10,30].includes(input.saleDays))throw Error('Opção de venda de férias inválida');
 if(!Number.isInteger(input.dependents)||input.dependents<0||input.dependents>30)throw Error('Dependentes inválidos');
 if(!Number.isInteger(input.thirteenthMonths)||input.thirteenthMonths<1||input.thirteenthMonths>12)throw Error('Avos do 13º inválidos');
 const start=dateAtUTC(input.vacationStart);
 if(start.getUTCFullYear()!==2026)throw Error('As tabelas tributárias deste simulador são válidas somente em 2026');
 const hazard=input.hazardMode==='percent30'?toCents(input.baseSalaryCents*.30):input.hazardFixedCents;
 const remuneration=input.baseSalaryCents+hazard+input.habitualExtrasCents;
 const hypothetical=input.saleDays===30;
 const leaveDays=hypothetical?0:30-input.saleDays;
 const leaveGross=moneyPart(remuneration,leaveDays,30);
 const leaveThird=toCents(leaveGross/3);
 const abono=hypothetical?0:moneyPart(remuneration,input.saleDays,30);
 const abonoThird=toCents(abono/3);
 const vacationTaxable=leaveGross+leaveThird;
 const vacationSocial=inss2026(vacationTaxable);
 const vacationIr=irrf2026(vacationTaxable,vacationSocial,input.dependents);
 const vacationGross=vacationTaxable+abono+abonoThird;
 const vacationNet=vacationGross-vacationSocial-vacationIr-input.vacationDiscountCents;
 const competence=monthlyOverlap(start,leaveDays,input.salaryCompetence);
 const salaryGross=moneyPart(remuneration,competence.workDays,competence.daysInMonth);
 const salaryTax=payrollDeduction2026(salaryGross,input.dependents,input.salaryDiscountCents);
 const [year,month]=input.salaryCompetence.split('-').map(Number);
 const payDate=isoDate(new Date(Date.UTC(year,month,5,12)));
 const thirteenthGross=moneyPart(remuneration,input.thirteenthMonths,12);
 const firstGross=toCents(thirteenthGross/2);
 const firstAlreadyPaid=input.firstThirteenthPaidCents;
 const firstPayable=firstAlreadyPaid>0?0:firstGross;
 const inss13=inss2026(thirteenthGross);
 const irrf13=irrf2026(thirteenthGross,inss13,input.dependents);
 const secondNet=thirteenthGross-(firstAlreadyPaid>0?firstAlreadyPaid:firstGross)-inss13-irrf13-input.thirteenthDiscountCents;
 const warnings:string[]=[
  'Estimativa simplificada da folha CLT 2026. Férias, periculosidade, médias, dependentes, IRRF e INSS podem sofrer ajustes na folha real.',
  'O salário pago em '+payDate.split('-').reverse().join('/')+' corresponde aos dias trabalhados na competência '+input.salaryCompetence+', sem pagar novamente os dias já adiantados como férias.',
  'INSS das férias é aproximado no recibo. A folha pode redistribuir a retenção entre meses e compensar adiantamentos.',
  'A previsão do 13º usa a mesma remuneração atual e '+input.thirteenthMonths+'/12 avos. Médias variáveis e reajustes podem alterar as duas parcelas.'
 ];
 if(hypothetical)warnings.unshift(
  'Cenário de venda integral de 30 dias NÃO permitido pela CLT. Não há cálculo líquido ou tratamento fiscal legalmente definido para essa hipótese. O valor exibido é apenas uma comparação matemática bruta.'
 );
 const hypotheticalGross=hypothetical?toCents(remuneration*4/3):null;
 return {
  remunerationCents:remuneration,hazardCents:hazard,
  vacation:{
   leaveDays,soldDays:input.saleDays,
   endDate:leaveDays?isoDate(addDays(start,leaveDays-1)):'—',
   payDate:isoDate(addDays(start,-2)),
   leaveGrossCents:leaveGross,oneThirdLeaveCents:leaveThird,
   abonoCents:abono,abonoOneThirdCents:abonoThird,taxableCents:vacationTaxable,
   totalGrossCents:vacationGross,inssCents:vacationSocial,irrfCents:vacationIr,
   discountCents:input.vacationDiscountCents,
   netCents:hypothetical?0:vacationNet,
   hypothetical,hypotheticalGrossCents:hypotheticalGross
  },
  salary:{
   month:input.salaryCompetence,payDate,workDays:competence.workDays,daysInMonth:competence.daysInMonth,
   grossCents:salaryGross,inssCents:salaryTax.inssCents,
   irrfCents:salaryTax.irrfCents,discountCents:input.salaryDiscountCents,
   netCents:salaryTax.netCents
  },
  thirteenth:{
   annualGrossCents:thirteenthGross,firstGrossCents:firstGross,
   firstPayableCents:firstPayable,firstAlreadyPaidCents:firstAlreadyPaid,
   inssCents:inss13,irrfCents:irrf13,secondDiscountCents:input.thirteenthDiscountCents,
   secondNetCents:secondNet,payDateFirst:'2026-11-30',payDateSecond:'2026-12-20'
  },
  totalFutureNetCents:hypothetical?0:vacationNet+salaryTax.netCents+firstPayable+secondNet,
  warnings
 };
}
