# Meu Financeiro — aplicativo de planejamento do casal

**Aplicação em produção:** https://meu-financeiro-casal.vercel.app  
**Supabase pessoal:** https://supabase.com/dashboard/project/bpdorktzzsebjcnyuqah

## Recursos

- Acesso por conta, dados individuais e compartilhados com políticas RLS.
- Receitas e despesas, contas, cartões, faturas e parcelamentos.
- Receita e despesa fixa mensal, com valor fixo ou variável, em conta ou cartão.
- Orçamentos por categoria, limite consolidado dos cartões, metas e alertas.
- **Planejamento protegido de 12 meses:** limites por categoria são pisos mensais de despesa. O último orçamento válido continua nos meses seguintes até uma nova configuração. Compromissos já registrados reduzem o complemento reservado da categoria, evitando duplicar a despesa.
- **Reserva de cartões:** o teto consolidado é levado à projeção como reserva adicional quando ainda não está coberto por gastos reconhecidos e reservas das categorias habitualmente pagas em cartão. É estimativa conservadora, não a fatura futura cobrada pelo banco.
- **Simulador de compras sem gravar dados:** informa compra à vista ou parcelada, valor total ou por parcela, mês, categoria e cartão, calcula os próximos 12 meses novamente e identifica déficits, estouros de categoria e de teto de cartões. Quando há prestações além dos 12 meses, a análise é explicitamente **parcial**, não uma autorização para comprar.
- **Tendências e economia:** despesas realizadas nos últimos seis meses completos, comparação por categorias revisáveis, hipóteses ilustrativas de redução de 10%, compromissos fixos para revisão e indicador preliminar da margem projetada.
- Exportação CSV e interface responsiva.

## Conciliação inicial: saldo real e fatura do banco

- **Contas → Atualizar saldo atual:** informe o saldo mostrado pelo banco. A atualização salva uma diferença auditável em `account_balance_adjustments`, sem editar o saldo inicial, apagar lançamentos ou criar receitas/despesas fictícias. O cálculo posterior continua considerando novos pagamentos e recebimentos.
- **Cartões → Informar valor real da fatura:** escolha o mês da fatura, digite o total oficial, inclusive compras ainda sem detalhamento, e salve. Este valor **substitui** o total calculado dos lançamentos daquele mês; não é somado a ele.
- O painel exibe `valor detalhado`, `valor real` e `diferença ainda sem detalhamento`. Quando compras antigas forem cadastradas, a diferença é reduzida automaticamente e a fatura real não aumenta.
- O valor real atualizado participa do orçamento global de cartões, do planejamento protegido de 12 meses e dos indicadores mensais. Quando a fatura registrada ultrapassa as compras cadastradas, a diferença fica separada como `Fatura sem detalhamento`, sem criar lançamento inventado ou atribuir uma categoria sem informação.
- **Somente o responsável** pela conta pode conciliar o saldo e o responsável pelo cartão pode confirmar a fatura. O segundo integrante pode visualizar os dados de contas/cartões compartilhados, mas não alterar valores do responsável. Contas e cartões privados permanecem invisíveis à outra pessoa.
- A fatura não pode ser fixada em valor inferior aos pagamentos já registrados. Com uma fatura de valor oficial, o pagamento reduz o saldo devido, mas não diminui o gasto do mês.
- Para uma nova compra *simulada*, o planejamento considera o impacto adicional e não a trata como se já estivesse contida numa fatura informada anteriormente.

**Orientação:** use o valor de **vencimento da fatura do mês selecionado**. Se houver compras em meses anteriores cuja fatura vence neste mês, elas pertencem a essa fatura — não necessariamente ao mês da compra.

**Migrações:** `006_account_balance_reconciliation.sql` e `007_card_statement_actual_totals.sql` já estão aplicadas no Supabase pessoal. As duas tabelas têm RLS e as operações de conciliação usam funções `SECURITY INVOKER`.

## Premissas importantes

- Um **orçamento por categoria de R$ 800** gera pelo menos R$ 800 de despesa planejada em cada mês, salvo mudança programada. Se já foram reconhecidos R$ 500 naquela categoria, só se adicionam R$ 300 de reserva.
- O limite de cartão não é uma despesa obrigatória: é uma **reserva de planejamento**. Como a alocação futura entre conta e cartão nem sempre é conhecida, o aplicativo usa o histórico de meios de pagamento para reduzir possíveis sobreposições. Revise os resultados antes de tomar decisões.
- O **resultado acumulado** soma movimentos projetados desde o mês selecionado e **não representa saldo em conta**. Cadastre salários e demais recebimentos futuros para tornar as simulações mais úteis.
- Tendências históricas usam meses encerrados; meses sem registros não podem ser interpretados automaticamente como ausência de despesas.
- O simulador não insere transações reais nem reservas no banco.
- Limites consolidados de cartões são individuais e incluem apenas cartões acessíveis ao titular; não revelam cartões privados de outro integrante.
- O indicador de margem mensal é orientativo, não avaliação profissional de crédito ou investimento.

## Código e implantação

O projeto utiliza React, TypeScript, Vite, Supabase e Vercel.

```bash
npm install
npm run test
npm run build
npm run dev
```

Variáveis necessárias, mantidas fora do Git:

```env
VITE_SUPABASE_URL=https://bpdorktzzsebjcnyuqah.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicável, obtida no Supabase>
```

**Nunca** inserir `service_role`, `sb_secret_`, senhas ou extratos no repositório.

As alterações do banco estão versionadas em `supabase/`; a migração `005_card_spending_limits.sql` adicionou o orçamento consolidado com RLS. As projeções com pisos mensais e o simulador são cálculos de frontend e não necessitam de alteração nas tabelas existentes.

## Qualidade e limites

A publicação automática da Vercel executa testes Vitest e compilação TypeScript/Vite antes de disponibilizar a versão. Os testes automatizados **não substituem** testes ponta a ponta de cadastro real, e-mail e dois navegadores autenticados. Antes de decisões importantes, valide os lançamentos e revise as estimativas.

O projeto ainda não oferece conciliação bancária automática, taxas reais de empréstimos, notificações push nem backups automatizados. Informações preenchidas pelo usuário podem estar incompletas.

**Segurança do código:** o repositório atual `AuditoriaGR/FINAN-AS` está público. Não armazene dados financeiros reais, extratos ou segredos nesse repositório. O banco Supabase utilizado pelo app é o projeto pessoal `bpdorktzzsebjcnyuqah`, separado dos projetos empresariais.

## Arquivos principais

- `src/App.tsx`: navegação, formulários, orçamento e integrações.
- `src/finance.ts`: cálculos financeiros, cartão e recorrências.
- `src/planning.ts`: pisos futuros, projeção protegida, simulação e análise de gastos.
- `src/FuturePlanning.tsx`: planejamento e simulador de compras.
- `src/SpendingInsightsPanel.tsx`: tendências e possibilidades de economia.
- `tests/finance.test.ts` e `tests/planning.test.ts`: testes automatizados.
- `supabase/`: migrações e políticas de segurança.
