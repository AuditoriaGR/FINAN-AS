import {describe,expect,it} from 'vitest';
import {blankPayroll,calculatePayroll} from '../src/payroll';
import {planSalaryRecovery,combineSalaryReserves} from '../src/salaryReserve';

const input={
 ...blankPayroll,
 baseSalaryCents:500000,hazardCents:150000,
 vacationStart:'2026-11-10',entitlementDays:30,
 monthlyDeductionsCents:0
};
describe('reserva para recompor salário após férias',()=>{
 it('exibe três salários: dezembro, janeiro e fevereiro, e recompõe no terceiro',()=>{
  const plan=planSalaryRecovery(input,'normal','2026-11',434000);
  expect(plan.rows.map(x=>x.payDate)).toEqual(['2026-12-05','2027-01-05','2027-02-05']);
  expect(plan.rows.map(x=>x.competenceMonth)).toEqual(['2026-11','2026-12','2027-01']);
  expect(plan.rows.map(x=>x.daysOnLeave)).toEqual([21,9,0]);
  expect(plan.rows.map(x=>x.daysWorked)).toEqual([9,21,30]);
  expect(plan.rows[0].expectedNetCents).toBe(calculatePayroll(input,'normal').salary.netCents);
  expect(plan.rows[2].expectedNetCents).toBeGreaterThan(plan.rows[0].expectedNetCents);
  expect(plan.rows[1].uses2026TaxEstimateFor2027).toBe(true);
  expect(plan.rows[2].uses2026TaxEstimateFor2027).toBe(true);
 });
 it('média R$ 4.340 e salário previsto R$ 3.500 exigem R$ 840 guardados antes',()=>{
  const baseline=planSalaryRecovery(input,'normal','2026-11',434000);
  const projected3500=350000;
  const supplement=Math.max(0,baseline.rows[0].ordinaryNetCents-projected3500);
  expect(supplement).toBe(84000);
  expect(baseline.rows[0].reserveMonth).toBe('2026-11');
  expect(baseline.rows[0].payMonth).toBe('2026-12');
 });
 it('cada mês calcula somente a diferença positiva e mantém acumulado de reservas necessárias',()=>{
  const plan=planSalaryRecovery(input,'normal','2026-11',434000);
  let subtotal=0;
  for(const row of plan.rows){
   expect(row.reserveNeededCents).toBe(Math.max(0,434000-row.expectedNetCents));
   expect(row.salaryExcessCents).toBe(Math.max(0,row.expectedNetCents-434000));
   subtotal+=row.reserveNeededCents;
   expect(row.runningReserveNeededCents).toBe(subtotal);
  }
  expect(plan.totalReserveCents).toBe(subtotal);
 });
 it('média não informada não cria reserva falsa',()=>{
  const plan=planSalaryRecovery(input,'normal','2026-11',0);
  expect(plan.hasOrdinaryNet).toBe(false);
  expect(plan.totalReserveCents).toBe(0);
  expect(plan.rows.every(row=>row.reserveNeededCents===0)).toBe(true);
 });
 it('venda legal de 10 dias reduz o tempo sem salário',()=>{
  const normal=planSalaryRecovery(input,'normal','2026-11',434000);
  const sell=planSalaryRecovery(input,'sell10','2026-11',434000);
  expect(sell.rows[0].daysOnLeave).toBeLessThan(normal.rows[0].daysOnLeave);
  expect(sell.rows[0].expectedNetCents).toBeGreaterThan(normal.rows[0].expectedNetCents);
 });
 it('dois integrantes somam necessidades da reserva, sem duplicar',()=>{
  const one=planSalaryRecovery(input,'normal','2026-11',434000);
  const another=planSalaryRecovery({...input,baseSalaryCents:300000,hazardCents:0},'normal','2026-11',250000);
  const couple=combineSalaryReserves([one,another]);
  expect(couple).toHaveLength(3);
  for(let i=0;i<3;i++){
   expect(couple[i].reserveNeededCents).toBe(one.rows[i].reserveNeededCents+another.rows[i].reserveNeededCents);
   expect(couple[i].ordinaryNetCents).toBe(684000);
  }
  expect(couple[2].runningReserveNeededCents).toBe(one.totalReserveCents+another.totalReserveCents);
 });
 it('não inclui pessoa cuja meta líquida não foi definida no combinado',()=>{
  const set=planSalaryRecovery(input,'normal','2026-11',434000);
  const unset=planSalaryRecovery(input,'normal','2026-11',0);
  expect(combineSalaryReserves([set,unset]).map(x=>x.reserveNeededCents))
   .toEqual(set.rows.map(x=>x.reserveNeededCents));
 });
 it('simulação de 100% não transforma o valor bruto hipotético em reserva ou receita',()=>{
  const plan=planSalaryRecovery(input,'hypothetical30','2026-11',434000);
  expect(plan.rows[0].daysOnLeave).toBe(0);
  expect(plan.rows[0].expectedNetCents).toBe(plan.rows[1].expectedNetCents);
  expect(plan.rows[0].reserveNeededCents).toBe(Math.max(0,434000-plan.rows[0].expectedNetCents));
 });
});
