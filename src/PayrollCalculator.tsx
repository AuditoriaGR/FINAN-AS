import './payroll.css';
import {useEffect,useMemo,useState} from 'react';
import {Calculator,CalendarDays,CheckCircle2,Copy,Info,PiggyBank,Save,ShieldAlert,Wallet} from 'lucide-react';
import {db} from './supabase';
import {cents,money} from './finance';
import {calculatePayroll2026,payroll2026Sources,type PayrollInput,type SaleScenario} from './payroll2026';

type Person='rui'|'taina';
type MoneyField='baseSalary'|'hazardFixed'|'habitualExtras'|'salaryDiscount'|'vacationDiscount'|'thirteenthDiscount'|'firstPaid';
type Form={
 baseSalary:string;hazardMode:'percent30'|'fixed';hazardFixed:string;habitualExtras:string;
 salaryDiscount:string;vacationDiscount:string;thirteenthDiscount:string;
 dependents:string;thirteenthMonths:string;firstPaid:string;vacationStart:string;
 saleDays:SaleScenario;salaryCompetence:string
};
type SavedRow={
 id:string;household_id:string;owner_id:string;person_key:Person;display_name:string;
 base_salary_cents:number;hazard_mode:'percent30'|'fixed';hazard_cents:number;
 extras_cents:number;monthly_deductions_cents:number;vacation_deductions_cents:number;
 thirteen_deductions_cents:number;dependents:number;vacation_start:string|null;
 thirteen_months:number;thirteen_paid_cents:number;sale_days:SaleScenario;
 salary_competence:string
};
type Props={householdId:string|null;userId:string;demo?:boolean};
const label=(person:Person)=>person==='rui'?'Rui':'Tainá';
const initialForm=():Form=>({
 baseSalary:'',hazardMode:'percent30',hazardFixed:'',habitualExtras:'',
 salaryDiscount:'',vacationDiscount:'',thirteenthDiscount:'',
 dependents:'0',thirteenthMonths:'12',firstPaid:'0',
 vacationStart:'2026-11-16',saleDays:0,salaryCompetence:'2026-11'
});
const printMoney=(value:number)=> (value/100).toFixed(2).replace('.',',');
function fromRow(row:SavedRow):Form{
 return {
  baseSalary:printMoney(row.base_salary_cents),hazardMode:row.hazard_mode||'fixed',
  hazardFixed:printMoney(row.hazard_cents),
  habitualExtras:printMoney(row.extras_cents),
  salaryDiscount:printMoney(row.monthly_deductions_cents),
  vacationDiscount:printMoney(row.vacation_deductions_cents),
  thirteenthDiscount:printMoney(row.thirteen_deductions_cents),
  dependents:String(row.dependents),thirteenthMonths:String(row.thirteen_months),
  firstPaid:printMoney(row.thirteen_paid_cents),
  vacationStart:row.vacation_start||'2026-11-16',
  saleDays:[0,10,30].includes(row.sale_days)?row.sale_days:0,
  salaryCompetence:row.salary_competence||'2026-11'
 };
}
function parseMoney(raw:string,name:string):number{
 const value=cents(raw.trim()||'0');
 if(!Number.isSafeInteger(value)||value<0)throw Error('Confira o valor de '+name);
 return value;
}
function toInput(f:Form):PayrollInput{
 const obj={
  baseSalaryCents:parseMoney(f.baseSalary,'salário-base'),
  hazardMode:f.hazardMode,
  hazardFixedCents:parseMoney(f.hazardFixed,'periculosidade'),
  habitualExtrasCents:parseMoney(f.habitualExtras,'adicionais'),
  salaryDiscountCents:parseMoney(f.salaryDiscount,'desconto mensal'),
  vacationDiscountCents:parseMoney(f.vacationDiscount,'desconto das férias'),
  thirteenthDiscountCents:parseMoney(f.thirteenthDiscount,'desconto do 13º'),
  firstThirteenthPaidCents:parseMoney(f.firstPaid,'primeira parcela já recebida'),
  dependents:Number(f.dependents),thirteenthMonths:Number(f.thirteenthMonths),
  vacationStart:f.vacationStart,saleDays:f.saleDays,
  salaryCompetence:f.salaryCompetence
 } satisfies PayrollInput;
 return obj;
}
const dateBR=(iso:string)=>iso==='—'?'—':iso.split('-').reverse().join('/');
function ValueRow({name,value,strong}:{name:string;value:number;strong?:boolean}){
 return <div className={`payroll-line ${strong?'strong':''}`}><span>{name}</span><b>{money(value)}</b></div>;
}
export default function PayrollCalculator({householdId,userId,demo=false}:Props){
 const [selected,setSelected]=useState<Person>('rui');
 const [forms,setForms]=useState<Record<Person,Form>>({rui:initialForm(),taina:initialForm()});
 const [saved,setSaved]=useState<Partial<Record<Person,SavedRow>>>({});
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [status,setStatus]=useState('');
 const current=forms[selected];

 useEffect(()=>{
  if(!db||!householdId)return;
  let active=true;
  setLoading(true);
  db.from('payroll_profiles').select('*').eq('household_id',householdId)
   .then(({data,error})=>{
    if(!active)return;
    if(error){setStatus('Falha ao carregar perfis: '+error.message);return;}
    const records=(data||[]) as SavedRow[];
    const next:Partial<Record<Person,SavedRow>>={};
    const loaded:Partial<Record<Person,Form>>={};
    for(const p of records){
     if(p.person_key!=='rui'&&p.person_key!=='taina')continue;
     next[p.person_key]=p;loaded[p.person_key]=fromRow(p);
    }
    setSaved(next);
    setForms(old=>({...old,...loaded}));
   }).then(()=>{
    if(active)setLoading(false);
   });
  return()=>{active=false};
 },[householdId]);

 function update<K extends keyof Form>(name:K,value:Form[K]){
  setForms(old=>({...old,[selected]:{...old[selected],[name]:value}}));
  setStatus('');
 }
 const simulation=useMemo(()=>{
  try{
   const input=toInput(current);
   if(input.baseSalaryCents===0)return {result:null,error:''};
   return {result:calculatePayroll2026(input),error:''};
  }catch(e){return {result:null,error:e instanceof Error?e.message:'Valores inválidos'};}
 },[current]);
 const computed=simulation.result;
 const bothTotals=useMemo(()=>{
  let total=0,persons=0;
  for(const key of ['rui','taina'] as const){
   try{const p=toInput(forms[key]);if(p.baseSalaryCents>0&&p.saleDays!==30){
    total+=calculatePayroll2026(p).totalFutureNetCents;persons++;
   }}catch{ /* Ignorar campos ainda não válidos. */ }
  }
  return {total,persons};
 },[forms]);
 const onSave=async()=>{
  if(!db||!householdId){setStatus('Modo demonstração: faça login para salvar estes dados para o casal.');return;}
  let input:PayrollInput;
  try{input=toInput(current);calculatePayroll2026(input)}catch(e){
   setStatus(e instanceof Error?e.message:'Preencha os campos obrigatórios');return;
  }
  setSaving(true);setStatus('');
  const previous=saved[selected];
  const hazardCents=input.hazardMode==='percent30'?Math.round(input.baseSalaryCents*.30):input.hazardFixedCents;
  const payload={
   household_id:householdId,owner_id:previous?.owner_id||userId,
   person_key:selected,display_name:label(selected),
   base_salary_cents:input.baseSalaryCents,hazard_mode:input.hazardMode,
   hazard_cents:hazardCents,extras_cents:input.habitualExtrasCents,
   monthly_deductions_cents:input.salaryDiscountCents,
   vacation_deductions_cents:input.vacationDiscountCents,
   thirteen_deductions_cents:input.thirteenthDiscountCents,
   dependents:input.dependents,vacation_start:input.vacationStart,
   thirteen_months:input.thirteenthMonths,
   thirteen_paid_cents:input.firstThirteenthPaidCents,
   sale_days:input.saleDays,salary_competence:input.salaryCompetence,
   updated_at:new Date().toISOString()
  };
  try{
   const {data,error}=await db.from('payroll_profiles').upsert(payload,{
    onConflict:'household_id,person_key'
   }).select('*').single();
   if(error)throw Error(error.message);
   setSaved(old=>({...old,[selected]:data as SavedRow}));
   setStatus('Parâmetros de '+label(selected)+' salvos para o casal. Nenhuma receita foi lançada.');
  }catch(e){setStatus('Não foi possível salvar: '+(e instanceof Error?e.message:'erro desconhecido'))}
  finally{setSaving(false)}
 };
 const copy=async()=>{
  if(!computed)return;
  const lines=[
   'Simulação trabalhista 2026 — '+label(selected),
   'Remuneração mensal: '+money(computed.remunerationCents),
   'Início das férias: '+dateBR(current.vacationStart),
   computed.vacation.hypothetical?'Venda de 100%: hipótese não permitida pela CLT':'Férias (líquido estimado): '+money(computed.vacation.netCents),
   'Pagamento férias até: '+dateBR(computed.vacation.payDate),
   'Salário de '+dateBR(computed.salary.payDate)+': '+money(computed.salary.netCents),
   '13º primeira parcela a receber: '+money(computed.thirteenth.firstPayableCents),
   '13º segunda parcela (líquido estimado): '+money(computed.thirteenth.secondNetCents),
   !computed.vacation.hypothetical?'Total de recebimentos futuros simulados: '+money(computed.totalFutureNetCents):
    'Cenário ilegal: somente comparação bruta, sem líquido válido. '+money(computed.vacation.hypotheticalGrossCents||0),
   'Estimativa informativa, não substitui o holerite. Nenhum lançamento foi criado.'
  ];
  try{await navigator.clipboard.writeText(lines.join('\n'));setStatus('Resumo copiado para compartilhar.');}
  catch{setStatus('O navegador bloqueou a cópia; use a tela para consultar os valores.');}
 };
 const amountField=(key:MoneyField,title:string,help?:string)=>(
  <label className="field payroll-input" key={key}>
   <span>{title}</span>
   <input type="text" inputMode="decimal" value={current[key]}
    onChange={e=>update(key,e.target.value)}
    placeholder="0,00" autoComplete="off"/>
   {help&&<small>{help}</small>}
  </label>
 );
 const saleOptions:[SaleScenario,string][]=[
  [0,'30 dias de descanso (sem venda)'],
  [10,'20 dias de descanso + venda legal de 10 dias'],
  [30,'Hipótese: vender 30 dias (não permitido)']
 ];
 return <div className="payroll-calculator">
  <section className="panel payroll-intro">
   <div className="panel-head"><div><span className="eyebrow">SIMULADOR TRABALHISTA • TABELAS 2026</span>
     <h2>Férias, 13º salário e salário após as férias</h2>
     <p>Veja valores estimados para cada pessoa e quanto poderá entrar no caixa da casa, sem duplicar lançamentos no financeiro.</p>
    </div><span className="icon-badge blue"><Calculator size={21}/></span></div>
   <div className="payroll-person-picker" role="group" aria-label="Pessoa">
    {(['rui','taina'] as const).map(p=>
     <button key={p} className={p===selected?'selected':''} onClick={()=>{setSelected(p);setStatus('')}}>
      {label(p)}{saved[p]&&<CheckCircle2 size={14}/>}
     </button>)}
   </div>
   <p className="small-hint">Os valores são compartilhados com o casal, mas usados apenas nesta simulação. Férias, salários e 13º não são cadastrados automaticamente como receitas.</p>
  </section>

  <div className="payroll-layout">
   <section className="panel payroll-form">
    <div className="panel-head"><div><h2>Dados de {label(selected)}</h2>
      <p>{loading?'Carregando dados salvos…':'Informe os valores que constam no holerite.'}</p></div>
    </div>
    <div className="payroll-fields">
     {amountField('baseSalary','Salário-base (R$)')}
     <label className="field"><span>Adicional de periculosidade</span>
      <select value={current.hazardMode} onChange={e=>update('hazardMode',e.target.value as Form['hazardMode'])}>
       <option value="percent30">Calcular 30% sobre o salário-base</option>
       <option value="fixed">Informar o valor exato</option>
      </select>
     </label>
     {current.hazardMode==='fixed'&&amountField('hazardFixed','Periculosidade mensal (R$)')}
     {amountField('habitualExtras','Outros adicionais habituais / média mensal (R$)',
      'Horas extras e variáveis apenas se sua folha incorporar essa média.')}
     {amountField('salaryDiscount','Outros descontos mensais (R$)',
      'Plano de saúde, vale-transporte, empréstimos etc. Não incluir INSS/IRRF aqui.')}
     {amountField('vacationDiscount','Outros descontos nas férias (R$)')}
     {amountField('thirteenthDiscount','Outros descontos na 2ª parcela do 13º (R$)')}
     <label className="field"><span>Dependentes para IRRF</span>
      <input type="number" min="0" max="30" value={current.dependents}
       onChange={e=>update('dependents',e.target.value)}/>
     </label>
     <label className="field"><span>Avos do 13º em 2026</span>
      <select value={current.thirteenthMonths} onChange={e=>update('thirteenthMonths',e.target.value)}>
       {Array.from({length:12},(_,i)=>i+1).map(i=><option key={i} value={i}>{i}/12</option>)}
      </select>
     </label>
     {amountField('firstPaid','1ª parcela do 13º já recebida (R$)',
      'Deixe zero se ainda não recebeu. Se recebeu, informe o valor do adiantamento.')}
     <label className="field"><span>Início das férias</span>
      <input type="date" min="2026-01-01" max="2026-12-31" value={current.vacationStart}
       onChange={e=>update('vacationStart',e.target.value)}/>
     </label>
     <label className="field"><span>Competência do salário a receber</span>
      <input type="month" min="2026-01" max="2026-12" value={current.salaryCompetence}
       onChange={e=>update('salaryCompetence',e.target.value)}/>
     </label>
     <label className="field payroll-wide"><span>Cenário de férias</span>
      <select value={current.saleDays} onChange={e=>update('saleDays',Number(e.target.value) as SaleScenario)}>
       {saleOptions.map(([value,name])=><option value={value} key={value}>{name}</option>)}
      </select>
     </label>
    </div>
    <div className="payroll-form-actions">
     <button className="primary" disabled={saving||loading||demo||!householdId} onClick={()=>void onSave()}>
      <Save size={17}/> {saving?'Salvando…':'Salvar dados do casal'}
     </button>
     <button className="secondary" disabled={!computed} onClick={()=>void copy()}><Copy size={16}/> Copiar estimativa</button>
    </div>
    {status&&<p className="payroll-message" role="status">{status}</p>}
    {simulation.error&&<p className="payroll-error" role="alert">{simulation.error}</p>}
   </section>

   <div className="payroll-results">
    {computed?<>
     <section className="panel payroll-result-highlight">
      <span className="eyebrow">REMUNERAÇÃO BRUTA DE REFERÊNCIA</span>
      <strong>{money(computed.remunerationCents)}</strong>
      <p>Salário-base + periculosidade ({money(computed.hazardCents)}) + médias habituais.</p>
      {computed.vacation.hypothetical?<p className="payroll-illegal"><ShieldAlert size={18}/>
       A venda integral de férias não é permitida pela CLT. Os valores abaixo não constituem previsão de folha ou pagamento líquido válido.</p>:
       <div className="payroll-kpi"><span>Total líquido estimado das entradas futuras listadas</span>
        <b>{money(computed.totalFutureNetCents)}</b></div>}
     </section>
     <section className="panel">
      <div className="payroll-section-title"><CalendarDays size={19}/><h3>Férias</h3>
       <span>{current.vacationStart&&dateBR(current.vacationStart)}</span></div>
      {computed.vacation.hypothetical?<>
       <div className="payroll-illegal">
        <ShieldAlert size={18}/><p>Simulação puramente matemática de venda de 30 dias. A CLT permite converter no máximo 1/3 das férias em abono. Não existe folha líquida ou tributação legal definida para a conversão integral.</p>
       </div>
       <ValueRow name="Comparação bruta hipotética (30 dias + 1/3)" value={computed.vacation.hypotheticalGrossCents||0} strong/>
       <p className="small-hint">O salário regular por dias trabalhados é estimado abaixo, mas não é correto somar esse valor como se a venda de 100% fosse um benefício trabalhista devido.</p>
      </>:<>
       <p className="payroll-subline">{computed.vacation.leaveDays} dias de descanso; {computed.vacation.soldDays} dias convertidos em abono. Último dia previsto: {dateBR(computed.vacation.endDate)}.</p>
       <ValueRow name="Remuneração pelos dias de férias" value={computed.vacation.leaveGrossCents}/>
       <ValueRow name="1/3 constitucional das férias gozadas" value={computed.vacation.oneThirdLeaveCents}/>
       {computed.vacation.soldDays>0&&<>
        <ValueRow name="Abono dos dias vendidos (estimativa)" value={computed.vacation.abonoCents}/>
        <ValueRow name="1/3 correspondente ao abono" value={computed.vacation.abonoOneThirdCents}/>
       </>}
       <ValueRow name="Total bruto das férias" value={computed.vacation.totalGrossCents}/>
       <ValueRow name="INSS estimado" value={-computed.vacation.inssCents}/>
       <ValueRow name="IRRF estimado (férias em separado)" value={-computed.vacation.irrfCents}/>
       <ValueRow name="Outros descontos informados" value={-computed.vacation.discountCents}/>
       <ValueRow name="Líquido estimado de férias" value={computed.vacation.netCents} strong/>
       <p className="small-hint">Pagamento até {dateBR(computed.vacation.payDate)} (dois dias antes do início); a folha pode fazer ajustes nos meses de gozo.</p>
      </>}
     </section>
     <section className="panel">
      <div className="payroll-section-title"><Wallet size={19}/><h3>Salário após as férias</h3>
       <span>{dateBR(computed.salary.payDate)}</span></div>
      <p className="payroll-subline">Salário da competência {computed.salary.month}: estimativa de {computed.salary.workDays} de {computed.salary.daysInMonth} dias fora do período de descanso. Os dias pagos antecipadamente como férias não são pagos de novo.</p>
      <ValueRow name="Salário proporcional bruto" value={computed.salary.grossCents}/>
      <ValueRow name="INSS estimado" value={-computed.salary.inssCents}/>
      <ValueRow name="IRRF estimado" value={-computed.salary.irrfCents}/>
      <ValueRow name="Outros descontos mensais" value={-computed.salary.discountCents}/>
      <ValueRow name="Salário líquido previsto" value={computed.salary.netCents} strong/>
      <p className="small-hint">Exemplo: para a competência de novembro, pagamento simulado em <strong>05/12/2026</strong>. O fechamento da folha e os dias efetivos podem gerar diferenças.</p>
     </section>
     <section className="panel">
      <div className="payroll-section-title"><PiggyBank size={19}/><h3>13º salário</h3><span>{current.thirteenthMonths}/12</span></div>
      <ValueRow name="13º bruto total estimado" value={computed.thirteenth.annualGrossCents}/>
      <ValueRow name="1ª parcela bruta (até 30/11)" value={computed.thirteenth.firstGrossCents}/>
      {computed.thirteenth.firstAlreadyPaidCents>0&&
       <ValueRow name="Adiantamento já recebido" value={-computed.thirteenth.firstAlreadyPaidCents}/>}
      <ValueRow name="1ª parcela ainda prevista para receber" value={computed.thirteenth.firstPayableCents} strong/>
      <ValueRow name="INSS do 13º (descontado na 2ª)" value={-computed.thirteenth.inssCents}/>
      <ValueRow name="IRRF do 13º (descontado na 2ª)" value={-computed.thirteenth.irrfCents}/>
      <ValueRow name="Outros descontos informados" value={-computed.thirteenth.secondDiscountCents}/>
      <ValueRow name="2ª parcela líquida estimada (até 20/12)" value={computed.thirteenth.secondNetCents} strong/>
      <p className="small-hint">O INSS e IRRF são apurados sobre o 13º total, separadamente do salário mensal. A segunda parcela já desconta o adiantamento.</p>
     </section>
     <section className="panel payroll-warnings">
      <h3>Premissas e limites da simulação</h3>
      {computed.warnings.map((v,i)=><p key={i}><Info size={15}/>{v}</p>)}
      <p><ShieldAlert size={15}/>O simulador está calibrado para <strong>2026</strong>. Valores de 2027 precisarão das tabelas atualizadas. FGTS patronal não é desconto do empregado.</p>
      <p><Info size={15}/>Esta simulação <strong>não altera os saldos</strong> nem adiciona salários, 13º ou férias ao planejamento automaticamente, evitando contar receitas em duplicidade.</p>
     </section>
    </>:<section className="panel payroll-empty">
     <Calculator size={34}/><h3>Informe o salário-base de {label(selected)}</h3>
     <p>O cálculo detalhado de férias, salário, primeira e segunda parcelas do 13º aparecerá aqui, com INSS e IRRF de 2026.</p>
    </section>}
   </div>
  </div>
  <section className="panel payroll-couple-summary">
   <div><h3>Recebimentos estimados do casal</h3><p>Soma dos dois perfis preenchidos, apenas para comparação financeira.</p></div>
   <strong>{bothTotals.persons?money(bothTotals.total):'Preencha os dois salários'}</strong>
   <small>{bothTotals.persons}/2 perfis válidos • cenários ilegais não entram no total</small>
  </section>
  <div className="payroll-links">
   <strong>Fontes oficiais</strong>
   <a href={payroll2026Sources.inss} target="_blank" rel="noreferrer">INSS 2026</a>
   <a href={payroll2026Sources.ir} target="_blank" rel="noreferrer">IRRF 2026</a>
   <a href={payroll2026Sources.clt} target="_blank" rel="noreferrer">CLT — férias e abono</a>
   <a href={payroll2026Sources.thirteenth} target="_blank" rel="noreferrer">eSocial — 13º salário</a>
  </div>
 </div>;
}
