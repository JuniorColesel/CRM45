# Relatório de Diagnóstico OAuth Bling: Exposição de Redirect URI (v0.0.70)

**Data:** 18 de Maio de 2026  
**Versão:** v0.0.70  
**Módulo:** Bling ERP (`/bling`) & Backend (`/backend/v1/bling/*`)  
**Status do QA:** Aprovado

---

## 1. Contexto do Problema

Durante a tentativa de conexão OAuth com o Bling ERP no CRM Colesel 45, o popup de autorização abria normalmente e permitia o login no Bling, mas a autorização nunca retornava o callback ao CRM (ou seja, o popup não recebia o `code`).

Esse sintoma é característico de divergência entre a **Redirect URI** cadastrada no aplicativo do Bling (no painel de desenvolvedor/aplicativos API do Bling) e a **Redirect URI** efetivamente enviada pelo backend do CRM durante a montagem da URL de autorização (`auth_url`). Quando as URLs divergem ou apontam para outro ambiente, o Bling pode redirecionar para outra aplicação ou rejeitar silenciosamente o callback.

---

## 2. Por que expor a `redirect_uri` no Diagnóstico do CEO?

1. **A Redirect URI NÃO é um segredo:** Conforme a especificação OAuth 2.0 (RFC 6749), o parâmetro `redirect_uri` é um parâmetro público que trafega em texto claro na query string da URL de autorização do navegador (`https://www.bling.com.br/Api/v3/oauth/authorize?...&redirect_uri=...`).
2. **Segurança mantida a 100%:** NENHUM segredo confidencial é exposto. `client_secret`, `access_token` e `refresh_token` continuam estritamente protegidos no servidor, nunca retornados nas APIs nem renderizados no cliente.
3. **Transparência e Autonomia Operacional:** O CEO pode visualizar na tela exatamente qual URL o backend do CRM está usando como destino de retorno e comparar diretamente com o valor cadastrado no painel de desenvolvedor do Bling ERP.

---

## 3. O Que Mudou nesta Versão (v0.0.70)

### 3.1 Backend (`pocketbase/hooks/bling_importar.js`)

- Criada a função de resolução compartilhada `resolverRedirectUri()`:
  - **1ª prioridade (Secret):** lê a variável `BLING_REDIRECT_URI` via `$os.getenv` ou `$secrets.get`. Se presente, retorna `{ uri, origem: 'secret' }`.
  - **2ª prioridade (Fallback):** lê `SITE_URL` ou `PB_INSTANCE_URL`, remove barra final e adiciona `/backend/v1/bling/callback`. Retorna `{ uri, origem: 'fallback_site_url' }`.
  - **3ª prioridade (Não configurada):** se nenhuma das variáveis estiver presente, retorna `{ uri: '', origem: 'nao_configurada' }`.
- Atualizado o endpoint de status seguro `GET /backend/v1/bling/status`:
  - Agora retorna dois novos campos seguros:
    - `redirect_uri_efetiva`: string com a URL exata calculada;
    - `redirect_uri_origem`: `'secret'` | `'fallback_site_url'` | `'nao_configurada'`.
- Nenhuma outra lógica foi alterada: geração de state anti-CSRF, troca de token no `/callback`, rotas de disconnect e sincronização permanecem idênticas.

### 3.2 Frontend (`src/pages/BlingPage.tsx`)

- Na seção **Diagnóstico da Conexão (Somente CEO)**:
  - Adicionado card dedicado **"Redirect URI em uso"**, com exibição da origem (`Secret`, `Fallback` ou `Não configurada`).
  - Badge de comparação automática em tempo real:
    - `✓ igual à esperada` (verde): quando `redirect_uri_efetiva === window.location.origin + '/backend/v1/bling/callback'`.
    - `⚠ difere do esperado` (amarelo/âmbar): quando o valor difere, exibindo alerta explicativo e o valor esperado pelo navegador atual com botão de cópia com 1 clique (`Copiar esperada`).
    - `⚠ não configurada` (amarelo/âmbar): caso o backend não tenha encontrado URL válida.
  - Botão `Copiar efetiva` para facilitar a colagem e inspeção técnica.

### 3.3 Testes Automatizados (`tests/bling-oauth.test.ts` e `tests/bling-v0067-modulo.test.ts`)

- `tests/bling-oauth.test.ts`: valida que o endpoint `/backend/v1/bling/status` expõe `redirect_uri_efetiva` e `redirect_uri_origem` sem expor segredos (`client_id`, `client_secret`, `access_token`, `refresh_token`).
- `tests/bling-v0067-modulo.test.ts`: valida a presença de todos os elementos visuais de diagnóstico e comparação no `BlingPage.tsx`.

---

## 4. Instruções para o CEO Comparar com o Painel do Bling

Para corrigir definitivamente o redirecionamento do OAuth do Bling:

1. Acesse o CRM Colesel 45 e faça login com perfil **CEO / Financeiro**.
2. No menu lateral, acesse **Bling ERP** (`/bling`).
3. Role a página até a seção **Diagnóstico da Conexão (Somente CEO)**.
4. Localize o bloco **Redirect URI em uso**:
   - Observe o **Valor efetivo enviado ao Bling** e a **Origem** informada.
   - Caso apareça o badge `⚠ difere do esperado`, clique no botão **"Copiar esperada"**.
5. Abra o painel do Bling em outra aba:
   - Acesse **Configurações (ícone de engrenagem) > Sistema > Extensões / Aplicativos API** (ou **Bling API v3 / Aplicativos Cadastrados**).
   - Localize o aplicativo criado para o CRM Colesel 45.
   - Verifique o campo **URL de Redirecionamento (Callback URI)**:
     - Ela DEVE ser idêntica ao valor indicado no CRM:
       `https://<dominio-do-crm>/backend/v1/bling/callback`
   - Se estiver com o endereço de outro sistema ou domínio de teste antigo, substitua colando a URL esperada copiada do CRM e salve a aplicação no Bling.
6. Volte à página do Bling no CRM e clique em **CONECTAR AO BLING** (ou **RECONECTAR**):
   - Faça login no Bling e confirme a autorização.
   - O popup completará o handshake com sucesso e exibirá a confirmação verde!
