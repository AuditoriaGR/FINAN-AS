import {
 calculatePayroll,overlappingLeaveDays,taxes2026,
 type PayrollInputs,type VacationVariant
} from './payroll';

/** Compares the next three monthly paychecks with the ordinary net salary.
 * The complement is a TRANSFER from money already available, never a new income.
 * In paychecks of 2027 the 2026 tax brackets are indicative only.
 */
export type SalaryRecoveryRow={
 competenceMonth:string;payMonth:string;payDate:string;
 daysWorked:number;daysOnLeave:number;
 expectedGrossCents:number;expectedNetCents:number;
 ordinaryNetCents:number;
 reserveMonth:string;reserveNeededCents:number;
 salaryExcessCents:number;
 runningReserveNeededCents:number;
 uses2026TaxEstimateFor2027:boolean;
};
export type SalaryRecoveryPlan={
 rows:SalaryRecoveryRow[];
 totalReserveCents:number;
 firstReserveMonth:string;
 hasOrdinaryNet:boolean;
};
function addMonths(month:string,delta:number):string{
 const [year,m]=month.split('-').map(Number);
 const date=new Date(Date.UTC(year,m-1+delta,1));
 return date.toISOString().slice(0,7);
}
function daysOf(month:string):number{
 const [year,m]=month.split('-').map(Number);
 return new Date(Date.UTC(year,m,0)).getUTCDate();
}
export function planSalaryRecovery(
 input:PayrollInputs,variant:VacationVariant,referenceMonth:string,ordinaryNetCents:number,
 monthsToShow=3
):SalaryRecoveryPlan{
 if(!/^2026-(0[1-9]|1[0-2])$/.test(referenceMonth))
  throw new Error('O primeiro mês de referência precisa ser de 2026');
 const leave=calculatePayroll(input,variant,referenceMonth);
 const count=Math.max(1,Math.min(6,Math.floor(monthsToShow)));
 const habitual=Math.max(0,Math.round(ordinaryNetCents||0));
 const gross=leave.monthlyGrossCents;
 const result:SalaryRecoveryRow[]=[];
 let running=0;
 for(let index=0;index<count;index++){
  const competenceMonth=addMonths(referenceMonth,index);
  const payMonth=addMonths(competenceMonth,1);
  const daysInMonth=daysOf(competenceMonth);
  const daysOff=overlappingLeaveDays(input.vacationStart,leave.vacation.daysOff,competenceMonth);
  const daysWorked=Math.max(0,Math.min(30,Math.round(30*(daysInMonth-daysOff)/daysInMonth)));
  const expectedGrossCents=Math.round(gross*daysWorked/30);
  const estimated=taxes2026(expectedGrossCents,input.dependents);
  const expectedNetCents=Math.max(0,estimated.netCents-input.monthlyDeductionsCents);
  const reserveNeededCents=habitual>0?Math.max(0,habitual-expectedNetCents):0;
  const salaryExcessCents=habitual>0?Math.max(0,expectedNetCents-habitual):0;
  running+=reserveNeededCents;
  result.push({
   competenceMonth,payMonth,payDate:payMonth+'-05',
   daysWorked,daysOnLeave:daysOff,expectedGrossCents,expectedNetCents,
   ordinaryNetCents:habitual,reserveMonth:competenceMonth,
   reserveNeededCents,salaryExcessCents,runningReserveNeededCents:running,
   uses2026TaxEstimateFor2027:payMonth.slice(0,4)!=='2026'
  });
 }
 return {
  rows:result,totalReserveCents:running,
  firstReserveMonth:referenceMonth,hasOrdinaryNet:habitual>0
 };
}

/** Household rows by pay date: Rui and Tainá are additive, never duplicated. */
export function combineSalaryReserves(plans:SalaryRecoveryPlan[]):SalaryRecoveryRow[]{
 const sums=new Map<string,SalaryRecoveryRow>();
 for(const plan of plans){
  if(!plan.hasOrdinaryNet)continue;
  for(const row of plan.rows){
   const old=sums.get(row.payMonth);
   if(!old)sums.set(row.payMonth,{...row});
   else {
    old.expectedGrossCents+=row.expectedGrossCents;
    old.expectedNetCents+=row.expectedNetCents;
    old.ordinaryNetCents+=row.ordinaryNetCents;
    old.reserveNeededCents+=row.reserveNeededCents;
    old.salaryExcessCents+=row.salaryExcessCents;
    old.daysOnLeave+=row.daysOnLeave;
    old.uses2026TaxEstimateFor2027=old.uses2026TaxEstimateFor2027||row.uses2026TaxEstimateFor2027;
   }
  }
 }
 const rows=[...sums.values()].sort((a,b)=>a.payMonth.localeCompare(b.payMonth));
 let running=0;
 return rows.map(row=>{
  running+=row.reserveNeededCents;
  return {...row,runningReserveNeededCents:running};
 });
}
