# Meu Financeiro

Aplicação de gestão financeira pessoal e compartilhada do casal.

Módulos: contas, lançamentos, cartões e parcelas, orçamentos por categoria, metas, alertas, comparativos e projeção de 12 meses.

## Execução local

```bash
npm install
npm run test
npm run build
npm run dev
```

## Configuração

Crie um projeto Supabase pessoal independente, execute `supabase/001_initial.sql` nesse projeto novo e forneça `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` usando o arquivo `.env.example`. **Nunca** envie `service_role`, segredos ou dados financeiros ao repositório.

Esta versão ainda precisa de testes de integração com dois usuários e implantação segura antes de receber dados financeiros reais.
