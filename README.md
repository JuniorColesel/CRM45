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
