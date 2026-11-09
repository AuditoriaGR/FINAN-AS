# Meu Financeiro — aplicativo de planejamento do casal

**Aplicação em produção:** https://meu-financeiro-casal.vercel.app  
**Supabase pessoal:** https://supabase.com/dashboard/project/bpdorktzzsebjcnyuqah


## Instalar no Android pelo Google Chrome (sem APK manual)

O Meu Financeiro é uma aplicação web instalável (PWA). **Não exige baixar APK de terceiros nem publicar o app na Play Store**.

1. Abra o endereço oficial `https://meu-financeiro-casal.vercel.app` no **Google Chrome**.
2. Toque em **Instalar app**, no cabeçalho, caso o navegador ofereça instalação direta.
3. Se a instalação direta não estiver disponível, abra **Configurações → Instalar Meu Financeiro** para ver as instruções. No Chrome, use **⋮ → Instalar aplicativo** ou **Adicionar à tela inicial**.
4. Confirme. O ícone **Meu Financeiro** aparecerá na tela inicial ou na lista de aplicativos. Abra-o como um aplicativo independente do navegador.
5. Cada integrante continua acessando a mesma casa com seu login. Nenhum dado financeiro é migrado para a instalação local.

O PWA usa `public/manifest.webmanifest`, ícones PNG nos tamanhos 192/512, o service worker `public/sw.js` e uma página estática de orientação offline. **Apenas a página estática de falta de conexão é armazenada no cache; nenhuma resposta de autenticação, saldo, cartão ou Supabase é gravada ali.** O aplicativo requer internet para acessar os dados reais. Para iPhone, use o Safari → Compartilhar → Adicionar à Tela de Início.

As validações da instalação rodam com `npm test` no build. Atualizações do site são publicadas normalmente na Vercel e ficam disponíveis para os usuários instalados.

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

## Baixas com valor real e medição de desvios

- Em **Lançamentos**, selecione o mês e clique no símbolo de confirmação junto à receita ou despesa pendente. A nova baixa solicita **valor efetivamente recebido/pago**, **data** e **conta disponível**; ela não usa CDB como conta de pagamento.
- Na primeira baixa, o valor originalmente previsto é preservado em `transactions.planned_amount_cents`. O campo `amount_cents` passa a refletir o realizado. Uma correção posterior de baixa não altera a previsão original.
- Despesa prevista de R$ 300 e paga por R$ 270 = **R$ 30 favoráveis**; receita prevista de R$ 1.000 e recebida por R$ 950 = **R$ 50 desfavoráveis**.
- O painel **Previsto × realizado**, na Visão geral e em Lançamentos, consolida receitas, despesas e efeito líquido das baixas do mês selecionado. O CSV inclui previsto, realizado e desvio.
- O saldo da conta é atualizado com o realizado e a projeção usa os novos valores, sem repassar desvios às parcelas ou recorrências de meses futuros.
- Compras no cartão são conciliadas pela **fatura real** na página Cartões. Movimentos marcados como já incluídos no saldo inicial não podem ser baixados outra vez.
- Se o valor realizado for corrigido após a baixa, utilize o ícone de edição em **Lançamentos**; para uma cobrança fixa variável ainda pendente, use **Fixas e parcelas → Informar valor do mês**.
- Lançamentos pendentes não são tratados como realizados na análise, e valores anteriores a essa melhoria não recebem desvios históricos inventados.
- A operação é atômica e respeita a visibilidade do casal por RLS: `010_settlement_actual_vs_planned.sql` cria a função `public.settle_transaction` com `SECURITY INVOKER`.

## Saldos iniciais e responsabilidade do casal

- Os valores iniciais das contas são uma **fotografia bancária já com os salários e o apartamento pagos em novembro de 2026**.
- Os lançamentos de novembro referentes aos dois salários e ao apartamento foram conservados e marcados no campo `transactions.in_opening_balance`. Eles seguem no histórico, mas não entram outra vez como novas entradas ou saídas da projeção.
- O saldo de fechamento projetado de novembro é calculado somando os saldos atuais da casa às receitas ainda previstas e subtraindo as despesas ainda a pagar, incluindo os valores reais das faturas do mês.
- Quando uma despesa ligada a uma conta já foi marcada como paga, ou uma fatura já foi parcialmente paga, essas movimentações não são descontadas novamente da projeção.
- O teto dos cartões está vinculado à casa por `card_spending_limits.household_id` e é o mesmo para os dois integrantes.
- `008_shared_household_and_opening_balance.sql` amplia as permissões exclusivamente à casa autenticada e `009_shared_recurring_materialization.sql` permite gerar recorrências por qualquer membro da mesma casa. Os ajustes nos registros existentes foram aplicados pontualmente no banco, sem gravar identificadores pessoais no repositório.

## Premissas importantes

- Um **orçamento por categoria de R$ 800** gera pelo menos R$ 800 de despesa planejada em cada mês, salvo mudança programada. Se já foram reconhecidos R$ 500 naquela categoria, só se adicionam R$ 300 de reserva.
- O limite de cartão não é uma despesa obrigatória: é uma **reserva de planejamento**. Como a alocação futura entre conta e cartão nem sempre é conhecida, o aplicativo usa o histórico de meios de pagamento para reduzir possíveis sobreposições. Revise os resultados antes de tomar decisões.
- O **saldo projetado acumulado** parte dos saldos atuais de todas as contas da casa e acrescenta o fluxo de caixa ainda não refletido nesses saldos, transportando a diferença entre os meses. Movimentos já liquidados no saldo inicial não são repetidos.
- Tendências históricas usam meses encerrados; meses sem registros não podem ser interpretados automaticamente como ausência de despesas.
- O simulador não insere transações reais nem reservas no banco.
- Todas as contas, cartões, despesas e limites do casal são compartilhados entre os membros da mesma casa. O acesso não concede dados a usuários externos; ambos podem atualizar saldos, faturas e regras compartilhados.
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
