import {describe,it,expect} from 'vitest';
import {calculatePayroll2026,defaultPayrollInput,inss2026,irrf2026,type PayrollInput} from '../src/payroll2026';

const profile=(change:Partial<PayrollInput>={}):PayrollInput=>({
 ...defaultPayrollInput,baseSalaryCents:400000,
 hazardMode:'percent30',habitualExtrasCents:10000,
 vacationStart:'2026-11-16',saleDays:0,thirteenthMonths:12,
 salaryCompetence:'2026-11',...change
});
describe('INSS progressivo 2026',()=>{
 it('calcula 7,5% na primeira faixa e teto',()=>{
  expect(inss2026(100000)).toBe(7500);
  expect(inss2026(162100)).toBe(12158);
  expect(inss2026(847555)).toBe(inss2026(1200000));
 });
 it('usa faixas progressivas em vez de taxa única',()=>{
  const i=inss2026(400000);
  expect(i).toBeGreaterThan(30000);
  expect(i).toBeLessThan(50000);
 });
});
describe('IRRF 2026 com redutor',()=>{
 it('salário de até R$ 5.000 tem IRRF zero na hipótese padrão',()=>{
  expect(irrf2026(400000,inss2026(400000),0)).toBe(0);
  expect(irrf2026(500000,inss2026(500000),0)).toBe(0);
 });
 it('faixa de redução parcial acima de R$ 5.000',()=>{
  const tax=irrf2026(600000,inss2026(600000),0);
  expect(tax).toBeGreaterThan(0);
  expect(tax).toBeLessThan(60000);
 });
 it('desconta dependentes e usa dedução simplificada quando vantajosa',()=>{
  const without=irrf2026(800000,inss2026(800000),0);
  const withDependents=irrf2026(800000,inss2026(800000),3);
  expect(withDependents).toBeLessThanOrEqual(without);
 });
});
describe('férias e salário de dezembro',()=>{
 it('inclui periculosidade de 30% e outros habituais na remuneração',()=>{
  const r=calculatePayroll2026(profile());
  expect(r.hazardCents).toBe(120000);
  expect(r.remunerationCents).toBe(530000);
  expect(r.vacation.leaveGrossCents).toBe(530000);
  expect(r.vacation.oneThirdLeaveCents).toBe(176667);
 });
 it('férias iniciadas em 16/11: pagamento até 14/11; novembro tem 15 dias trabalhados',()=>{
  const r=calculatePayroll2026(profile());
  expect(r.vacation.payDate).toBe('2026-11-14');
  expect(r.vacation.endDate).toBe('2026-12-15');
  expect(r.salary.payDate).toBe('2026-12-05');
  expect(r.salary.workDays).toBe(15);
  expect(r.salary.grossCents).toBe(265000);
 });
 it('com venda legal de dez dias os dias de descanso caem para 20',()=>{
  const r=calculatePayroll2026(profile({saleDays:10}));
  expect(r.vacation.leaveDays).toBe(20);
  expect(r.vacation.endDate).toBe('2026-12-05');
  expect(r.vacation.abonoCents).toBe(176667);
  expect(r.vacation.abonoOneThirdCents).toBe(58889);
  expect(r.vacation.totalGrossCents).toBeGreaterThan(0);
 });
 it('venda hipotética de 30 dias não produz líquido de férias nem total lícito',()=>{
  const r=calculatePayroll2026(profile({saleDays:30}));
  expect(r.vacation.hypothetical).toBe(true);
  expect(r.vacation.leaveDays).toBe(0);
  expect(r.vacation.netCents).toBe(0);
  expect(r.totalFutureNetCents).toBe(0);
  expect(r.vacation.hypotheticalGrossCents).toBe(Math.round(530000*4/3));
  expect(r.warnings.join(' ')).toMatch(/NÃO permitido/i);
 });
 it('salário de 05/12 não duplica os dias já adiantados em férias',()=>{
  const a=calculatePayroll2026(profile({vacationStart:'2026-11-01'}));
  expect(a.salary.workDays).toBe(0);
  expect(a.salary.netCents).toBe(0);
  expect(a.vacation.payDate).toBe('2026-10-30');
  const b=calculatePayroll2026(profile({vacationStart:'2026-12-01'}));
  expect(b.salary.workDays).toBe(30);
  expect(b.salary.grossCents).toBe(530000);
 });
 it('salário proporcional considera desconto extra informado',()=>{
  const a=calculatePayroll2026(profile({salaryDiscountCents:0}));
  const b=calculatePayroll2026(profile({salaryDiscountCents:10000}));
  expect(a.salary.netCents-b.salary.netCents).toBe(10000);
 });
});
describe('13º salário 2026',()=>{
 it('primeira é metade sem imposto antecipado; segunda com INSS e IRRF',()=>{
  const r=calculatePayroll2026(profile());
  expect(r.thirteenth.annualGrossCents).toBe(530000);
  expect(r.thirteenth.firstGrossCents).toBe(265000);
  expect(r.thirteenth.firstPayableCents).toBe(265000);
  expect(r.thirteenth.inssCents).toBe(inss2026(530000));
  expect(r.thirteenth.payDateFirst).toBe('2026-11-30');
  expect(r.thirteenth.payDateSecond).toBe('2026-12-20');
  expect(r.thirteenth.secondNetCents).toBe(530000-265000-r.thirteenth.inssCents-r.thirteenth.irrfCents);
 });
 it('primeira já recebida não volta ao caixa e altera dedução na segunda',()=>{
  const r=calculatePayroll2026(profile({firstThirteenthPaidCents:240000}));
  expect(r.thirteenth.firstPayableCents).toBe(0);
  expect(r.thirteenth.secondNetCents).toBe(530000-240000-r.thirteenth.inssCents-r.thirteenth.irrfCents);
 });
 it('13º proporcional 6/12',()=>{
  const r=calculatePayroll2026(profile({thirteenthMonths:6}));
  expect(r.thirteenth.annualGrossCents).toBe(265000);
  expect(r.thirteenth.firstGrossCents).toBe(132500);
 });
});
describe('validações para não prometer cálculo fora da lei ou da tabela',()=>{
 it('rejeita salários inválidos e datas fora de 2026',()=>{
  expect(()=>calculatePayroll2026(profile({baseSalaryCents:0}))).toThrow();
  expect(()=>calculatePayroll2026(profile({vacationStart:'2027-01-01'}))).toThrow(/2026/);
  expect(()=>calculatePayroll2026(profile({vacationStart:'2026-11-31'}))).toThrow();
 });
 it('não aplica venda de mais de dez dias como abono legal',()=>{
  expect(()=>calculatePayroll2026(profile({saleDays:20 as 10}))).toThrow();
 });
});
