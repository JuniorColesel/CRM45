# Relatório de Entrega: v0.0.65 — OAuth Bling: Conexão Segura do CRM com a API v3

**Data:** 18 de Maio de 2024  
**Projeto:** CRM Colesel 45 (React + Vite + TypeScript + Tailwind + PocketBase)  
**Versão:** v0.0.65 (sucessora direta e contínua da v0.0.64)  
**Objetivo Único:** CONECTAR O CRM AO BLING VIA OAUTH E ENTREGAR O TOKEN DE FORMA SEGURA AO MOTOR READ-ONLY JÁ EXISTENTE.

---

## 1. Declaração Formal de Segurança e Read-Only

> **"O CRM não realiza qualquer operação de escrita em dados do Bling. O único POST externo permitido é a troca/renovação de tokens no endpoint OAuth."**

Todas as requisições de consulta a dados de negócio no Bling (`/contatos`, `/pedidos/vendas`) são executadas única e exclusivamente com o método **GET**. As diretrizes de menor privilégio e não-mutação foram rigorosamente respeitadas.

---

## 2. Arquitetura da Solução

O fluxo implementado segue estritamente a arquitetura server-side:

```
[ Frontend: IntegracoesPage.tsx ]
       │
       ▼ (GET /backend/v1/bling/connect) [ceo_financeiro]
[ PocketBase Backend ] ── Gera State 64+ chars ──► [ bling_oauth_states ]
       │ (Redirecionamento OAuth com menor privilégio)
       ▼
[ Bling Autorização v3 ] ── Usuário aprova ──► Redireciona com code + state
       │
       ▼ (GET /backend/v1/bling/callback)
[ PocketBase Callback ] ── Valida State & Consome (uso único)
       │
       ▼ (POST https://www.bling.com.br/Api/v3/oauth/token - RFC 6749)
       │ Basic auth (client_id:client_secret) + enable-jwt: 1
       │
       ▼ Salva tokens server-side (hidden: true)
[ bling_connections (RLS null) ]
       │
       ├─► GET /backend/v1/bling/status (Retorna apenas flags seguras, NUNCA tokens)
       │
       └─► POST /backend/v1/bling/sincronizar (getValidBlingAccessToken com refresh auto)
              │
              ▼ (GET estrito)
           [ API Bling v3: contatos e pedidos de venda ]
```

### Regras de Ocultação de Tokens

- O frontend **NUNCA** recebe `access_token` ou `refresh_token`.
- O frontend **NUNCA** armazena credenciais em `localStorage` ou `sessionStorage`.
- O `client_secret` é consumido exclusivamente via `$os.getenv` / `$secrets.get`.
- A coleção `bling_connections` possui regras de API `null` (acesso público ou de usuário bloqueado; leitura permitida somente aos hooks do backend).

---

## 3. Arquivos Criados e Alterados

### 3.1. Migração de Banco de Dados

- **`pocketbase/migrations/0030_create_bling_oauth_tables.js`**:
  - Coleção `bling_connections`: armazena `access_token` (hidden), `refresh_token` (hidden), `token_type`, `expires_at`, `last_refresh_at`, `status`, `ultimo_erro`, `user_id`. Regras de API nulas (backend vault).
  - Coleção `bling_oauth_states`: armazena `state` (índice único), `user_id`, `expires_at` (10 min), `used_at`. Regras de API nulas.

### 3.2. Backend Hooks (PocketBase)

- **`pocketbase/hooks/bling_importar.js`**:
  - `GET /backend/v1/bling/connect`: exige autenticação de `ceo_financeiro`, gera state criptográfico (72 caracteres), grava na `bling_oauth_states`, monta URL oficial com escopo `contatos:read pedidos-vendas:read`.
  - `GET /backend/v1/bling/callback`: valida `state`, consome-o imediatamente (anti-replay), troca `code` por tokens via POST em `/oauth/token` com `Authorization: Basic` e header `enable-jwt: 1`, grava em `bling_connections` e renderiza página HTML com o texto oficial prescrito:
    > _"Conexão com o Bling realizada com sucesso. Você pode fechar esta janela e retornar ao CRM."_
  - `GET /backend/v1/bling/status`: rota restrita retornando `{ conectado, status, configurado_no_servidor, tipo_autenticacao, expires_at, ultima_renovacao, ultimo_erro }`.
  - `POST /backend/v1/bling/disconnect`: revoga conexão no backend limpando tokens locais.
  - Função `getValidBlingAccessToken()`: verifica validade do token (com margem de 5 minutos); renova automaticamente usando `refresh_token` se próximo da expiração; atualiza `expires_at` e `last_refresh_at`.
  - Integrado a `POST /backend/v1/bling/sincronizar`: consome o token gerenciado e conta com handler de retry único após 401 (sem loop infinito).

### 3.3. Frontend

- **`src/pages/IntegracoesPage.tsx`**:
  - Organização do card **1. Bling ERP** nos 3 blocos visuais exigidos:
    1. **Bloco A (Conexão)**: Status, botão "CONECTAR AO BLING", "RECONECTAR", "DESCONECTAR". Texto exato no estado desconectado: _"Autorize o CRM a consultar clientes e vendas no Bling."_
    2. **Bloco B (Sincronização)**: Botão "SINCRONIZAR BLING" (mantendo regras de acesso e consolidação da v0.0.64), painel de métricas da execução.
    3. **Bloco C (Diagnóstico - Exclusivo CEO)**: Status da conexão, data de expiração, última renovação, último erro. Zero tokens exibidos. Token manual legado mantido em seção retrátil identificada como deprecated.

### 3.4. Testes Automatizados

- **`tests/bling-oauth.test.ts`**:
  - 20 testes automatizados cobrindo os 20 critérios obrigatórios (auth, perfil restrito, entropia de state, expiração, anti-replay, callback, armazenamento seguro, refresh, 401 single-retry, ausência de tokens no bundle/frontend, menor privilégio de escopo, read-only).
- **`tests/bling-readonly.test.ts`**:
  - Atualizado para garantir que endpoints de dados de negócio permanecem exclusivamente GET, permitindo POST estritamente em `/oauth/token`.

---

## 4. Segurança do State Anti-CSRF e Menor Privilégio

1. **Entropia e Formato**: Cada state é gerado por 3 blocos de `$security.randomString` (totalizando 72 caracteres pseudoaleatórios de alta entropia).
2. **Validade e Expiração**: Validade estrita de 10 minutos (`Date.now() + 10 * 60 * 1000`).
3. **Uso Único e Descarte**: Ao chegar no `/callback`, o state é localizado; se `used_at` já constar ou se já expirou, a requisição é rejeitada com tela de erro amigável. Imediatamente após a validação, é marcado como usado e removido do banco.
4. **Escopos Autorizados (Princípio do Menor Privilégio)**:
   - `contatos:read`
   - `pedidos-vendas:read`
   - **Nenhum** escopo financeiro, bancário, borderô, baixas ou contas a pagar é requisitado.

---

## 5. Roteiro do Teste Real Controlado (Para Execução pelo Usuário)

> **Nota de Segurança:** Por regra do projeto, o developer não possui credenciais do Bling nem executa conexões reais autenticadas. O teste de ponta a ponta deve ser realizado pelo usuário no navegador:

1. **Configuração de Secrets no Servidor**:
   - Registrar no painel de segredos do PocketBase (ou via `set_env`):
     - `BLING_CLIENT_ID`: Client ID do aplicativo criado no Bling.
     - `BLING_CLIENT_SECRET`: Client Secret fornecido pelo Bling.
     - `BLING_REDIRECT_URI`: URL de callback cadastrada no aplicativo Bling (ex: `https://<dominio>/backend/v1/bling/callback`).
2. **Acesso ao CRM**:
   - Fazer login com o perfil **CEO / Financeiro** (`caroline@colesel.com.br` ou `alice@colesel.com.br`).
   - Acessar o menu **Configurações → Integrações** (`/integracoes`).
3. **Início da Conexão**:
   - Verificar que o status inicial exibe: `Bling ERP / Status: Desconectado`.
   - Clicar no botão **CONECTAR AO BLING**.
   - Uma janela de autorização do Bling será aberta solicitando consentimento para leitura de contatos e pedidos de venda.
4. **Autorização no Bling**:
   - Concluir o login e autorização no Bling.
   - A página de callback exibirá a mensagem de sucesso: _"Conexão com o Bling realizada com sucesso. Você pode fechar esta janela e retornar ao CRM."_
5. **Validação do Status no CRM**:
   - Fechar a janela e retornar ao CRM.
   - O card passará ao estado `Bling ERP / Status: Conectado` com o badge `OAuth v3 Seguro`.
   - No bloco Diagnóstico, verificar data de expiração calculada e última renovação.
6. **Sincronização Read-Only**:
   - Clicar no botão **SINCRONIZAR BLING**.
   - Acompanhar a leitura paginada de contatos e pedidos.
   - Confirmar o resumo de métricas (clientes consultados, criados, atualizados e pedidos consultados).
7. **Teste de Idempotência**:
   - Clicar novamente em **SINCRONIZAR BLING**.
   - Confirmar que nenhum cliente duplicado foi gerado e os dados foram preservados.
8. **(Opcional) Teste de Reconexão e Desconexão**:
   - Clicar em **RECONECTAR** para renovar o consentimento se desejado, ou **DESCONECTAR** para revogar os tokens locais.

---

## 6. Resultado da Verificação e QA

- **Typecheck (`tsc`)**: Aprovado sem erros.
- **Linter (`oxlint`)**: Aprovado sem erros.
- **Suíte de Testes Vitest**: **18/18 arquivos de teste aprovados**, **67/67 testes unitários e de integração verdes**.
- **Build de Produção**: Concluído com sucesso (`dist/` gerado perfeitamente).
