import {describe,it,expect} from 'vitest';
import {blankPayroll,calculatePayroll,inss2026,irrf2026,shiftDate,overlappingLeaveDays,taxes2026} from '../src/payroll';

const normal={...blankPayroll,baseSalaryCents:500000,hazardCents:150000,
 vacationStart:'2026-11-10',entitlementDays:30,thirteenMonths:12};

describe('calculadora CLT Brasil 2026',()=>{
 it('INSS progressivo 2026 aplica 7,5% / 9% / 12% / 14% com teto',()=>{
  expect(inss2026(0)).toBe(0);
  expect(inss2026(162100)).toBe(12158);
  expect(inss2026(500000)).toBe(50151);
  expect(inss2026(2000000)).toBe(inss2026(847555));
 });
 it('IRRF 2026 zera até 5000 e aplica redutor parcial ao 13º',()=>{
  expect(irrf2026(500000,inss2026(500000))).toBe(0);
  expect(irrf2026(600000,inss2026(600000))).toBeGreaterThan(0);
  expect(irrf2026(800000,inss2026(800000))).toBeGreaterThan(irrf2026(600000,inss2026(600000)));
 });
 it('feriados e férias não deslocam a aritmética de datas',()=>{
  expect(shiftDate('2026-11-10',-2)).toBe('2026-11-08');
  expect(overlappingLeaveDays('2026-11-10',30,'2026-11')).toBe(21);
  expect(overlappingLeaveDays('2026-11-10',20,'2026-11')).toBe(20);
  expect(overlappingLeaveDays('2026-11-25',20,'2026-11')).toBe(6);
  expect(overlappingLeaveDays('2026-12-15',20,'2026-11')).toBe(0);
 });
 it('13º é calculado integral e desconta tributos apenas da segunda parcela',()=>{
  const x=calculatePayroll(normal,'normal');
  expect(x.thirteen.annualGrossCents).toBe(650000);
  expect(x.thirteen.firstCents).toBe(325000);
  expect(x.thirteen.secondNetCents).toBe(
   650000-325000-x.thirteen.inssCents-x.thirteen.irrfCents);
  expect(x.thirteen.inssCents).toBe(inss2026(650000));
  expect(x.thirteen.irrfCents).toBe(irrf2026(650000,inss2026(650000)));
 });
 it('dias fora do mês reduzem salário a receber em 5 dezembro, sem zerar 13º',()=>{
  const x=calculatePayroll(normal,'normal');
  expect(x.salary.vacationDaysInMonth).toBe(21);
  expect(x.salary.workedDays).toBe(9);
  expect(x.salary.grossCents).toBe(195000);
  expect(x.salary.payDate).toBe('2026-12-05');
  expect(x.vacation.payDate).toBe('2026-11-08');
 });
 it('venda legal de 10 dias reduz gozo, calcula abono separado e aumenta dias trabalhados',()=>{
  const normalResult=calculatePayroll(normal,'normal');
  const sell=calculatePayroll(normal,'sell10');
  expect(sell.legal).toBe(true);
  expect(sell.vacation.daysSold).toBe(10);
  expect(sell.vacation.daysOff).toBe(20);
  expect(sell.vacation.abonoCents).toBe(Math.round(650000/3));
  expect(sell.vacation.abonoThirdCents).toBe(Math.round(sell.vacation.abonoCents/3));
  expect(sell.vacation.inssCents).toBeLessThan(normalResult.vacation.inssCents);
  expect(sell.salary.workedDays).toBe(10);
  expect(sell.salary.grossCents).toBe(Math.round(650000*10/30));
  expect(Math.abs(sell.vacation.grossCents-normalResult.vacation.grossCents)).toBeLessThanOrEqual(1);
 });
 it('se o 13º foi adiantado, primeira parcela não é prevista novamente',()=>{
  const x=calculatePayroll({...normal,thirteenAlreadyPaidCents:325000},'normal');
  expect(x.thirteen.firstCents).toBe(0);
  expect(x.thirteen.secondNetCents).toBe(
   x.thirteen.annualGrossCents-325000-x.thirteen.inssCents-x.thirteen.irrfCents);
  expect(x.payments.some(p=>p.kind==='thirteen_first')).toBe(false);
 });
 it('primeiro 13º pode coincidir com pagamento de férias, sem duplicar valor total',()=>{
  const x=calculatePayroll({...normal,thirteenOnVacation:true},'normal');
  const first=x.payments.find(p=>p.kind==='thirteen_first')!;
  expect(first.date).toBe(x.vacation.payDate);
  expect(x.totalNetCents).toBe(x.payments.reduce((sum,p)=>sum+p.netCents,0));
 });
 it('13º proporcional de 6 meses e dias de férias reduzidos',()=>{
  const x=calculatePayroll({...normal,thirteenMonths:6,entitlementDays:24},'sell10');
  expect(x.thirteen.annualGrossCents).toBe(325000);
  expect(x.thirteen.firstCents).toBe(162500);
  expect(x.vacation.daysSold).toBe(8);
  expect(x.vacation.daysOff).toBe(16);
 });
 it('descontos manuais são separados por salário, férias e segunda parcela',()=>{
  const x=calculatePayroll({...normal,monthlyDeductionsCents:10000,
   vacationDeductionsCents:5000,thirteenDeductionsCents:2500},'normal');
  const basic=calculatePayroll(normal,'normal');
  expect(x.salary.netCents).toBe(basic.salary.netCents-10000);
  expect(x.vacation.netCents).toBe((basic.vacation.netCents??0)-5000);
  expect(x.thirteen.secondNetCents).toBe(basic.thirteen.secondNetCents-2500);
 });
 it('simulação sem amparo legal 30 dias não inventa líquido da venda integral',()=>{
  const x=calculatePayroll(normal,'hypothetical30');
  expect(x.legal).toBe(false);
  expect(x.vacation.daysOff).toBe(0);
  expect(x.vacation.netCents).toBeNull();
  expect(x.vacation.hypotheticalExtraGrossCents).toBe(Math.round(650000*4/3));
  expect(x.salary.workedDays).toBe(30);
  expect(x.totalNetCents).toBeNull();
  expect(x.warnings.join(' ')).toMatch(/não é abono legal/);
 });
 it('não inventa data de férias nem pagamento quando ainda não foi informado',()=>{
  const x=calculatePayroll({...normal,vacationStart:''},'normal');
  expect(x.vacation.payDate).toBeNull();
  expect(x.warnings[0]).toMatch(/Informe a data/);
  expect(x.payments.some(p=>p.kind==='vacation')).toBe(false);
 });
 it('imposto total corresponde ao bruto menos INSS/IR estimados',()=>{
  const x=taxes2026(500000);
  expect(x.netCents).toBe(x.grossCents-x.inssCents-x.irrfCents);
 });
});
