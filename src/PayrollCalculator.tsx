import {useEffect,useMemo,useState} from 'react';
import {Calculator,Check,Copy,Info,Save,ShieldCheck,Users,CalendarDays,AlertTriangle} from 'lucide-react';
import {cents,money,monthName} from './finance';
import {db} from './supabase';
import {
 calculatePayroll,type PayrollInputs,
 type PayrollResult,type VacationVariant
} from './payroll';

type PersonKey='rui'|'taina';
type PayrollForm={
 displayName:string;
 baseSalary:string;hazard:string;extras:string;
 monthlyDeductions:string;vacationDeductions:string;thirteenDeductions:string;
 dependents:string;vacationStart:string;entitlementDays:string;
 thirteenMonths:string;thirteenAlreadyPaid:string;thirteenOnVacation:boolean
};
type SavedRow={id:string;household_id:string;owner_id:string;person_key:PersonKey;display_name:string;
 base_salary_cents:number;hazard_cents:number;extras_cents:number;
 monthly_deductions_cents:number;vacation_deductions_cents:number;thirteen_deductions_cents:number;
 dependents:number;vacation_start:string|null;vacation_entitlement_days:number;thirteen_months:number;
 thirteen_paid_cents:number;thirteen_on_vacation:boolean};
type Props={householdId?:string|null;uid?:string|null;connected:boolean};
const DEFAULT_NAMES:Record<PersonKey,string>={rui:'Rui',taina:'Tainá'};
const moneyInput=(n:number)=>(n/100).toFixed(2).replace('.',',');
function blankForm(key:PersonKey):PayrollForm{
 return {displayName:DEFAULT_NAMES[key],baseSalary:'',hazard:'',extras:'',
 monthlyDeductions:'',vacationDeductions:'',thirteenDeductions:'',
 dependents:'0',vacationStart:'',entitlementDays:'30',thirteenMonths:'12',
 thirteenAlreadyPaid:'',thirteenOnVacation:false};
}
const parseMoney=(raw:string)=>raw.trim()?cents(raw):0;
const moneyProps=['baseSalary','hazard','extras','monthlyDeductions','vacationDeductions','thirteenDeductions','thirteenAlreadyPaid'] as const;
function formToInput(form:PayrollForm):PayrollInputs{
 const amounts=moneyProps.map(k=>parseMoney(form[k]));
 if(amounts.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Revise os valores em reais. Use valores positivos e no máximo duas casas decimais.');
 if(amounts.some(n=>n>9007199254740991))throw new Error('Valor muito alto para a calculadora.');
 const d=Number(form.dependents),ent=Number(form.entitlementDays),months=Number(form.thirteenMonths);
 if(!Number.isInteger(d)||d<0||d>30)throw new Error('Informe de 0 a 30 dependentes.');
 if(![12,18,24,30].includes(ent))throw new Error('Escolha uma quantidade válida de dias de férias.');
 if(!Number.isInteger(months)||months<1||months>12)throw new Error('Informe de 1 a 12 meses de 13º.');
 return {
  baseSalaryCents:amounts[0],hazardCents:amounts[1],extrasCents:amounts[2],
  monthlyDeductionsCents:amounts[3],vacationDeductionsCents:amounts[4],
  thirteenDeductionsCents:amounts[5],dependents:d,vacationStart:form.vacationStart,
  entitlementDays:ent,thirteenMonths:months,thirteenAlreadyPaidCents:amounts[6],
  thirteenOnVacation:form.thirteenOnVacation
 };
}
function formFromRow(row:SavedRow):PayrollForm{
 return {
  displayName:row.display_name,baseSalary:moneyInput(row.base_salary_cents),
  hazard:moneyInput(row.hazard_cents),extras:moneyInput(row.extras_cents),
  monthlyDeductions:moneyInput(row.monthly_deductions_cents),
  vacationDeductions:moneyInput(row.vacation_deductions_cents),
  thirteenDeductions:moneyInput(row.thirteen_deductions_cents),
  dependents:String(row.dependents),vacationStart:row.vacation_start??'',
  entitlementDays:String(row.vacation_entitlement_days),
  thirteenMonths:String(row.thirteen_months),
  thirteenAlreadyPaid:moneyInput(row.thirteen_paid_cents),
  thirteenOnVacation:row.thirteen_on_vacation
 };
}
function validStartDate(value:string){return !value||(/^2026-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(new Date(value+'T00:00:00Z').getTime())&&
 new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value)}
function dateBr(d:string|null){return d?d.split('-').reverse().join('/'):'Informe a data de férias'}
function MoneyField({label,value,onChange,hint}:{label:string;value:string;onChange:(x:string)=>void;hint?:string}){
 return <label className="field payroll-field"><span>{label}</span>
  <div className="payroll-currency"><span>R$</span>
   <input type="text" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)}
    placeholder="0,00" aria-label={label}/>
  </div>{hint&&<small className="payroll-field-hint">{hint}</small>}
 </label>;
}
function Breakdown({title,items,total,highlight=false}:{
 title:string;items:{label:string;value:number;subtract?:boolean}[];
 total:{label:string;value:number|null};highlight?:boolean
}){
 return <div className={`payroll-breakdown ${highlight?'is-highlighted':''}`}>
  <h3>{title}</h3>
  {items.map(item=><div className="payroll-breakdown-row" key={item.label}>
   <span>{item.label}</span><strong className={item.subtract?'payroll-deduction':''}>
    {item.subtract?'− ':''}{money(item.value)}
   </strong></div>)}
  <div className="payroll-breakdown-total"><span>{total.label}</span>
   <strong>{total.value===null?'Sem líquido legal':money(total.value)}</strong></div>
 </div>;
}
function ResultArea({result,person,compare}:{
 result:PayrollResult;person:string;compare:{normal:PayrollResult;sell10:PayrollResult}
}){
 const [copied,setCopied]=useState(false);
 const schedule=result.payments;
 const copy=()=>{
  const text=[
   `Previsão salarial — ${person} — 2026`,
   `Cenário: ${result.variant==='normal'?'Férias normais':result.variant==='sell10'?'Venda de 1/3 das férias':'Hipótese sem amparo legal'}`,
   `Salário bruto mensal: ${money(result.monthlyGrossCents)}`,
   `Recibo de férias: ${result.vacation.netCents===null?'não há líquido legal estimado':money(result.vacation.netCents)}`,
   `Salário pago em ${dateBr(result.salary.payDate)}: ${money(result.salary.netCents)}`,
   `1ª parcela pendente do 13º: ${money(result.thirteen.firstCents)}`,
   `2ª parcela líquida do 13º: ${money(result.thirteen.secondNetCents)}`,
   `Total previsto: ${result.totalNetCents===null?'não aplicável':money(result.totalNetCents)}`,
   'Estimativa: valores reais dependem do RH/holerite e das competências tributárias.'
  ].join('\n');
  void navigator.clipboard.writeText(text).then(()=>{setCopied(true)}).catch(()=>{setCopied(false)});
 };
 return <div className="payroll-results">
  <div className="payroll-result-head"><div><h2>Previsão de recebimentos</h2>
   <p>Estimativa calculada, sem criar lançamentos financeiros.</p></div>
   <button className="secondary" onClick={copy}><Copy size={15}/> {copied?'Copiado':'Copiar resumo'}</button>
  </div>
  <div className="payroll-cards">
   <div className="payroll-result-tile"><span>Recibo de férias</span>
    <strong>{result.vacation.netCents===null?'Não estimável':money(result.vacation.netCents)}</strong>
    <small>{dateBr(result.vacation.payDate)} • {result.vacation.daysOff} dias de descanso</small></div>
   <div className="payroll-result-tile"><span>Salário de 05/12</span>
    <strong>{money(result.salary.netCents)}</strong>
    <small>{result.salary.workedDays} dias remunerados em novembro, fora do gozo</small></div>
   <div className="payroll-result-tile"><span>1ª parcela do 13º pendente</span>
    <strong>{money(result.thirteen.firstCents)}</strong>
    <small>{dateBr(result.thirteen.firstDueDate)} • sem retenção de INSS/IR nesta parcela</small></div>
   <div className="payroll-result-tile"><span>2ª parcela líquida do 13º</span>
    <strong>{money(result.thirteen.secondNetCents)}</strong>
    <small>{dateBr(result.thirteen.secondDueDate)} • tributos sobre o 13º anual</small></div>
  </div>
  {result.variant!=='hypothetical30'&&<div className="payroll-month-summary">
   <div><span>Entradas calculadas em novembro/2026</span><strong>{money(result.netInMonthCents)}</strong></div>
   <div><span>Entradas calculadas em dezembro/2026</span><strong>{money(result.netFollowingMonthCents)}</strong></div>
   <div className="payroll-grand-total"><span>Total dos recebimentos estimados listados</span><strong>{money(result.totalNetCents??0)}</strong></div>
  </div>}
  {result.variant==='hypothetical30'&&<div className="payroll-legal-warning">
   <AlertTriangle size={18}/><div><strong>Simulação sem enquadramento legal para venda de férias</strong>
    <p>30 dias de férias vendidos não são admitidos como abono pecuniário. Para fins de sensibilidade financeira,
     o equivalente bruto a 30 dias mais 1/3 seria {money(result.vacation.hypotheticalExtraGrossCents)}.
     Não é previsão de pagamento, não tem líquido estimado e não foi somado aos recebimentos.</p></div></div>}
  <div className="payroll-breakdowns">
   <Breakdown title="Recibo estimado de férias" items={[
    {label:'Remuneração dos dias de descanso',value:result.vacation.leaveGrossCents},
    {label:'1/3 constitucional sobre descanso',value:result.vacation.leaveThirdCents},
    ...(result.vacation.daysSold>0&&result.legal?[
     {label:'Abono dos dias vendidos (isento)',value:result.vacation.abonoCents},
     {label:'1/3 sobre o abono (isento)',value:result.vacation.abonoThirdCents}
    ]:[]),
    {label:'INSS estimado do período',value:result.vacation.inssCents,subtract:true},
    {label:'IRRF estimado do período',value:result.vacation.irrfCents,subtract:true},
    {label:'Outros descontos no recibo',value:result.vacation.otherDeductionsCents,subtract:true}
   ]} total={{label:'Líquido do recibo',value:result.vacation.netCents}}/>
   <Breakdown title="Salário de novembro pago em 5/12" items={[
    {label:'Salário bruto dos dias remunerados',value:result.salary.grossCents},
    {label:'INSS estimado',value:result.salary.inssCents,subtract:true},
    {label:'IRRF estimado',value:result.salary.irrfCents,subtract:true},
    {label:'Outros descontos mensais',value:result.salary.deductionsCents,subtract:true}
   ]} total={{label:'Líquido em 05/12',value:result.salary.netCents}}/>
   <Breakdown title="13º salário: duas parcelas" items={[
    {label:'13º bruto proporcional',value:result.thirteen.annualGrossCents},
    {label:'Adiantamento já recebido',value:result.thirteen.alreadyPaidCents,subtract:true},
    {label:'1ª parcela ainda prevista',value:result.thirteen.firstCents,subtract:true},
    {label:'INSS total do 13º',value:result.thirteen.inssCents,subtract:true},
    {label:'IRRF do 13º',value:result.thirteen.irrfCents,subtract:true},
    {label:'Outros descontos da 2ª parcela',value:result.thirteen.otherDeductionsCents,subtract:true}
   ]} total={{label:'2ª parcela líquida',value:result.thirteen.secondNetCents}}/>
  </div>
  {schedule.length>0&&<section className="payroll-timeline">
   <h3><CalendarDays size={17}/> Calendário estimado de entradas</h3>
   {schedule.map(p=><div key={p.kind} className="payroll-timeline-row">
    <span>{dateBr(p.date)}</span><span>{p.label}</span><strong>{money(p.netCents)}</strong></div>)}
  </section>}
  {result.warnings.map(w=><p className="small-hint" key={w}><Info size={14}/> {w}</p>)}
  {result.variant!=='hypothetical30'&&<section className="payroll-comparison">
   <h3>Férias normais × venda legal de até 1/3</h3>
   <div className="payroll-compare-grid">
    <div><small>Sem venda</small><strong>{money(compare.normal.totalNetCents??0)}</strong>
     <span>{compare.normal.vacation.daysOff} dias de descanso</span></div>
    <div><small>Com abono de férias</small><strong>{money(compare.sell10.totalNetCents??0)}</strong>
     <span>{compare.sell10.vacation.daysOff} dias de descanso e {compare.sell10.vacation.daysSold} de abono</span></div>
    <div><small>Diferença total estimada</small>
     <strong>{money((compare.sell10.totalNetCents??0)-(compare.normal.totalNetCents??0))}</strong>
     <span>Inclui salário do mês, férias e 13º listado</span></div>
   </div>
  </section>}
 </div>;
}

export default function PayrollCalculator({householdId,uid,connected}:Props){
 const [person,setPerson]=useState<PersonKey>('rui');
 const [forms,setForms]=useState<Record<PersonKey,PayrollForm>>({rui:blankForm('rui'),taina:blankForm('taina')});
 const [rows,setRows]=useState<Partial<Record<PersonKey,SavedRow>>>({});
 const [variants,setVariants]=useState<Record<PersonKey,VacationVariant>>({rui:'normal',taina:'normal'});
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [status,setStatus]=useState('');
 const [month,setMonth]=useState('2026-11');
 const form=forms[person];
 const variant=variants[person];
 const change=(key:keyof PayrollForm,val:string|boolean)=>{
  setForms(old=>({...old,[person]:{...old[person],[key]:val}}));
  setStatus('');
 };
 useEffect(()=>{
  if(!connected||!db||!householdId)return;
  let cancelled=false;
  const load=async()=>{
   setLoading(true);
   const r=await db.from('payroll_profiles').select('*').eq('household_id',householdId);
   if(cancelled)return;
   if(r.error){setStatus('Não foi possível carregar os perfis: '+r.error.message)}
   else {
    const mapping:Partial<Record<PersonKey,SavedRow>>={};
    for(const row of (r.data||[]) as SavedRow[]){
     if(row.person_key==='rui'||row.person_key==='taina')mapping[row.person_key]=row;
    }
    setRows(mapping);
    setForms(old=>({
     rui:mapping.rui?formFromRow(mapping.rui):old.rui,
     taina:mapping.taina?formFromRow(mapping.taina):old.taina
    }));
   }
   setLoading(false);
  };
  void load();
  return()=>{cancelled=true};
 },[connected,householdId]);
 const calc=useMemo(()=>{
  try{
   const input=formToInput(form);
   if(!validStartDate(input.vacationStart))throw new Error('Informe uma data válida de férias no ano de 2026.');
   if(input.thirteenAlreadyPaidCents<0)throw new Error('O adiantamento não pode ser negativo.');
   return {error:'',result:calculatePayroll(input,variant,month),
    normal:calculatePayroll(input,'normal',month),
    sell10:calculatePayroll(input,'sell10',month)};
  }catch(e){
   return {error:e instanceof Error?e.message:'Revise os campos.',result:null,normal:null,sell10:null};
  }
 },[form,variant,month]);
 const activeResult=calc.result;
 const family=useMemo(()=>{
  const output:{name:string;result:PayrollResult}[]=[];
  for(const key of ['rui','taina'] as const){
   try{
    const inp=formToInput(forms[key]);
    if(inp.baseSalaryCents<=0)continue;
    const result=calculatePayroll(inp,variants[key],month);
    if(result.legal)output.push({name:forms[key].displayName||DEFAULT_NAMES[key],result});
   }catch{/* Editar um perfil incompleto não impede o outro cálculo. */}
  }
  const total=output.reduce((s,p)=>s+(p.result.totalNetCents??0),0);
  const monthTotal=output.reduce((s,p)=>s+p.result.netInMonthCents,0);
  const nextTotal=output.reduce((s,p)=>s+p.result.netFollowingMonthCents,0);
  return {output,total,monthTotal,nextTotal};
 },[forms,variants,month]);
 const save=async()=>{
  if(!connected||!db||!householdId||!uid){setStatus('Entre na conta do casal para salvar os perfis.');return}
  let input:PayrollInputs;
  try{
   input=formToInput(form);
   if(!form.displayName.trim())throw new Error('Informe o nome do integrante.');
   if(input.baseSalaryCents<=0)throw new Error('Informe um salário-base maior que zero.');
   if(!validStartDate(input.vacationStart))throw new Error('Informe uma data válida de férias em 2026.');
  }catch(e){setStatus(e instanceof Error?e.message:'Revise os campos.');return}
  setBusy(true);setStatus('');
  const payload={
   display_name:form.displayName.trim(),base_salary_cents:input.baseSalaryCents,
   hazard_cents:input.hazardCents,extras_cents:input.extrasCents,
   monthly_deductions_cents:input.monthlyDeductionsCents,
   vacation_deductions_cents:input.vacationDeductionsCents,
   thirteen_deductions_cents:input.thirteenDeductionsCents,
   dependents:input.dependents,vacation_start:input.vacationStart||null,
   vacation_entitlement_days:input.entitlementDays,thirteen_months:input.thirteenMonths,
   thirteen_paid_cents:input.thirteenAlreadyPaidCents,
   thirteen_on_vacation:input.thirteenOnVacation,
   updated_at:new Date().toISOString()
  };
  const old=rows[person];
  const r=old
   ?await db.from('payroll_profiles').update(payload).eq('id',old.id).select('*').single()
   :await db.from('payroll_profiles').insert({
    ...payload,household_id:householdId,person_key:person,owner_id:uid
   }).select('*').single();
  if(r.error)setStatus('Erro ao salvar: '+r.error.message);
  else {
   setRows(oldRows=>({...oldRows,[person]:r.data as SavedRow}));
   setStatus('Perfil salvo. Os dois integrantes da casa podem consultá-lo e atualizá-lo.');
  }
  setBusy(false);
 };
 return <div className="payroll-page">
  <div className="panel payroll-intro">
   <div><span className="eyebrow">SIMULADOR DO CASAL · TABELAS 2026</span>
    <h2><Calculator size={23}/> Férias, salário e 13º salário</h2>
    <p>Planeje quanto cada pessoa deve receber e em que data. Compare férias normais, abono legal e uma hipótese de pagamento não prevista na CLT.</p>
   </div>
   <div className="payroll-tax-pill"><ShieldCheck size={16}/> Tabelas INSS e IRRF de 2026</div>
  </div>
  <div className="payroll-person-switch">
   {(['rui','taina'] as const).map(key=><button className={person===key?'selected':''} key={key} onClick={()=>{setPerson(key);setStatus('')}}>
    {forms[key].displayName||DEFAULT_NAMES[key]} {rows[key]&&<Check size={14}/>}
   </button>)}
  </div>
  <div className="payroll-layout">
   <div className="panel payroll-input-panel">
    <div className="panel-head"><div><h2>Dados para calcular</h2>
     <p>Preencha os valores do holerite de {form.displayName||DEFAULT_NAMES[person]}.</p></div>
     <Users size={20}/></div>
    {loading&&<p className="small-hint">Carregando cadastro do casal…</p>}
    <label className="field"><span>Nome do integrante</span>
     <input type="text" maxLength={80} value={form.displayName} onChange={e=>change('displayName',e.target.value)}/></label>
    <h3 className="payroll-field-section">Remuneração</h3>
    <div className="payroll-field-grid">
     <MoneyField label="Salário-base (R$)" value={form.baseSalary} onChange={x=>change('baseSalary',x)}/>
     <MoneyField label="Periculosidade (R$)" value={form.hazard} onChange={x=>change('hazard',x)}
      hint="Valor do adicional no holerite"/>
     <MoneyField label="Outros adicionais e médias (R$)" value={form.extras} onChange={x=>change('extras',x)}
      hint="Extras habituais, comissões, médias"/>
     <label className="field payroll-field"><span>Dependentes para IRRF</span>
      <input type="number" min="0" max="30" step="1" value={form.dependents} onChange={e=>change('dependents',e.target.value)}/></label>
    </div>
    <button className="secondary payroll-quick" onClick={()=>change('hazard',moneyInput(Math.round(parseMoney(form.baseSalary)*.30)))}>
     Usar 30% do salário-base como periculosidade
    </button>
    <h3 className="payroll-field-section">Férias de 2026</h3>
    <div className="payroll-field-grid">
     <label className="field payroll-field"><span>Início das férias</span>
      <input type="date" min="2026-01-01" max="2026-12-31" value={form.vacationStart}
       onChange={e=>change('vacationStart',e.target.value)}/></label>
     <label className="field payroll-field"><span>Dias de direito</span>
      <select value={form.entitlementDays} onChange={e=>change('entitlementDays',e.target.value)}>
       {[30,24,18,12].map(n=><option key={n} value={n}>{n} dias</option>)}</select></label>
    </div>
    <div className="payroll-scenarios" role="group" aria-label="Cenário de férias">
     <button className={variant==='normal'?'active':''} onClick={()=>setVariants(v=>({...v,[person]:'normal'}))}>Férias normais</button>
     <button className={variant==='sell10'?'active':''} onClick={()=>setVariants(v=>({...v,[person]:'sell10'}))}>Vender até 1/3</button>
     <button className={variant==='hypothetical30'?'active danger':''} onClick={()=>setVariants(v=>({...v,[person]:'hypothetical30'}))}>Hipótese: 100%</button>
    </div>
    <h3 className="payroll-field-section">13º salário</h3>
    <div className="payroll-field-grid">
     <label className="field payroll-field"><span>Avos de 13º devidos em 2026</span>
      <select value={form.thirteenMonths} onChange={e=>change('thirteenMonths',e.target.value)}>
       {Array.from({length:12},(_,i)=>i+1).map(n=><option value={n} key={n}>{n}/12</option>)}</select></label>
     <MoneyField label="Adiantamento do 13º já recebido (R$)" value={form.thirteenAlreadyPaid}
      onChange={x=>change('thirteenAlreadyPaid',x)}
      hint="Para não prever uma primeira parcela já paga"/>
    </div>
    <label className="payroll-check">
     <input type="checkbox" checked={form.thirteenOnVacation} onChange={e=>change('thirteenOnVacation',e.target.checked)}/>
     Prever a 1ª parcela do 13º junto com o pagamento das férias (se confirmado pelo RH)
    </label>
    <h3 className="payroll-field-section">Outros descontos (além de INSS/IRRF)</h3>
    <div className="payroll-field-grid">
     <MoneyField label="Mensais (R$)" value={form.monthlyDeductions}
      onChange={x=>change('monthlyDeductions',x)}
      hint="Benefícios, convênios, descontos no salário"/>
     <MoneyField label="No recibo de férias (R$)" value={form.vacationDeductions}
      onChange={x=>change('vacationDeductions',x)}/>
     <MoneyField label="Na 2ª parcela do 13º (R$)" value={form.thirteenDeductions}
      onChange={x=>change('thirteenDeductions',x)}/>
    </div>
    <label className="field payroll-field"><span>Mês de referência do salário (tabelas válidas somente para 2026)</span>
     <input type="month" min="2026-01" max="2026-12" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    {calc.error&&<div className="payroll-error"><AlertTriangle size={17}/>{calc.error}</div>}
    {status&&<div className="payroll-status"><Info size={16}/>{status}</div>}
    <button className="primary payroll-save" disabled={busy||loading||!connected||!householdId} onClick={()=>void save()}>
     <Save size={18}/> {busy?'Salvando…':'Salvar dados de '+(form.displayName||DEFAULT_NAMES[person])}
    </button>
    {!connected&&<p className="small-hint">Você pode testar no modo demonstração; entre no acesso do casal para guardar os perfis.</p>}
    <p className="small-hint"><ShieldCheck size={14}/> Estes dados são compartilhados apenas com a casa autenticada. Nenhum valor é incluído automaticamente como receita, evitando duplicar salários já lançados no orçamento.</p>
   </div>
   <div>
    {activeResult&&formToInput(form).baseSalaryCents>0
      ?<ResultArea key={person+'-'+variant} result={activeResult} person={form.displayName}
        compare={{normal:calc.normal!,sell10:calc.sell10!}}/>
      :<section className="panel payroll-empty"><Calculator size={36}/>
        <h2>Preencha o salário-base para calcular</h2>
        <p>O recibo de férias, o salário de 05/12 e as parcelas do 13º aparecerão aqui, com detalhes de descontos.</p></section>}
   </div>
  </div>
  {family.output.length>0&&<section className="panel payroll-family">
   <div className="panel-head"><div><h2>Previsão conjunta do casal</h2>
    <p>Inclui apenas perfis com valores informados e cenários legais. Não altera o orçamento salvo.</p></div>
    <Users size={20}/></div>
   <div className="payroll-family-grid">
    <div><small>{monthName(month)}</small><strong>{money(family.monthTotal)}</strong></div>
    <div><small>{family.output[0]?.result.salary.payDate.slice(0,7)?monthName(family.output[0].result.salary.payDate.slice(0,7)):'Mês seguinte'}</small><strong>{money(family.nextTotal)}</strong></div>
    <div><small>Total de entradas estimadas</small><strong>{money(family.total)}</strong></div>
   </div>
   <p className="small-hint">Perfis considerados: {family.output.map(x=>x.name).join(' + ')}. Despesas não foram deduzidas deste total; consulte Planejamento para comparar recebimentos com as contas.</p>
  </section>}
  <div className="payroll-disclaimer">
   <AlertTriangle size={19}/><div>
    <strong>Estimativa, não substitui o recibo de férias nem o holerite.</strong>
    <p>INSS 2026 e IRRF 2026 são calculados por faixas progressivas; a redução de imposto de 2026 também vale para o 13º. O cálculo de férias utiliza o valor dos dias gozados mais 1/3, e isenta o abono pecuniário de 1/3 dos dias. Datas de pagamento, projeção do salário pós-férias, competência tributária, outras verbas, médias e compensações de adiantamentos podem gerar diferenças. A venda integral de férias não é autorizada pela CLT.</p>
    <p>Fontes: <a href="https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal" target="_blank" rel="noreferrer">INSS 2026</a> · <a href="https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026" target="_blank" rel="noreferrer">IRRF 2026</a> · <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes" target="_blank" rel="noreferrer">Férias (MTE)</a> · <a href="https://www.gov.br/esocial/pt-br/empregador-domestico/perguntas-frequentes/perguntas-frequentes/" target="_blank" rel="noreferrer">13º (eSocial)</a>.</p>
   </div>
  </div>
 </div>;
}
