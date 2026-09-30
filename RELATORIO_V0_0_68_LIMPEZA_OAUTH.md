# Relatório de Execução — v0.0.68: Limpeza do Estado OAuth Bling + Desativação de Fallbacks Legados

**Data de Execução:** 30 de Setembro de 2026  
**Ambiente:** CRM Colesel 45 (Skip Cloud / PocketBase v0.36 + Vite / React)  
**Status do QA:** Aprovado (Lint, TypeScript, Testes Vitest 17/17, Build)

---

## 1. Resumo Executivo

Na versão anterior (v0.0.67), tentativas de autorização OAuth real com o Bling falharam porque a Redirect URI no painel do Bling não correspondia à URL do backend. Após o ajuste manual da Redirect URI pelo usuário, foi realizada a limpeza completa do estado transitório OAuth e a remoção definitiva de todos os caminhos de fallback legados (tokens manuais/secrets antigos) no backend e no frontend, garantindo que o CRM opere de forma estrita e exclusivamente através do protocolo OAuth 2.0 (v3) com credenciais gerenciadas nos secrets do servidor.

---

## 2. Registros Removidos (Limpeza de Estado)

Foi criada e executada com sucesso a **Migração 0031** (`pocketbase/migrations/0031_limpeza_oauth_bling.js`), garantindo:

- **`bling_oauth_states`:** 15 registros órfãos (states expirados/não concluídos com `used_at` vazio) foram completamente removidos (`truncate`). A coleção encontra-se agora com **0 registros**.
- **`bling_connections`:** Garantido estado vazio com **0 registros**, eliminando qualquer conexão residual ou tokens obsoletos.
- **Integridade dos Demais Dados:**
  - Coleção `clientes`: 100% preservada (inclusive campo `bling_id` e históricos).
  - Coleção `bling_sync_logs`: 100% preservada.
  - Coleções de backup, metas, usuários, campanhas: intactas.

---

## 3. Fallbacks Legados Desativados no Backend

Arquivo: `pocketbase/hooks/bling_importar.js`

1. **Remoção de leitura de fallback de token em `integracoes_config`:**
   - No motor de sincronização (`POST /backend/v1/bling/sincronizar`): removida a leitura de `records[0].getString('bling_token')`.
   - Na rota auxiliar de importação (`POST /backend/v1/bling/importar`): removida a leitura de `records[0].getString('bling_token')`.
2. **Remoção de leitura de secrets legados de ambiente:**
   - Removida a busca por `$secrets.get('BLING_TOKEN') || $secrets.get('BLING_API_KEY')` em ambos os fluxos operacionais.
3. **Comportamento quando não conectado via OAuth:**
   - Em vez de buscar tokens silenciosamente no banco ou nos secrets antigos, o backend agora retorna erro explícito HTTP 400 com mensagem clara e direcionada:
     - `"Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar."`
     - `"Conecte o CRM ao Bling via OAuth em /bling antes de importar dados."`
4. **Alinhamento na rota de status (`GET /backend/v1/bling/status`):**
   - Removida a checagem que retornava `tipo_autenticacao: 'legado'`. Agora informa estritamente `'oauth_v3'` como arquitetura suportada.
5. **Hook `integracoes_config_save.js`:**
   - Removida a persistência do campo `bling_token` via API operacional. O campo permanece na definição da tabela no banco para compatibilidade de schema (deprecated, não destrutivo), mas não aceita mais gravações pelo endpoint de configurações.

---

## 4. Limpeza de Estado no Frontend

Arquivos: `src/pages/BlingPage.tsx` e `src/lib/bling/iniciarConexaoBling.ts`

- Ao montar a página `/bling` e antes de disparar `iniciarConexaoBling()`, é feita uma varredura preventiva e proativa removendo chaves de `localStorage` e `sessionStorage` que pudessem reter estados de popup, flags de autorização pendente ou tokens legados (`crm_colesel45_bling_aguardando`, `crm_colesel45_bling_oauth_state`, `crm_colesel45_bling_popup`, `bling_oauth_state`, `bling_token`, `STORAGE_BLING_TOKEN`).
- O frontend mantém estritamente a regra de nunca salvar nem receber tokens de acesso ou de atualização no navegador.

---

## 5. Auditoria de Segurança e Secrets

1. **Isolamento entre Backup R2 e Bling:**
   - **Confirmação:** Nenhum arquivo ou função do módulo Bling (`bling_importar.js`, `iniciarConexaoBling.ts`, `BlingPage.tsx`) lê ou acessa variáveis/secrets do Cloudflare R2 (`BACKUP_S3_*`).
   - **Confirmação:** Nenhum hook de backup (`backup_create.js`, `backup_diario.js`, `backup_download.js`, `backup_list.js`, `backup_restore.js`) lê ou faz referência a variáveis/secrets do Bling (`BLING_*`).
   - Não há qualquer cruzamento de escopo ou credenciais entre os subsistemas.
2. **Origem dos Dados em `/backend/v1/bling/connect`:**
   - Confirmado que `client_id` e `redirect_uri` são obtidos **exclusivamente** através de variáveis de ambiente/secrets seguros do servidor (`BLING_CLIENT_ID`, `BLING_REDIRECT_URI`), nunca de parâmetros recebidos do cliente, de tabelas legadas ou de storage local.

---

## 6. Resultado da Suíte de QA e Testes

- **OxLint / ESLint:** 0 erros, código em conformidade.
- **TypeScript (`tsc`):** 0 erros de compilação.
- **Vitest:** 17 suítes aprovadas, incluindo teste específico que valida que o fallback legado NÃO ocorre e que mensagens adequadas são emitidas sem OAuth configurado.
- **Vite Build:** Build de produção gerado com sucesso.
- **Migrações e Hooks:** Aplicados e validados no backend Skip Cloud PocketBase.

---

## 7. Instruções para o Teste Real pelo Usuário

Como o ambiente do agente não realiza chamadas de rede externas para autorização real com o Bling (garantindo a política de não causar incidentes), o teste de ponta a ponta deve ser executado no navegador:

1. Acesse o CRM Colesel 45 com a conta de **CEO / Financeiro** (`junior.colesel@coleselengenharia.com` ou `alice.colesel@coleselengenharia.com`).
2. Acesse a rota **/bling** (pelo menu lateral ou em Configurações → Bling ERP).
3. Verifique que o status inicial exibe o badge **"Desconectado"**.
4. Clique no botão **"Conectar ao Bling"**.
5. O popup neutro abrirá e redirecionará com segurança para a página oficial de autorização do Bling ERP (`https://www.bling.com.br/Api/v3/oauth/authorize?...`).
6. Faça login no Bling e clique em **Autorizar**.
7. O popup fechará automaticamente após exibir a mensagem de sucesso e o CRM atualizará o badge para **"Conectado (OAuth v3 Ativo)"**.
8. Na mesma página `/bling`, clique no botão **"Sincronizar Agora"** e aguarde o processamento.
9. Repita a sincronização uma segunda vez (**"Sincronizar Agora"**) para validar a idempotência e certificar-se de que nenhum cliente duplicado é criado.
