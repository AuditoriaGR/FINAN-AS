# Meu Financeiro

Aplicação web para gestão financeira individual e compartilhada do casal. Inclui contas, receitas e despesas, cartões/parcelas, orçamentos por categoria, metas, alertas, comparativos e previsão de 12 meses.

## Execução

```bash
npm install
npm run test
npm run build
npm run dev
```

## Supabase

Execute o arquivo `supabase/001_initial.sql` **somente no projeto pessoal, vazio e independente**, e configure a URL e a chave publicável conforme `.env.example`.

Nunca faça commit de `.env`, chaves `service_role`, senhas ou dados pessoais. Antes de usar dados reais, valide as políticas RLS com dois usuários e conclua a integração e o deploy.
