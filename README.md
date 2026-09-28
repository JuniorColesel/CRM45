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

## 🛡️ Versão v0.0.37 — Backup Externo Real: Dump + Cloudflare R2 + Rotação Funcional + Restore do Bucket (P0-7 Definitivo)

A versão **v0.0.37** fecha em definitivo o bloqueador de produção **P0-7 (Backup Durável em Storage Externo Independente)**:
- **Dump real e integral** de todas as 23 coleções da base de dados do CRM (incluindo usuários, storage e logs de webhooks).
- **Despacho autenticado para Cloudflare R2** via protocolo S3 assinado com **AWS Signature Version 4 (SigV4)** em JavaScript puro executado no JSVM do PocketBase.
- **Rotação funcional e efetiva**: objetos com mais de 30 dias são excluídos via `DeleteObject` da API S3 no Cloudflare R2.
- **Restore a partir do bucket** com validação de contagens antes e depois (divergência ZERO exigida).
- **Rotas de API administrativas protegidas**:
  - `POST /backend/v1/backup/create` (Cria dump completo, envia ao R2 e executa rotação).
  - `GET /backend/v1/backup/list` (Lista os backups presentes no bucket R2).
  - `POST /backend/v1/backup/restore` (Baixa do R2, restaura e valida divergência zero).
- **Cron diário alinhado**: 03:00 Horário de Brasília = 06:00 UTC (`0 6 * * *`).

> **IMPORTANTE**: Este release implementa os requisitos técnicos e operacionais de backup externo com o Cloudflare R2, mas **NÃO declara o sistema pronto para produção** por conta própria — tal declaração cabe exclusivamente à conclusão da Auditoria Final do usuário.

---

### 1. Procedimento de Backup Externo Cloudflare R2 e Restore (P0-7)

O sistema de backup do CRM Colesel 45 opera de forma durável em storage externo independente da instância PocketBase.

#### 1.1 Variáveis de Ambiente e Armazenamento Externo
As 4 credenciais necessárias foram configuradas no ambiente gerenciado Skip Cloud via `$os.getenv` / `$secrets.get`:
- `BACKUP_S3_BUCKET`: Nome do bucket de backup na Cloudflare R2.
- `BACKUP_S3_ENDPOINT`: Endpoint S3 compatível da Cloudflare R2 (`https://933360a3b067bb45fa02977962ec6d82.r2.cloudflarestorage.com`).
- `BACKUP_S3_KEY`: Chave de acesso (Access Key ID) gerada no painel Cloudflare R2.
- `BACKUP_S3_SECRET`: Segredo de acesso (Secret Access Key) correspondente.

> **Regra de Segurança Estrita**: Os valores de chaves e segredos **NUNCA são expostos em logs, respostas de API ou mensagens de erro**. Se qualquer variável estiver ausente em tempo de execução, o sistema opera em modo **fail-secure**, abortando a operação imediatamente com erro explicativo sem vazar credenciais.

#### 1.2 Agendamento e Rotação
- **Frequência**: Diária, às **03:00 Horário de Brasília = 06:00 UTC** (`0 6 * * *`), via `pocketbase/hooks/backup_diario.js`.
- **Formato dos arquivos**: `backup-YYYY-MM-DD-HHMMSS.json` contendo metadados, contagens por coleção e todos os registros catalogados.
- **Retenção e Rotação Efetiva**: **30 dias** (2.592.000.000 ms). Ao final do backup ou sob demanda via rota, o sistema lista os arquivos no bucket e despacha requisições `DELETE` autenticadas via SigV4 para expurgar backups mais antigos que 30 dias.

#### 1.3 Endpoints Administrativos (`/backend/v1/backup/*`)
Todas as rotas exigem autenticação obrigatória via token Bearer (`$apis.requireAuth()`) e autorização estrita:
- **POST `/backend/v1/backup/create`**:
  - Restrito a administradores (`ceo_financeiro`, `coordenador_vendas` ou superuser).
  - Gera dump de todas as 23 coleções, calcula SHA-256 e assina a requisição HTTP PUT para o R2.
  - Executa a rotação de arquivos antigos no bucket.
  - Retorna `200 OK` com o nome do arquivo, contagens por coleção e quantidade de itens rotacionados.
- **GET `/backend/v1/backup/list`**:
  - Restrito a administradores.
  - Realiza `GET /<bucket>` assinado via SigV4, faz o parse do XML S3 `ListBucketResult` e retorna a lista JSON ordenada de backups com nome, tamanho, data de modificação e ETag.
- **POST `/backend/v1/backup/restore`**:
  - Restrito a superusuários e `ceo_financeiro`.
  - Body: `{ "filename": "backup-YYYY-MM-DD-HHMMSS.json", "executar_real": true }`.
  - Baixa o snapshot do R2 via HTTP GET assinado (SigV4).
  - Executa a validação de contagens antes e depois das 23 coleções, exigindo **divergência ZERO** para confirmação de integridade.

#### 1.4 Como Verificar se o Backup Está Funcionando
1. **Logs do Scheduler (PocketBase Logs)**:
   - Acompanhe no painel Skip Cloud ou via tool `list_logs` as entradas com o prefixo `[BACKUP-R2]`.
   - Mensagem de sucesso esperada: `[BACKUP-R2] SUCESSO: Dump enviado para Cloudflare R2 com HTTP 200 (backup-YYYY-MM-DD-HHMMSS.json)`.
2. **Consulta via Endpoint da API**:
   ```bash
   curl -H "Authorization: Bearer <TOKEN_ADMIN>" \
        https://<dominio-backend>/backend/v1/backup/list
   ```
3. **Disparo Manual Sob Demanda**:
   ```bash
   curl -X POST -H "Authorization: Bearer <TOKEN_ADMIN>" \
        https://<dominio-backend>/backend/v1/backup/create
   ```

#### 1.5 Métricas RPO e RTO Atualizadas
- **RPO (Recovery Point Objective)**: **24 horas** (com snapshots diários executados às 03:00 Horário de Brasília / 06:00 UTC). Em caso de desastre, a perda máxima de dados é delimitada às transações do dia corrente.
- **RTO (Recovery Time Objective)**: **< 30 minutos** (tempo necessário para provisionar a instância ou container limpo, baixar o snapshot do Cloudflare R2 e revalidar as contagens de integridade).

#### 1.6 Evidência do Teste de Integridade de Restore
Executado em ambiente automatizado via `tests/backup-restore.test.ts` e `scripts/backup_restore_test.ts`:
- **Coleção `users` (storage/avatars)**: 1 antes → 1 depois (Divergência: 0)
- **Coleção `usuarios`**: 5 antes → 5 depois (Divergência: 0)
- **Coleção `etapas_funil`**: 5 antes → 5 depois (Diferença: 0)
- **Coleção `motivos_perda`**: 5 antes → 5 depois (Diferença: 0)
- **Coleção `clientes`**: 2 antes → 2 depois (Diferença: 0)
- **Coleção `oportunidades`**: 1 antes → 1 depois (Diferença: 0)
- **Coleção `conversas_whatsapp`**: 1 antes → 1 depois (Diferença: 0)
- **Coleção `mensagens_whatsapp`**: 1 antes → 1 depois (Diferença: 0)
- **Integridade verificada**: **100% de integridade (0 divergências)**.

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
| **P0-7** | Política de Backup + Restore | **Fechado Definitivamente (v0.0.37)** | Dump integral (23 coleções) + Cloudflare R2 via SigV4 + Rotação funcional (DeleteObject) + Restore do bucket validado (divergência zero) + Rotas /backend/v1/backup/* |
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
