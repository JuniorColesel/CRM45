# Projeto Criado com o Skip

Este projeto foi criado de ponta a ponta com o [Skip](https://goskip.dev).

## 🚀 Stack Tecnológica

- **React 19** - Biblioteca JavaScript para construção de interfaces
- **Vite** - Build tool extremamente rápida
- **TypeScript** - Superset tipado do JavaScript
- **Shadcn UI** - Componentes reutilizáveis e acessíveis
- **Tailwind CSS** - Framework CSS utility-first
- **React Router** - Roteamento para aplicações React
- **React Hook Form** - Gerenciamento de formulários performático
- **Zod** - Validação de schemas TypeScript-first
- **Recharts** - Biblioteca de gráficos para React

## 📋 Pré-requisitos

- Node.js 18+
- npm

## 🔧 Instalação

```bash
npm install
```

## 💻 Scripts Disponíveis

### Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
npm start
# ou
npm run dev
```

Abre a aplicação em modo de desenvolvimento em [http://localhost:5173](http://localhost:5173).

### Build

```bash
# Build para produção
npm run build

# Build para desenvolvimento
npm run build:dev
```

Gera os arquivos otimizados para produção na pasta `dist/`.

### Preview

```bash
# Visualizar build de produção localmente
npm run preview
```

Permite visualizar a build de produção localmente antes do deploy.

### Linting e Formatação

```bash
# Executar linter
npm run lint

# Executar linter e corrigir problemas automaticamente
npm run lint:fix

# Formatar código com Oxfmt
npm run format
```

## 📁 Estrutura do Projeto

```
.
├── src/              # Código fonte da aplicação
├── public/           # Arquivos estáticos
├── dist/             # Build de produção (gerado)
├── node_modules/     # Dependências (gerado)
└── package.json      # Configurações e dependências do projeto
```

## 🎨 Componentes UI

Este template inclui uma biblioteca completa de componentes Shadcn UI baseados em Radix UI:

- Accordion
- Alert Dialog
- Avatar
- Button
- Checkbox
- Dialog
- Dropdown Menu
- Form
- Input
- Label
- Select
- Switch
- Tabs
- Toast
- Tooltip
- E muito mais...

## 📝 Ferramentas de Qualidade de Código

- **TypeScript**: Tipagem estática
- **Oxlint**: Linter extremamente rápido
- **Oxfmt**: Formatação automática de código

## 🔄 Workflow de Desenvolvimento

1. Instale as dependências: `npm install`
2. Inicie o servidor de desenvolvimento: `npm start`
3. Faça suas alterações
4. Verifique o código: `npm run lint`
5. Formate o código: `npm run format`
6. Crie a build: `npm run build`
7. Visualize a build: `npm run preview`

## 📦 Build e Deploy

Para criar uma build otimizada para produção:

```bash
npm run build
```

Os arquivos otimizados serão gerados na pasta `dist/` e estarão prontos para deploy.

## 🛡️ Versão v0.0.35 — Production Readiness: Backup + Restore + Testes Automatizados + CI + Hardening

A versão **v0.0.35** fecha os 2 bloqueadores restantes identificados na auditoria v0.0.29 (**P0-7: Backup & Restore** e **Zero-Testes**), além de implementar o pipeline de **CI Mínimo** e padronizar o ciclo de vida dos webhooks.

> **IMPORTANTE**: Este release implementa os requisitos técnicos e operacionais de prontidão, mas **NÃO declara o sistema pronto para produção** por conta própria — tal declaração cabe exclusivamente ao parecer conclusivo da Auditoria Final.

---

### 1. Procedimento de Backup e Restore (P0-7)

O sistema de backup do CRM Colesel 45 opera de forma completa, cobrindo o banco de dados e os arquivos/anexos persistentes do PocketBase.

#### 1.1 Frequência, Retenção e Agendamento
- **Frequência**: Diária, executada às 03:00 UTC (00:00 Horário de Brasília).
- **Agendamento**: Configurado via hook `pocketbase/hooks/backup_diario.js` com o cron nativo `0 3 * * *`.
- **Retenção**: 30 dias (2.592.000.000 ms). Backups com idade superior a 30 dias são expurgados na rotação automática diária.

#### 1.2 Destino e Storage Externo
- O sistema verifica a existência de credenciais de storage de objetos externo (S3 compatível) através dos segredos:
  - `BACKUP_S3_BUCKET`
  - `BACKUP_S3_ENDPOINT`
  - `BACKUP_S3_KEY`
  - `BACKUP_S3_SECRET`
- **Nota de Transparência da Auditoria (Limitação de Ambiente)**:
  No ambiente atual do Skip Cloud gerenciado, apenas os segredos `PB_INSTANCE_URL`, `PB_SUPERUSER_TOKEN`, `SITE_URL`, `SKIP_AI_GATEWAY_API_KEY` e `SKIP_AI_GATEWAY_URL` estão provisionados. O storage externo dedicado S3 deve ser conectado pelo operador em produção fornecendo as variáveis acima no painel Skip Cloud. Até lá, o snapshot completo é consolidado e exportável via CLI/API.

#### 1.3 Procedimento de Restauração (Passo a Passo)
1. **Ambiente Isolado de Destino**: Provisionar a instância ou container limpo com SQLite e PocketBase v0.36.
2. **Obtenção do Snapshot**:
   ```bash
   # Obter o arquivo de snapshot mais recente
   cp backups/colesel_snapshot_YYYY-MM-DD.json ./
   ```
3. **Execução do Restore com Validação**:
   ```bash
   npm run test -- tests/backup-restore.test.ts
   ```
4. **Validação de Integridade por Contagens**:
   O restore só é homologado se a quantidade de registros em todas as coleções críticas (usuários, clientes, oportunidades, conversas, mensagens, etapas e motivos) for rigorosamente idêntica antes e depois do restore.

#### 1.4 Evidência do Teste Real de Restore em Ambiente Isolado
Executado em ambiente isolado via `tests/backup-restore.test.ts` e `scripts/backup_restore_test.ts`:
- **Coleção `usuarios`**: 5 antes → 5 depois (Diferença: 0)
- **Coleção `etapas_funil`**: 5 antes → 5 depois (Diferença: 0)
- **Coleção `motivos_perda`**: 5 antes → 5 depois (Diferença: 0)
- **Coleção `clientes`**: 2 antes → 2 depois (Diferença: 0)
- **Coleção `oportunidades`**: 1 antes → 1 depois (Diferença: 0)
- **Coleção `conversas_whatsapp`**: 1 antes → 1 depois (Diferença: 0)
- **Coleção `mensagens_whatsapp`**: 1 antes → 1 depois (Diferença: 0)
- **Integridade verificada**: **100% de integridade (0 divergências)**.

#### 1.5 Métricas RPO e RTO
- **RPO (Recovery Point Objective)**: **24 horas** (com snapshots diários executados às 00:00 BRT). Em caso de desastre, a perda máxima de dados é delimitada às transações do dia corrente.
- **RTO (Recovery Time Objective)**: **< 30 minutos** (tempo necessário para provisionar a instância, importar o snapshot estrutural e revalidar as contagens de integridade).

---

### 2. Suíte de Testes Automatizados (Zero-Testes Fechado)

Suíte de testes automatizados executável via Vitest com 16 testes (cobrindo os 15 obrigatórios + teste estrito de integridade de backup):
- `tests/auth.test.ts`: 1 teste de autenticação com credenciais válidas e inválidas.
- `tests/rls.test.ts`: 5 testes de RLS (vendedor isolado de cliente alheio para leitura e escrita, coordenador com visão dos vendedores geridos, proteção de compras/financeiro sobre dados comerciais e bloqueio de autopromoção de perfil).
- `tests/webhook.test.ts`: 7 testes de webhook (ausência de segredo 403, segredo inválido 403, webhook válido 200, idempotência por external_id, anti-replay > 5min rejeitado 400, processamento pelo worker, retry e classificação como `falha_definitiva` após 3 falhas).
- `tests/bling-readonly.test.ts`: 1 teste de varredura estática garantindo ausência de POST/PUT/PATCH/DELETE na API do Bling.
- `tests/ia-privacy.test.ts`: 1 teste de garantia de Zero PII enviado ao LLM ($ai.chat).
- `tests/backup-restore.test.ts`: 1 teste de restore com validação estrita de contagens antes e depois.

**Como rodar os testes**:
```bash
npm test
# ou em modo assistido
npm run test:watch
```

---

### 3. CI Mínimo (Integração Contínua)

O pipeline de CI está formalizado em `.github/workflows/ci.yml` e no script local executável `npm run ci` (`scripts/ci.sh`).

#### 3.1 Etapas do Pipeline
1. **Lint Estático**: `npm run lint` (Oxlint)
2. **Checagem de Tipos**: `npx tsc --noEmit`
3. **Testes Automatizados**: `npm test` (Vitest - 100% de aprovação)
4. **Build de Produção**: `npm run build` (Vite)

> **Nota de Conectividade do GitHub**:
> Como o repositório GitHub ainda não se encontra integrado a este tenant de desenvolvimento, o arquivo `.github/workflows/ci.yml` foi versionado para execução imediata no momento da conexão do repositório remoto. Para demonstrar a eficácia em ambiente controlado agora, o comando `npm run ci` executa rigorosamente as mesmas fases em sequência.

#### 3.2 Evidência de Falha Proposital no CI e Restauração a Verde
Para comprovar que o pipeline atua como gatekeeper e rejeita código quebrado:
1. **Simulação de Falha**:
   - Inserida asserção quebrada proposital em teste (`expect(res.status).toBe(500)` onde o correto é `403`).
   - Resultado: Pipeline abortou com código de erro `exit 1` no estágio `[3/4] Testes Automatizados`, impedindo a homologação e o build de produção.
2. **Restauração**:
   - Asserção restaurada para o valor íntegro (`403`).
   - Resultado: Pipeline passou em todas as 4 etapas com status verde (`exit 0`).

---

### 4. Nomenclatura e Ciclo de Vida do Webhook (v0.0.35)

Em `webhook_logs`, a nomenclatura do ciclo de vida das mensagens recebidas foi padronizada:
- **Fluxo Normal**: `pendente` → `processando` → `processado`
- **Fluxo de Falha**:
  - Tentativas 1 e 2: backoff com status `pendente` (intervalos de 5s, 30s, 2min).
  - Tentativa 3 (esgotada): o status é alterado para **`falha_definitiva`** (em vez de permanecer indefinidamente como 'pendente'). O registro é preservado integralmente para auditoria e intervenção operacional.

---

### 5. Status dos Bloqueadores da Auditoria v0.0.29

| Item | Descrição | Status v0.0.35 | Evidência de Fechamento |
| :--- | :--- | :--- | :--- |
| **P0-1** | Autenticação de origem do webhook | Fechado (v0.0.34) | Header `X-Webhook-Secret` + `webhook_whatsapp.js` |
| **P0-7** | Política de Backup + Restore | **Fechado (v0.0.35)** | Cron `backup_diario.js`, RPO/RTO documentados, teste de restore com contagens idênticas |
| **Zero-Testes** | Ausência de testes automatizados | **Fechado (v0.0.35)** | Suíte Vitest com 16 testes cobrindo auth, rls, webhook, bling e IA passando 100% |

---

## 🔐 Webhook WhatsApp — Hardening e Autenticação de Origem (v0.0.34)

O endpoint de webhook de WhatsApp (`POST /backend/v1/whatsapp/webhook`) implementa autenticação de origem por segredo compartilhado (P0-1) e retry/processamento assíncrono em segundo plano (P1-2).

### 1. Configuração do Segredo (`WEBHOOK_SECRET`)

O segredo compartilhado pode ser configurado de duas formas (com precedência para variável de ambiente):
1. **Variável de ambiente**: `WEBHOOK_SECRET` no servidor/ambiente Skip Cloud.
2. **Fallback no banco**: Campo `webhook_secret` na coleção `integracoes_config` (gerenciado por administradores com perfil `ceo_financeiro`).

> **Comportamento Fail-Secure**: Se o segredo não estiver configurado nem no ambiente nem na coleção `integracoes_config`, o endpoint recusa **todas** as requisições com código **HTTP 403 Forbidden**.

### 2. Envio do Header pelo Provedor

Todas as chamadas para o webhook devem conter o header:
```http
X-Webhook-Secret: <SEU_SEGREDO_CONFIGURADO>
```

Se o header estiver ausente ou o valor informado for inválido, o endpoint rejeita a requisição imediatamente com **HTTP 403 Forbidden** (sem ler o payload ou criar registros).

### 3. Exemplos de Configuração por Provedor (sem HMAC)

O endpoint aceita payloads em formato padrão JSON. Veja como configurar os headers customizados em provedores populares:

#### Twilio
Configure a URL do Webhook no Twilio Console (Phone Numbers > Manage > Active Numbers > Messaging):
- **URL**: `https://<dominio-backend>/backend/v1/whatsapp/webhook`
- **HTTP Method**: `POST`
- **Headers adicionais**: Na configuração do Twilio Studio ou webhook de mensagens via TwiML Bin/Functions, inclua o header HTTP `X-Webhook-Secret: <seu_secret>`.
- Exemplo de payload:
```json
{
  "external_id": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "timestamp": 1759068000000,
  "from": "whatsapp:+5511999999999",
  "to": "whatsapp:+5511988888888",
  "body": "Gostaria de solicitar um orçamento para telhas"
}
```

#### Zenvia
No portal da Zenvia (Canais > WhatsApp > Webhooks):
- **URL**: `https://<dominio-backend>/backend/v1/whatsapp/webhook`
- **Headers customizados**: Adicione o par chave-valor:
  - Header: `X-Webhook-Secret`
  - Valor: `<seu_secret>`
- Exemplo de payload:
```json
{
  "id": "zenvia-msg-12345",
  "timestamp": 1759068000000,
  "from": "5511999999999",
  "to": "5511988888888",
  "message": {
    "text": "Qual o valor do metro quadrado?"
  }
}
```

#### 360dialog (WhatsApp Cloud API Partner)
No painel de parceiro da 360dialog (Client Hub > Webhooks):
- **URL**: `https://<dominio-backend>/backend/v1/whatsapp/webhook`
- **Custom Headers**: Configure `X-Webhook-Secret: <seu_secret>`
- Exemplo de payload:
```json
{
  "external_id": "wamid.HBgL...",
  "timestamp": 1759068000000,
  "remetente": "5511999999999",
  "destinatario": "5511988888888",
  "texto": "Bom dia, vocês entregam em Campinas?"
}
```

### 4. Ciclo de Vida e Retry Assíncrono

1. **Recepção (Síncrona)**:
   - Valida `X-Webhook-Secret` (403 se ausente/inválido).
   - Valida `timestamp` anti-replay (400 se diferença > 5 minutos).
   - Verifica idempotência (200 sem duplicar se `external_id` já existir).
   - Enfileira no log com status `pendente` e retorna **HTTP 200 Imediato** (`{ "status": "queued", "external_id": "..." }`).
2. **Processamento (Assíncrono via Cron Worker)**:
   - O worker agendado (`cronAdd` a cada minuto) seleciona registros com status `pendente` não bloqueados (`em_processamento = false`).
   - Bloqueia via lock (`em_processamento = true`), vincula cliente/vendedor, cria conversa e mensagem WhatsApp, e detecta intenção.
   - Sucesso: atualiza status para `processado`.
   - Falha: retenta em até 3 ciclos com intervalos escalonados (5s, 30s, 2min).
   - Persistência: caso esgote as 3 tentativas, o registro permanece com status `pendente` para investigação e auditoria (nunca é deletado).
