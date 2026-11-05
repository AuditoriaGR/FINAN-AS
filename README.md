# Meu Financeiro — MVP 1.1

Aplicação de controle financeiro pessoal e do casal, com registros **individuais** e **compartilhados**.

## Funcionalidades incluídas no código

- Autenticação por e-mail e senha, espaço do casal e convite único com validade de 7 dias.
- Contas bancárias e saldos; receitas, despesas e status de pagamento.
- Cartões de crédito, compras parceladas e pagamentos parciais ou totais de faturas.
- Orçamento por categoria, metas e aportes.
- Recorrências, alertas financeiros, comparações e projeção dos próximos 12 meses.
- Exportação CSV e interface adaptada a celulares e computadores.

## Supabase pessoal — instalado em 05/11/2026

**Projeto exclusivo:** [Finanças — bpdorktzzsebjcnyuqah](https://supabase.com/dashboard/project/bpdorktzzsebjcnyuqah)

- A migração `supabase/001_initial.sql` foi aplicada com sucesso nesse projeto.
- As 11 tabelas foram criadas, com RLS ativada em todas elas.
- Um teste transacional com dois usuários temporários confirmou que o segundo não consegue ler uma conta/despesa privada do primeiro, mas consegue ler uma despesa compartilhada. O teste foi revertido integralmente, sem deixar dados reais ou de exemplo.
- O Supabase Security Advisor emitiu **3 avisos** referentes a funções `SECURITY DEFINER` destinadas à criação do casal e aos convites. Todas verificam o usuário autenticado e as condições de autorização; ainda precisam de auditoria e teste de ponta a ponta antes de uso sensível.
- Nenhum usuário real foi cadastrado; nenhuma movimentação financeira real foi armazenada.

**Atenção:** essa instalação não significa que a interface já esteja publicada.

## Configuração para implantação

1. Disponibilize a aplicação em uma conta **pessoal** de hospedagem (não na Vercel da empresa GR).
2. Importe este repositório como projeto **Vite + React**.
3. Configure as variáveis de ambiente no painel da hospedagem, nunca no código-fonte:

   ```env
   VITE_SUPABASE_URL=https://bpdorktzzsebjcnyuqah.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicável obtida no Supabase>
   ```

   Use somente uma chave `sb_publishable_...`, jamais `service_role`, `sb_secret_...` ou token administrativo.
4. Execute `npm install`, `npm run test` e `npm run build`; publique só quando esses comandos concluírem sem erro.
5. No Supabase Auth, configure o URL definitivo da aplicação e os Redirect URLs permitidos, usando **apenas os domínios reais** do app.
6. Cadastre o primeiro usuário, crie o espaço do casal, gere um convite na página Configurações e aceite-o com o segundo usuário.
7. Teste criação de dados privados e compartilhados, vencimentos, parcelas, saldos e permissões em dois navegadores antes de inserir valores financeiros reais.

## Desenvolvimento local

Node.js 22+.

```bash
npm install
npm run test
npm run build
npm run dev
```

Use o arquivo `.env.example` como modelo (o arquivo `.env` real deve ser mantido fora do Git).

## Limitações atuais

A compilação completa do frontend e o teste ponta a ponta no navegador ainda **não foram validados** por limitação de acesso ao registry npm no ambiente de desenvolvimento. O projeto tem suíte de testes unitários e configuração de CI, mas o resultado do GitHub Actions ainda está pendente de conferência.

Não inclui conciliação bancária automática, exportação de todos os módulos, estornos de fatura, notificações push ou backup automatizado. O histórico consolidado apresenta os registros próprios e os compartilhados; dados privados de outro integrante continuam ocultos.

**Segurança:** o código está atualmente em um repositório **público** da conta `AuditoriaGR`. Não armazene nele credenciais, segredos, extratos, dados financeiros reais ou informações pessoais. Prefira transferi-lo para um repositório pessoal privado antes do uso diário.

## Arquivos principais

- `src/App.tsx`: telas e formulários
- `src/finance.ts`: cálculos monetários e previsões
- `src/supabase.ts`: conexão Supabase pelo navegador
- `supabase/001_initial.sql`: esquema, convites e políticas RLS
- `tests/finance.test.ts`: testes unitários das regras financeiras
- `.github/workflows/ci.yml`: testes e build no GitHub Actions
