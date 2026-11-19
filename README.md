# OrçaMecânica

Aplicação para oficinas criarem orçamentos com sua marca, dados do cliente e veículo, peças, mão de obra, desconto e PDF. Inclui demonstração, contas, histórico, catálogo, compartilhamento e checkout baseado no projeto OrçaEstofado.

## Desenvolvimento

Requer Node.js 22.12 ou superior e npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Acesse http://localhost:3000. Sem `DATABASE_URL`, o banco local PGlite é armazenado em `.local/database`; mensagens de recuperação de senha são gravadas em `.local/outbox` quando não há provedor de e-mail. Não publique esses arquivos nem credenciais.

Configure o vendedor, e-mail, PostgreSQL, HTTPS e Mercado Pago conforme `.env.example` antes de usar em produção. O checkout permanece indisponível enquanto a configuração estiver incompleta. A oferta inicial é R$ 97 por 12 meses, sem renovação automática, com até 300 documentos e 10 itens por orçamento.

O PDF é gerado no navegador. Fotos opcionais ficam apenas no documento baixado e precisam ser selecionadas novamente ao reeditar. O histórico guarda os dados textuais; o servidor valida itens e desconto e calcula o total em centavos.

## Verificações

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Para os testes de interface, instale o Chromium do Playwright. Antes de publicar, homologue e-mail, pagamento e compartilhamento em dispositivos reais. A implantação exige variáveis de ambiente de produção e banco próprio; dados e credenciais do projeto de referência não foram incluídos.
