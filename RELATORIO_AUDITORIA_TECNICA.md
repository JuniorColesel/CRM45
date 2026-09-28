# Relatório de Auditoria Técnica — Colesel CRM

## Resumo Executivo

- **Versão atual do aplicativo:** `0.0.28` (conforme `package.json:5`).
- **Data da auditoria:** 28 de Setembro de 2026.
- **Risco Geral da Aplicação:** **CRÍTICO**.
- **Segurança para Produção:** **NÃO APTO**.
- **Quantidade de achados por severidade:**
  - **CRÍTICO:** 5 achados
  - **ALTO:** 7 achados
  - **MÉDIO:** 6 achados
  - **BAIXO:** 4 achados
- **Itens que bloqueiam go-live:** **7 itens bloqueadores obrigatórios**.

### Top 10 Achados Mais Importantes (ordenados por gravidade)

1. **Credenciais e tokens em `localStorage` com trânsito frontend-backend inseguro [CRÍTICO]:** Tokens de API de provedor WhatsApp (Zenvia/Twilio), senhas SMTP de e-mail e tokens de API do Bling são salvos diretamente em texto puro no `localStorage` do navegador do usuário (`src/pages/IntegracoesPage.tsx:160, 177, 194`). No envio de mensagens pelo módulo de Conversas (`src/pages/ConversasPage.tsx:395`), o frontend lê o token do `localStorage` e envia o token em texto puro no corpo da requisição HTTP POST para `/backend/v1/enviar_whatsapp`.
2. **Endpoint de Webhook público sem autenticação e sem assinatura de provedor [CRÍTICO]:** O endpoint `POST /backend/v1/webhook_whatsapp` (`pocketbase/hooks/webhook_whatsapp.js:18`) é 100% público, não possui validação de assinatura HMAC/secret de nenhum provedor (Zenvia, Twilio, 360dialog, Meta), permitindo que qualquer invasor forje mensagens de clientes, crie registros espúrios de clientes rascunho e dispare oportunidades e follow-ups em massa sem controle.
3. **Falta de Idempotência e Tratamento de Replay no Webhook [CRÍTICO]:** O endpoint `POST /backend/v1/webhook_whatsapp` não armazena nem valida identificadores únicos de mensagens do provedor (`message_id` ou `event_id`). Se a mesma notificação HTTP for entregue 2 vezes (situação comum de retentativa de rede em webhooks), criam-se 2 registros na coleção `mensagens_whatsapp`, 2 follow-ups na coleção `ligacoes` e a integridade de métricas do CRM é corrompida.
4. **Vulnerabilidade de IDOR / Quebra de Isolamento em Leitura de Clientes [CRÍTICO]:** Na coleção `clientes`, as regras de acesso `listRule` e `viewRule` (`@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil != 'compras_grandes_clientes' || grande_cliente = true)`) permitem que qualquer vendedor (`vendedor_1` ou `vendedor_2`) visualize a lista completa e os detalhes de qualquer cliente da empresa no banco. O isolamento de carteira só existe no frontend via filtro opcional (`construirFiltroEscopo` em `src/services/painelService.ts`), permitindo que um vendedor contorne a restrição manipulando as chamadas à API REST do PocketBase.
5. **Transferência de dados pessoais (LGPD) para gateway de IA sem base legal nem anonimização [CRÍTICO]:** Ao sugerir respostas no endpoint `POST /backend/v1/sugerir_resposta_ia` (`pocketbase/hooks/sugerir_resposta_ia.js:201-235`), o backend injeta nome do cliente, telefone, empresa, compras anteriores, valor de negociação e as últimas 5 mensagens reais trocadas no WhatsApp diretamente no prompt do modelo de linguagem via Skip AI Gateway ($ai.chat), configurando trânsito externo e eventual transferência internacional de dados pessoais sensíveis sem mascaramento ou consentimento registrado.
6. **Integração Bling via API NÃO implementada [ALTO]:** Embora exista campo para token de API do Bling na interface (`src/pages/IntegracoesPage.tsx:374`), **nenhuma chamada HTTP para a API do Bling existe no código-fonte nem no backend**. A importação de clientes e compras opera exclusivamente via upload manual de planilhas CSV/TXT (`src/pages/ImportacaoPage.tsx`), gerando falsa sensação de integração ativa em tempo real.
7. **Ausência total de Fila Assíncrona e Dead-Letter Queue para Mensagens e Webhooks [ALTO]:** O webhook de WhatsApp processa todas as etapas sincronamente no corpo da requisição (busca no banco, criação de cliente, busca de vendedor, criação de oportunidade, criação de ligação). Se o banco travar ou atrasar, a resposta excede o timeout do provedor e gera loop de reenvio. No envio (`/backend/v1/enviar_whatsapp`), a chamada externa para a Zenvia é síncrona com timeout de 10s sem fila de retry.
8. **Inexistência de Política de Backup Automatizado, DR e Teste de Restauração no Código [ALTO]:** Não há rotinas programadas de backup, crons de snapshot ou procedimento de Disaster Recovery documentado ou versionado no repositório. O RPO e RTO dependem integralmente da infraestrutura gerenciada do Skip Cloud sem garantia operacional verificável no código.
9. **Zero Testes Automatizados [ALTO]:** Não existe um único arquivo de teste unitário, de integração ou ponta a ponta (`**/*.test.*` ou `**/*.spec.*` não encontrados). O script `"test"` no `package.json:17` é um stub: `echo "there are no tests for this project" && exit 0`. Nenhuma regra de segurança, RLS ou automação possui cobertura de regressão automatizada.
10. **Sobrecarga de memória e latência por consultas com `getFullList` [MÉDIO]:** Páginas cruciais como Painel, Relatórios e Conversas executam múltiplos `getFullList` sem paginação (`src/pages/ConversasPage.tsx:170`, `src/services/painelService.ts:299-453`, `src/pages/ImportacaoPage.tsx:580, 735`). À medida que a base crescer para milhares de contatos e mensagens, causará lentidão e alto consumo de memória no navegador.

---

## 1. Segurança de Credenciais — [CRÍTICO]

### a) Onde estão armazenadas as credenciais de integrações?

- As credenciais de integrações (Bling, WhatsApp, SMTP de e-mail e Gateway SMS) estão armazenadas no **`localStorage` do navegador do cliente**.
- Não há cofre de senhas (secrets manager), nem criptografia client-side ou armazenamento seguro em coleção protegida do PocketBase para essas credenciais de usuário/empresa.
- As únicas credenciais gerenciadas no ambiente de backend são as variáveis de infraestrutura do Skip Cloud (`SKIP_AI_GATEWAY_API_KEY`, `SKIP_AI_GATEWAY_URL`, `PB_SUPERUSER_TOKEN`), acessíveis via `$os.getenv` apenas em pb_hooks.

### b) Mapeamento exato de armazenamento de credenciais no código-fonte

A persistência em `localStorage` persiste integralmente na versão 0.0.28:

1. **Token da API Bling:**
   - **Arquivo:** `src/pages/IntegracoesPage.tsx`
   - **Linha de Leitura:** Linha 75 (`localStorage.getItem(STORAGE_BLING_TOKEN)`)
   - **Linha de Escrita:** Linha 160 (`localStorage.setItem(STORAGE_BLING_TOKEN, blingToken.trim())`)
   - **Tipo de Credencial:** Token Bearer / API Key da conta Bling ERP.
2. **Token e Telefone da API WhatsApp:**
   - **Arquivo:** `src/pages/IntegracoesPage.tsx`
   - **Linha de Leitura:** Linha 87 (`localStorage.getItem(STORAGE_WHATSAPP)`)
   - **Linha de Escrita:** Linha 177 (`localStorage.setItem(STORAGE_WHATSAPP, JSON.stringify(whatsappData))`)
   - **Tipo de Credencial:** Token de autenticação de provedor WhatsApp (ex.: Zenvia API Token, Twilio Token).
   - **Ponto de vazamento no fluxo de envio:** `src/pages/ConversasPage.tsx:260` lê do `localStorage`, e na linha 395 injeta o objeto `{ token, telefone, provedor }` diretamente no payload JSON enviado para a rota do backend `/backend/v1/enviar_whatsapp`.
3. **Credenciais SMTP e Gateway SMS:**
   - **Arquivo:** `src/pages/IntegracoesPage.tsx`
   - **Linha de Leitura:** Linha 105 (`localStorage.getItem(STORAGE_EMAIL_SMS)`)
   - **Linha de Escrita:** Linha 194 (`localStorage.setItem(STORAGE_EMAIL_SMS, JSON.stringify(emailSmsData))`)
   - **Tipo de Credencial:** Servidor SMTP, porta, usuário SMTP, **senha SMTP em texto puro** e identificador de gateway SMS.
4. **Configurações do Assistente de IA:**
   - **Arquivo:** `src/pages/IntegracoesPage.tsx`
   - **Linha de Leitura:** Linha 125 (`localStorage.getItem(STORAGE_ASSISTENTE_IA)`)
   - **Linha de Escrita:** Linha 211 (`localStorage.setItem(STORAGE_ASSISTENTE_IA, JSON.stringify(iaConfig))`)
   - **Tipo de Credencial/Configuração:** Prompts do sistema, toggles de exibição de preço e diretrizes de IA.

### c) Existe backend seguro para gerenciar credenciais ou o frontend chama direto?

- **NÃO EXISTE backend seguro para gerenciar credenciais de integrações.**
- Existe uma coleção no PocketBase chamada `canais_marketing` com campo `configuracao` (tipo JSON) criada na migração `0006_create_automacoes_mensagens_canais.js`, porém a tela `/integracoes` **não salva nem consulta** esta coleção. Salva unicamente no `localStorage` do navegador daquele computador específico.
- Consequência: Se o usuário abrir o CRM em outro navegador, em aba anônima ou em outro computador, todas as integrações configuradas desaparecem.
- Pior: No envio de WhatsApp, o frontend transporta a credencial no corpo do HTTP POST (`src/pages/ConversasPage.tsx:395`), trafegando o token da Zenvia a cada envio de mensagem.

### d) Classificação de Risco

- **Risco: CRÍTICO**. Armazenar tokens e senhas SMTP em `localStorage` expõe as chaves a qualquer script malicioso (XSS), extensões de navegador instaladas no cliente e compartilhamento indevido de máquina.

---

## 2. Integração Bling — [NÃO IMPLEMENTADO / SOMENTE IMPORTAÇÃO CSV]

### a) Como a importação está implementada hoje

- **A integração via API do Bling NÃO ESTÁ IMPLEMENTADA.**
- O frontend **NÃO** chama a API do Bling diretamente.
- O backend **NÃO** chama a API do Bling em nenhum pb_hook.
- A importação funciona **exclusivamente através do upload de arquivos CSV/TXT** na tela `/importacao` (`src/pages/ImportacaoPage.tsx:574-879`). O usuário precisa exportar manualmente uma planilha no painel do Bling ERP e subi-la no Colesel CRM.
- O token do Bling que o usuário digita na tela `/integracoes` (`src/pages/IntegracoesPage.tsx:383`) fica armazenado em `localStorage` e **nunca é utilizado em nenhuma chamada no sistema**.

### b) Importação manual ou automática?

- **Manual (clique e upload de arquivo).**
- Verificação de crons (`list_scheduled_jobs`): **Nenhum scheduled job / cron registrado no backend.** Não há sincronização periódica nem background sync.

### c) O app pode acidentalmente escrever no Bling (criar pedido, alterar cliente)?

- **NÃO.** O app não possui nenhuma conexão de rede com os servidores do Bling (`bling.com.br`). Conforme auditado minuciosamente na Seção 14, **não há nenhum método POST, PUT, PATCH ou DELETE** apontando para endpoints do Bling.

### d) Onde está o token do Bling?

- **Arquivo:** `src/pages/IntegracoesPage.tsx`
- **Linha:** Linha 75 (leitura) e Linha 160 (gravação no `localStorage` sob a chave `integracao_bling_token`).
- Não é referenciado em nenhum outro local do projeto.

### e) Classificação de Risco

- **Risco: MÉDIO**. Não há risco de corrupção ou escrita no Bling por ausência de conectividade. O risco reside no desalinhamento de expectativas do cliente (espera integração em tempo real e recebe importador manual de CSV) e na presença de um token órfão desnecessariamente exposto no `localStorage`.

---

## 3. Integração WhatsApp (Zenvia, Twilio, 360dialog, Infobip) — [FRÁGIL / PARCIALMENTE IMPLEMENTADO]

### a) A tela /conversas está implementada? Como conecta ao provedor?

- **Sim, a tela `/conversas` está implementada** (`src/pages/ConversasPage.tsx`, 1.576 linhas).
- **Entrada de Mensagens (Webhook):** Existe o endpoint de backend `POST /backend/v1/webhook_whatsapp` (`pocketbase/hooks/webhook_whatsapp.js:18`). Recebe o webhook externo do provedor, localiza o cliente por telefone, cria cliente rascunho se não existir, analisa a intenção por palavras-chave e registra a conversa e a mensagem no banco.
- **Saída de Mensagens:** Existe o endpoint de backend `POST /backend/v1/enviar_whatsapp` (`pocketbase/hooks/enviar_whatsapp.js:16`), chamado pelo frontend via `pb.send('/backend/v1/enviar_whatsapp')` (`src/pages/ConversasPage.tsx:387`).
- **Conexão externa no envio:** Dentro de `pocketbase/hooks/enviar_whatsapp.js:62`, há uma chamada HTTP `$http.send` direta para `https://api.zenvia.com/v2/channels/whatsapp/messages`. Para o provedor Twilio, há apenas um log de simulação (`pocketbase/hooks/enviar_whatsapp.js:78`), sem envio real implementado. Provedores 360dialog e Infobip não possuem código de envio configurado.

### b) Onde está o token do provedor?

- O token do provedor WhatsApp fica armazenado no **`localStorage`** do navegador sob a chave `integracao_whatsapp`.

### c) Arquivo e linha do token WhatsApp

- **Armazenamento:** `src/pages/IntegracoesPage.tsx:177`
- **Consumo no envio:** `src/pages/ConversasPage.tsx:260` (leitura do storage) e `src/pages/ConversasPage.tsx:395` (passado dentro de `config_whatsapp` no payload do POST).
- **Consumo no backend:** `pocketbase/hooks/enviar_whatsapp.js:55` (`const token = configWhatsapp.token`).

### d) Existe fila de mensagens ou envio síncrono?

- **Envio 100% síncrono.**
- Não há RabbitMQ, Redis, BullMQ ou tabela de fila de mensagens pendentes com worker.
- Se a requisição `$http.send` para a Zenvia demorar ou falhar, o erro é capturado em bloco `try/catch` (`pocketbase/hooks/enviar_whatsapp.js:80-83`), registrado no log, porém a mensagem é gravada no banco como enviada com status de sucesso (`pocketbase/hooks/enviar_whatsapp.js:93, 116`), podendo induzir o vendedor ao erro de achar que o cliente recebeu a mensagem quando ela falhou no provedor.

### e) Existe retry automático?

- **NÃO IMPLEMENTADO.** Não há lógica de retentativa, backoff exponencial ou verificação de status de entrega (`delivery receipt`).

### f) Classificação de Risco

- **Risco: CRÍTICO**. O envio falha silenciosamente caso o provedor rejeite, o token trafega no corpo da requisição do cliente para o backend a cada mensagem enviada, e não há suporte real implementado além da Zenvia.

---

## 4. Assistente de IA — [IMPLEMENTADO / PARCIALMENTE CONFORME]

### a) A tela de sugestão de respostas está implementada?

- **Sim, implementada.** Na tela `/conversas` (`src/pages/ConversasPage.tsx:269-342`), o vendedor pode clicar no botão de sugerir resposta da IA. O componente exibe um card com a sugestão gerada, permitindo usar, editar antes de enviar ou regenerar.

### b) Qual API de IA?

- Utiliza o **Skip AI Gateway nativo** através da função `$ai.chat` disponível nos pb_hooks do PocketBase (`pocketbase/hooks/sugerir_resposta_ia.js:231`).
- O modelo especificado é `'fast'` (`pocketbase/hooks/sugerir_resposta_ia.js:232`), roteado internamente pela infraestrutura do Skip Cloud. Não utiliza chaves diretas da OpenAI ou Anthropic no frontend.

### c) Onde está a chave?

- A chave do Gateway (`SKIP_AI_GATEWAY_API_KEY`) reside nas variáveis de ambiente seguras do backend gerenciadas pelo Skip Cloud (conforme retornado por `list_secrets`). Não está exposta no cliente.

### d) Chaves de IA em localStorage?

- Não há chave de API de IA em `localStorage`.
- O que está em `localStorage` sob a chave `integracao_assistente_ia` são as configurações funcionais da IA: `ativo`, `permitirPreco`, `tomDeVoz` e `promptSistema` (`src/pages/IntegracoesPage.tsx:211`).

### e) Existe rate limit / limite de sugestões por conversa?

- **Sim, existe trava de rate limit implementada no backend.**
- **Arquivo/Linhas:** `pocketbase/hooks/sugerir_resposta_ia.js:52-62`:
  ```javascript
  const countSugestoes = $app.countRecords('sugestoes_ia', "conversa_id = '" + conversaId + "'")
  if (countSugestoes >= 5) {
    return e.json(429, {
      limite_atingido: true,
      message: 'Limite de 5 sugestões por conversa atingido.',
    })
  }
  ```
- Além do backend (HTTP 429), há trava reflexa no frontend desabilitando o botão e disparando toast informativo (`src/pages/ConversasPage.tsx:282-290`).

### f) Classificação de Risco

- **Risco: MÉDIO**. O gateway e o limite de 5 requisições estão adequadamente seguros. O risco reside no envio de dados pessoais no payload (avaliado na Seção 19).

---

## 5. Banco de Dados — [ALTO]

### a) Listagem de TODAS as tabelas, propósito e RLS (conforme `db_show_schema`)

| #   | Coleção / Tabela        | Tipo | Propósito                                          | RLS Ativo? | Regras RLS Configuradas                                  |
| --- | ----------------------- | ---- | -------------------------------------------------- | ---------- | -------------------------------------------------------- |
| 1   | `users`                 | auth | Usuários padrão do template Skip                   | Sim        | Aberto (list/view/create/update/delete)                  |
| 2   | `usuarios`              | auth | Usuários internos do CRM com perfis Colesel 45     | Sim        | Autenticado + Próprio usuário ou `ceo_financeiro`        |
| 3   | `etapas_funil`          | base | Etapas do funil comercial (Prospecção a Fechado)   | Sim        | Totalmente aberta para autenticados                      |
| 4   | `motivos_perda`         | base | Catálogo de motivos de perda de negócios           | Sim        | Totalmente aberta para autenticados                      |
| 5   | `clientes`              | base | Cadastro de clientes, contatos e histórico         | Sim        | **Incompleta** (list/view aberta para todos não-estoque) |
| 6   | `oportunidades`         | base | Oportunidades comerciais e pipeline de vendas      | Sim        | Restrita por perfil/responsável                          |
| 7   | `tarefas`               | base | Tarefas de follow-up (ligações, visitas, reuniões) | Sim        | Restrita por perfil/responsável                          |
| 8   | `ligacoes`              | base | Registro de ligações telefônicas e contatos        | Sim        | Restrita por perfil/responsável                          |
| 9   | `canais_marketing`      | base | Canais de disparo (WhatsApp, Email, SMS)           | Sim        | Restrita: CEO ou canais ativos                           |
| 10  | `automacoes`            | base | Regras de automação e gatilhos de CRM              | Sim        | Restrita por responsável ou CEO                          |
| 11  | `mensagens_enviadas`    | base | Histórico de disparos de automações                | Sim        | Restrita por responsável do cliente ou CEO               |
| 12  | `campanhas`             | base | Campanhas de marketing                             | Sim        | Restrita por responsável, status ou CEO                  |
| 13  | `conteudos_gerados`     | base | Peças de conteúdo geradas por IA para campanhas    | Sim        | Restrita vinculada à campanha                            |
| 14  | `publicacoes`           | base | Publicações e agendamentos de campanha             | Sim        | Restrita vinculada à campanha e cliente                  |
| 15  | `aprovacoes_pendentes`  | base | Fila de aprovação de conteúdos de marketing        | Sim        | Aberta para autenticados                                 |
| 16  | `metas`                 | base | Metas mensais financeiras e de oportunidades       | Sim        | Restrita por vendedor/coordenador/CEO (idx único)        |
| 17  | `treinamento_concluido` | base | Registro de conclusão do POP e treinamento         | Sim        | Aberta para autenticados                                 |
| 18  | `conversas_whatsapp`    | base | Sessões de conversas do WhatsApp                   | Sim        | Restrita por vendedor vinculado ao cliente ou CEO        |
| 19  | `mensagens_whatsapp`    | base | Mensagens individuais recebidas/enviadas           | Sim        | Restrita vinculada à conversa/cliente                    |
| 20  | `produtos`              | base | Catálogo de produtos e preços para IA              | Sim        | Leitura ampla, escrita exclusiva CEO                     |
| 21  | `sugestoes_ia`          | base | Log e auditoria de respostas sugeridas por IA      | Sim        | Restrita vinculada à conversa                            |

### b) Análise de RLS que deveriam existir

- A tabela `clientes` possui **falha grave de RLS em leitura**: a regra `listRule` é `@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil != 'compras_grandes_clientes' || grande_cliente = true)`. Isso significa que `vendedor_1` pode listar e ler **todos** os clientes cadastrados de `vendedor_2` diretamente via API.
- As coleções `conversas_whatsapp`, `mensagens_whatsapp` e `sugestoes_ia` possuem RLS configurada na migração `0011_create_conversas_e_ia.js`, porém se `cliente_id` for nulo (lead novo ainda não promovido), qualquer vendedor pode listar a conversa (`cliente_id = null || cliente_id.responsavel_id = @request.auth.id`).
- A tabela `produtos` tem listagem liberada para qualquer autenticado (exceto estoque) e escrita restrita ao CEO (`ceo_financeiro`), o que é adequado para um catálogo de referência.

### c) Índices nas colunas mais consultadas

- Índices presentes e confirmados via schema:
  - `clientes`: `idx_clientes_responsavel`, `idx_clientes_grande_cliente`. **FALTA: índice em `telefone`, `cnpj_cpf` e `email`.** (A busca do webhook usa `telefone ~ '...'` e causa table scan).
  - `oportunidades`: `idx_oportunidades_cliente`, `idx_oportunidades_responsavel`, `idx_oportunidades_etapa`, `idx_oportunidades_status`.
  - `tarefas`: `idx_tarefas_cliente`, `idx_tarefas_responsavel`, `idx_tarefas_data_hora`.
  - `ligacoes`: `idx_ligacoes_cliente`, `idx_ligacoes_responsavel`, `idx_ligacoes_data_hora`.
  - `metas`: `idx_metas_usuario_ano_mes` (UNIQUE), `idx_metas_usuario`, `idx_metas_ano`, `idx_metas_mes`.
  - `conversas_whatsapp`: `idx_conversas_numero`, `idx_conversas_cliente`, `idx_conversas_status`.
  - `mensagens_whatsapp`: `idx_mensagens_conversa`, `idx_mensagens_direcao`.
  - `produtos`: `idx_produtos_nome`.
  - `sugestoes_ia`: `idx_sugestoes_conversa`.
- **Falta crítica de índice de unicidade:** Não há índice único em `clientes.cnpj_cpf`, `clientes.telefone` ou `conversas_whatsapp.numero`.

### d) Verificação de dados de exemplo no banco (via `db_query`)

- **`produtos`:** **0 registros encontrados** (vazia, sem dados mockados / sem dados de exemplo).
- **`conversas_whatsapp`:** **0 registros** (vazia).
- **`mensagens_whatsapp`:** **0 registros** (vazia).
- **`sugestoes_ia`:** **0 registros** (vazia).
- **`clientes`:** **0 registros** (vazia).
- **`oportunidades`:** **0 registros** (vazia).
- **`tarefas`:** **0 registros** (vazia).
- **`ligacoes`:** **0 registros** (vazia).
- **`metas`:** **0 registros** (vazia).
- **`campanhas`:** **0 registros** (vazia).
- **`automacoes`:** **0 registros** (vazia).
- **`canais_marketing`:** **0 registros** (vazia).
- **`treinamento_concluido`:** **0 registros** (vazia).
- **`usuarios`:** **2 registros ativos** (Junior Colesel e Alice Paitra, ambos `ceo_financeiro`).
- **`etapas_funil`:** **5 registros semeados** (Prospecção, Qualificação, Proposta, Negociação, Fechado).
- **`motivos_perda`:** **5 registros semeados** (Sem interesse, Preço alto, Concorrente ganhou, Sem budget, Outro).
- **Conclusão:** O banco está em estado limpo de produção, contendo apenas as tabelas estruturais de domínio e os administradores. Não há lixo de dados de teste nas coleções operacionais.

---

## 6. Qualidade do Código — [BOM / COM RESSALVAS DE TAMANHO]

### a) Os 5 maiores arquivos do projeto

1. `src/pages/ImportacaoPage.tsx` — **1.636 linhas**
2. `src/pages/ConversasPage.tsx` — **1.576 linhas**
3. `src/pages/UsuariosPage.tsx` — **1.227 linhas**
4. `src/pages/MetasPage.tsx` — **1.069 linhas**
5. `src/services/painelService.ts` — **908 linhas**

### b) As 5 maiores funções do projeto

1. `handleProcessarImportacao` / ciclo de validação e criação em lote em `src/pages/ImportacaoPage.tsx` (linhas 574–720) — **~146 linhas**.
2. `handleProcessarCompras` em `src/pages/ImportacaoPage.tsx` (linhas 725–879) — **~154 linhas**.
3. `obterDadosPainel` em `src/services/painelService.ts` (linhas 252–520) — **~268 linhas**.
4. Componente funcional principal `ConversasPage` em `src/pages/ConversasPage.tsx` (linhas 73–1576) — **~1.500 linhas** contendo dezenas de modais acoplados.
5. Componente funcional `UsuariosPage` em `src/pages/UsuariosPage.tsx` (linhas 137–1227) — **~1.090 linhas** com formulários e listagens mesclados.

### c) Imports / variáveis não utilizados (resultado do linter)

- Verificado via pipeline de QA com `oxlint src`: **0 erros, 0 warnings**.
- Tipagem estática (`tsc`): **0 erros de tipagem**.
- O código está estritamente tipado de acordo com as regras do TypeScript e Oxlint.

### d) Ocorrências de `console.log` / `console.error` em código de produção

- **Total no Frontend (`src`):** 36 ocorrências de `console.error` e `console.warn` em tratamento de exceções (ex.: `src/services/painelService.ts:284`, `src/pages/ConversasPage.tsx:185, 226`).
- **Total no Backend (`pocketbase/hooks`):** 14 ocorrências de `console.log` em `enviar_whatsapp.js`, `sugerir_resposta_ia.js`, `reavaliar_intencao.js` e `webhook_whatsapp.js`.
- Risco: Em hooks de backend, `console.log` imprime mensagens de erro e parâmetros no stream de logs sem mascaramento de dados (ex.: logando parte do corpo da mensagem do cliente).

### e) TODOs e FIXMEs encontrados

- **Busca por `TODO` e `FIXME`:** **NENHUM ENCONTRADO** em todo o código-fonte de `src/` e `pocketbase/`.

---

## 7. Performance — [MÉDIO]

### a) As 5 piores queries que carregam tudo sem paginação (`getFullList`)

1. `src/pages/ConversasPage.tsx:170`: `pb.collection('conversas_whatsapp').getFullList()` — carrega todas as conversas sem paginação a cada renderização da tela.
2. `src/pages/ConversasPage.tsx:204`: `pb.collection('mensagens_whatsapp').getFullList({ filter: "conversa_id = '...'" })` — carrega todo o histórico de mensagens da conversa de uma vez só.
3. `src/pages/ImportacaoPage.tsx:580` e `735`: `pb.collection('clientes').getFullList()` — carrega a base inteira de clientes para a memória do navegador a fim de montar Maps de lookup. Em uma base com 20.000 clientes, consumirá centenas de MB de RAM e travará o navegador.
4. `src/services/painelService.ts:299-340`: `pb.collection('ligacoes').getFullList()` e `pb.collection('tarefas').getFullList()` — busca todos os contatos históricos até a data final sem paginação para deduzir IDs de clientes ativos.
5. `src/components/relatorios/SubAbaClientes.tsx:138` e `src/components/relatorios/SubAbaOportunidades.tsx:126`: carrega coleções inteiras com `getFullList` para alimentar tabelas e relatórios.

### b) Componentes que recarregam dados desnecessariamente

- `src/pages/ConversasPage.tsx`: ao enviar uma mensagem ou reavaliar uma intenção, dispara `carregarConversas()` que recarrega a lista completa de conversas do zero, refazendo o parsing e ordenação.
- `src/pages/PainelPage.tsx`: a cada alteração de filtro ou mudança de aba, chama `carregarDados()` sem cancelamento de requisições anteriores (`AbortController` não utilizado).

### c) Avaliação do Cache do Painel

- **Como está implementado:** Em memória via `Map<string, CacheEntry>()` com TTL de 5 minutos (`src/services/painelService.ts:86`).
- **Problema:** Não utiliza React Query, SWR nem persistência em sessão. Se o usuário recarregar a página (F5) ou fechar a aba, o cache é zerado imediatamente. Se dois usuários estiverem visualizando simultaneamente, não há invalidação reativa em caso de nova venda registrada.

### d) Chamadas de API duplicadas na mesma tela

- Na tela de Conversas (`src/pages/ConversasPage.tsx:137, 154`), busca separadamente `usuarios` e `etapas_funil` em múltiplos `useEffect` independentes em vez de agrupar em um único `Promise.all`.

---

## 8. Backup e Recuperação — [NÃO CONFIRMADO / DEPENDENTE DE INFRA]

### a) Existe política de backup do banco?

- **NÃO ENCONTRADO no código-fonte nem no backend.**
- O backend PocketBase possui capacidade nativa de backup (`api/backups`), porém **não há nenhum pb_hook, cron ou script configurado** para automatizar snapshots periódicos para bucket S3 ou armazenamento externo.

### b) RPO (Recovery Point Objective) se o banco corromper hoje

- **NÃO CONFIRMADO.** No repositório auditado, o RPO é indeterminado. Se o banco SQLite local do PocketBase corromper e não houver snapshot na infraestrutura do Skip Cloud, o RPO pode ser de **perda total de dados gerados desde a criação**.

### c) Plano de Disaster Recovery (DR)

- **NÃO IMPLEMENTADO / NÃO ENCONTRADO.** Depende integralmente das garantias de SLA da plataforma gerenciada Skip Cloud. Recomenda-se implementar migração ou cron hook que exporte diariamente o banco criptografado para storage remoto secundário.

---

## 9. Deploy e Ambientes — [MÉDIO]

### a) Ambientes

- O projeto conta com ambientes gerenciados pelo Skip (Preview de desenvolvimento e Produção).
- Não há arquivo de configuração declarativa de ambientes (`staging`, `sandbox`) versionado no código.

### b) CI/CD

- O pipeline de CI/CD é executado nativamente pela plataforma Skip Cloud através do harness de verificação (`run_qa`: linting, typechecking, build Vite e migrações).

### c) Rollback automático

- **NÃO IMPLEMENTADO.** Não há suporte a rollback automático de migrações em caso de falha pós-deploy. As migrações possuem função de down/revert no arquivo (ex.: `0011_create_conversas_e_ia.js:336-353`), mas a reversão exige intervenção manual com comando `delete_migration`.

### d) Monitoramento de erros em tempo real (Sentry / LogRocket)

- **NÃO IMPLEMENTADO.** Não há integração com Sentry, Datadog, LogRocket ou Bugsnag. Erros em tempo de execução no frontend apenas caem no console do navegador do usuário.
- O repositório **não está conectado a um repositório GitHub externo**, o que significa que o histórico de commits e versionamento reside exclusivamente no ambiente do Skip Cloud.

---

## 10. Versão e Changelog — [OK COM RESSALVAS]

### a) Versão atual

- **`0.0.28`** declarada explicitamente em `package.json:5`.

### b) Changelog documentado

- **NÃO ENCONTRADO arquivo `CHANGELOG.md` no projeto.**
- **Histórico inferido a partir das migrações e marcos documentados:**
  1. `v0.0.28`: Módulo de Conversas do WhatsApp, integração com assistente Skip AI Gateway (`$ai.chat`), catálogo de produtos e automação de intenção (Migração `0011_create_conversas_e_ia.js` e hooks `sugerir_resposta_ia.js`, `webhook_whatsapp.js`).
  2. `v0.0.27`: Auditoria técnica anterior e ajustes estruturais.
  3. `v0.0.26`: Painel Geral de Vendas, KPIs executivos, filtros de período e gráficos analíticos (`src/services/painelService.ts`, `src/pages/PainelPage.tsx`).
  4. `v0.0.20`–`v0.0.25`: Módulo de POP e Treinamento Interativo de onboarding (`pocketbase/migrations/0010_create_treinamento_concluido.js`), Metas de Vendedores (`0008_create_metas.js`) e provisionamento de CEOs (`0009_ajustes_regras_acesso_e_ceos.js`).
  5. `v0.0.1`–`v0.0.19`: Estrutura base do CRM, Pipeline de Oportunidades, Tarefas, Ligações, Importador CSV de clientes e Campanhas de Marketing.

---

## 11. Observabilidade e Auditoria — [RISCO ALTO]

### a) Logs estruturados no backend?

- **NÃO IMPLEMENTADO.** Os pb_hooks utilizam `console.log('Erro ao ...:', err)` sem formato estruturado (JSON), sem separação por severidade padronizada e sem trace ID.

### b) Integrações externas logam dados completos?

- **NÃO.** O envio HTTP para a Zenvia em `pocketbase/hooks/enviar_whatsapp.js:62` não registra no banco o código de status HTTP retornado pela Zenvia, nem o payload de resposta, nem o tempo de latência da requisição externa. Em caso de erro, apenas imprime no log interno.

### c) Correlation ID / Request ID de ponta a ponta?

- **NÃO IMPLEMENTADO.** Não há geração nem propagação de correlation ID entre frontend, backend e serviços terceiros.

### d) Risco de vazamento de credenciais e dados sensíveis em logs

- **RISCO ALTO.**
  - Em `pocketbase/hooks/enviar_whatsapp.js:81`, se a chamada externa falhar, o erro lançado pelo `$http.send` ou pelo cliente pode registrar a requisição com o cabeçalho `'X-API-TOKEN'` no log de requests do PocketBase.
  - O conteúdo integral das mensagens de WhatsApp dos clientes é impresso via `console.log` no webhook (`pocketbase/hooks/webhook_whatsapp.js:277, 301`).

### e) Tabela / mecanismo de auditoria para alterações importantes

- **PARCIAL.** A coleção `sugestoes_ia` registra flags de `usada` (booleano) e `editada` (booleano). No entanto, não há log de auditoria para exclusão de clientes, alteração de valores de oportunidades, ou modificação de permissões de usuários.

### f) Política de retenção de logs

- **NÃO ENCONTRADO.** Os logs dependem do buffer circular de requests do PocketBase (conforme evidenciado em `list_logs`, onde registros mais antigos expiram sem persistência fria).

### g) Alerta para falhas recorrentes

- **NÃO IMPLEMENTADO.** Não há gatilhos ou webhooks de alerta (Slack, e-mail, PagerDuty) caso o webhook receba erros 500 consecutivos ou a IA fique indisponível.

---

## 12. Resiliência das Integrações — [FRÁGIL]

### Análise Individual das 3 Integrações

| Requisito de Resiliência                   | Bling ERP     | WhatsApp (Zenvia/Twilio)                                                                            | Assistente de IA (Skip AI)                                                                   |
| ------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **a) Timeout configurado?**                | N/A (Sem API) | **Sim:** `timeout: 10`s (`enviar_whatsapp.js:74`)                                                   | **NÃO CONFIRMADO** (timeout interno `$ai.chat`)                                              |
| **b) Retry automático?**                   | N/A           | **NÃO IMPLEMENTADO**                                                                                | **NÃO IMPLEMENTADO**                                                                         |
| **c) Backoff exponencial?**                | N/A           | **NÃO IMPLEMENTADO**                                                                                | **NÃO IMPLEMENTADO**                                                                         |
| **d) Limite de tentativas?**               | N/A           | 1 única tentativa síncrona                                                                          | 1 única tentativa síncrona                                                                   |
| **e) Idempotência?**                       | N/A           | **NÃO:** Webhook duplicado cria mensagem duplicada                                                  | N/A                                                                                          |
| **f) Fila de processamento?**              | N/A           | **NÃO IMPLEMENTADO**                                                                                | **NÃO IMPLEMENTADO**                                                                         |
| **g) Dead-letter queue?**                  | N/A           | **NÃO IMPLEMENTADO**                                                                                | **NÃO IMPLEMENTADO**                                                                         |
| **h) Circuit breaker?**                    | N/A           | **NÃO IMPLEMENTADO**                                                                                | **NÃO IMPLEMENTADO**                                                                         |
| **i) Comportamento em indisponibilidade:** | N/A           | Se a Zenvia cair, a mensagem é gravada no CRM como enviada com sucesso, mas o cliente nunca recebe. | Retorna mensagem de fallback fixa ("Vou consultar a disponibilidade..."), sem travar a tela. |
| **Classificação de Resiliência:**          | **N/A**       | **CRÍTICO**                                                                                         | **ACEITÁVEL**                                                                                |

---

## 13. Integridade e Consistência dos Dados — [RISCO ALTO]

### a) Constraints de unicidade no banco de dados

- **`usuarios`:** `email` UNIQUE (confirmado via schema).
- **`metas`:** `(usuario_id, ano, mes)` UNIQUE (confirmado via schema).
- **`clientes`:** **NENHUM ÍNDICE UNIQUE.** O campo `cnpj_cpf` e o campo `telefone` NÃO são únicos a nível de banco de dados.
- **`conversas_whatsapp`:** O campo `numero` **NÃO é UNIQUE** a nível de banco.
- **`mensagens_whatsapp`:** Não há constraint de unicidade para ID externo de mensagem.

### b) Integridade referencial (Foreign Keys)

- As relações usam o tipo `relation` do PocketBase (`cliente_id` → `clientes`, `responsavel_id` → `usuarios`, `etapa_id` → `etapas_funil`).
- O PocketBase garante validação de existência na criação, porém não possui chave estrangeira relacional com delete cascade estrito, podendo gerar orfandade se registros forem deletados via admin/superuser.

### c) O sistema pode criar clientes duplicados?

- **SIM, em dois pontos:**
  1. **No Webhook:** Se o número chegar com formatos diferentes (ex: `5511999998888` e `1199998888`), a busca em `pocketbase/hooks/webhook_whatsapp.js:63` tenta casar os últimos 8 dígitos. Se a busca falhar por latência ou concorrência simultânea, criará dois clientes rascunho com o mesmo telefone.
  2. **Na Importação CSV:** A deduplicação é feita em memória do frontend (`src/pages/ImportacaoPage.tsx:638`). Se dois usuários importarem ao mesmo tempo, ou se o CSV contiver CPFs formatados de forma diferente que escapem do regex básico, múltiplos clientes duplicados serão gravados no banco.

### d) Matriz da "Fonte da Verdade" dos Dados

| Entidade                     | Fonte da Verdade Atual                       | Observação Técnica                                     |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| **Clientes Cadastrais**      | **CRM (PocketBase)**                         | Inseridos via CSV ou WhatsApp                          |
| **Produtos e Preços**        | **CRM (PocketBase: coleção `produtos`)**     | Cadastrado no CRM pelo CEO                             |
| **Estoque**                  | **NÃO IMPLEMENTADO**                         | Coleção `produtos` tem flag booleana `disponibilidade` |
| **Pedidos / Vendas**         | **Bling ERP** (externo)                      | No CRM existe apenas soma de histórico importado       |
| **Oportunidades (Pipeline)** | **CRM (PocketBase: `oportunidades`)**        | Fonte da verdade nativa do CRM                         |
| **Conversas WhatsApp**       | **CRM (PocketBase: `conversas_whatsapp`)**   | Espelho alimentado por webhook                         |
| **Follow-up / Tarefas**      | **CRM (PocketBase: `tarefas` e `ligacoes`)** | Fonte da verdade nativa do CRM                         |

---

## 14. Validação Read-Only do Bling (CRÍTICO) — [STATUS: SEM ESCRITA / SOMENTE LEITURA ESTRITA]

Foi realizada uma varredura exaustiva em 100% da árvore de arquivos do frontend (`src/`) e do backend (`pocketbase/`), pesquisando por qualquer chamada de escrita (POST, PUT, PATCH, DELETE) ou comunicação de rede apontando para a API do Bling (`bling.com.br`, `api.bling`).

### Tabela de Auditoria de Operações contra o Bling

| Arquivo    | Linha | Método HTTP | Endpoint do Bling | Função / Contexto | Risco           |
| ---------- | ----- | ----------- | ----------------- | ----------------- | --------------- |
| **Nenhum** | -     | -           | -                 | -                 | **Inexistente** |

> **Declaração Formal de Auditoria:**
> **"Nenhuma chamada de escrita para a API do Bling foi encontrada no código auditado."**
> Mais do que isso: não foi encontrada **nenhuma chamada de leitura via API do Bling**. Toda a interação com dados do Bling ERP ocorre exclusivamente através de arquivos CSV/TXT exportados manualmente pelo usuário e importados via navegador (`src/pages/ImportacaoPage.tsx`). É impossível que o CRM crie pedidos, altere contatos ou apague dados no Bling sob a arquitetura atual.

---

## 15. Webhooks — [RISCO CRÍTICO]

### Mapeamento de Webhooks do Sistema

| Integração           | Endpoint                       | Método | Autenticação          | Validação de Assinatura | Idempotência         | Retry   | Log de Auditoria             |
| -------------------- | ------------------------------ | ------ | --------------------- | ----------------------- | -------------------- | ------- | ---------------------------- |
| **WhatsApp Entrada** | `/backend/v1/webhook_whatsapp` | `POST` | **NENHUMA (Público)** | **NÃO IMPLEMENTADA**    | **NÃO IMPLEMENTADA** | **NÃO** | **Incompleto (console.log)** |

### Vulnerabilidades Técnicas do Webhook (`pocketbase/hooks/webhook_whatsapp.js`):

1. **Ausência de Autenticação / Assinatura (CRÍTICO):** O endpoint não exige Bearer token, query param secreto nem valida headers HMAC (`X-Hub-Signature`, `X-Twilio-Signature` ou token Zenvia). **Qualquer atacante na internet pode enviar requisições POST para `/backend/v1/webhook_whatsapp`**, forjando clientes, abrindo oportunidades e injetando textos no funil.
2. **Falta de Idempotência e Replay Attack (CRÍTICO):** O webhook não extrai nem valida o identificador único da mensagem do provedor (`message_id`). Se a requisição for reenviada, criará registros duplicados repetidamente.
3. **Ausência de Rate Limit no Endpoint (ALTO):** Não há limitação de requisições por IP ou por número remetente no endpoint público, abrindo vetor de negação de serviço (DoS) e estouro de armazenamento do banco PocketBase.
4. **Processamento Síncrono Bloqueante (ALTO):** A resposta HTTP 200 só é devolvida ao provedor no final de todas as operações de banco (`pocketbase/hooks/webhook_whatsapp.js:345`). Se as queries de busca e inserção demorarem mais que o timeout do provedor (geralmente 3 a 5 segundos), o provedor considerará a entrega falha e reenviará a notificação repetidamente.

---

## 16. Controle de Acesso e Escalada de Privilégio (CRÍTICO) — [RISCO CRÍTICO]

### a) Vendedor acessando dados de outro vendedor (RLS vs Frontend)

- **Quebra Crítica na Leitura de Clientes:**
  - A regra no banco de dados (`listRule` de `clientes`) é:
    ```
    @request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil != 'compras_grandes_clientes' || grande_cliente = true)
    ```
  - **Evidência:** Essa regra NÃO filtra `responsavel_id = @request.auth.id`.
  - O filtro que separa a carteira de `vendedor_1` e `vendedor_2` é gerado exclusivamente no cliente via função JavaScript `construirFiltroEscopo` (`src/services/painelService.ts:95`).
  - **Impacto:** Um vendedor mal-intencionado ou que inspecione a aba Network do navegador pode remover o parâmetro `filter` da query GET do PocketBase e listar/baixar a base integral de clientes de todos os outros vendedores da empresa.

### b) IDOR (Insecure Direct Object Reference)

- Na coleção `clientes`:
  - Leitura direta (`GET /api/collections/clientes/records/:id`): **VULNERÁVEL**. A regra `viewRule` tem a mesma brecha da `listRule`. Um vendedor pode abrir e visualizar qualquer cliente da base trocando o ID na URL.
  - Edição/Exclusão (`PATCH / DELETE`): **PROTEGIDO**. A regra `updateRule` e `deleteRule` exige explicitamente `responsavel_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro'`. O vendedor não consegue alterar nem apagar dados de outro vendedor.
- Na coleção `oportunidades`:
  - **PROTEGIDO**. A regra `listRule` e `viewRule` exige `responsavel_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`.

### c) Alteração do próprio perfil e escalada de privilégio

- Na coleção `usuarios`, a regra de update é:
  ```
  @request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')
  ```
- **VULNERABILIDADE CRÍTICA:** Um usuário comum (ex: `vendedor_1`) possui permissão de UPDATE em seu próprio registro (`id = @request.auth.id`). Se ele enviar uma requisição `PATCH /api/collections/usuarios/records/<seu_id>` com o corpo `{"perfil": "ceo_financeiro"}`, o PocketBase aceitará a alteração se não houver trava no campo a nível de schema!
- No endpoint de criação de usuários (`pocketbase/hooks/criar_usuario.js:28`), há validação de perfil `ceo_financeiro`. No entanto, na rota nativa do PocketBase de update de usuário, a regra da coleção permite que o usuário edite a si mesmo sem barrar alteração do campo `perfil`.

---

## 17. Dependências e Supply Chain — [BOM]

### a) Versões principais (conforme `package.json`)

- React: `^19.2.7` / React-DOM: `^19.2.7`
- Vite: `8.0.16`
- PocketBase SDK: `~0.26.9`
- Tailwind CSS: `^3.4.19`
- Recharts: `^3.8.1`
- Zod: `^4.4.3`
- Radix UI kit completo

### b) Dependências abandonadas / vulnerabilidades

- Não há pacotes deprecated ou abandonados detectados. A stack está na versão mais recente de 2026.

### c) Lockfile e auditoria

- Lockfile presente e controlado.
- Pacotes de CDN externa não são utilizados no bundle. Todos os componentes e utilitários são instalados localmente via npm.
- Scripts de terceiros externos não autorizados não foram encontrados no index.html.

---

## 18. Testes Automatizados — [CRÍTICO / NÃO IMPLEMENTADO]

### a) Quantidade e localização de testes

- **Total de testes encontrados:** **0 testes**.
- **Cobertura de código:** **0%**.
- O script de teste no `package.json:17` é:
  ```json
  "test": "echo \"there are no tests for this project\" && exit 0"
  ```

### b) Módulos críticos sem cobertura de teste

- Autenticação e controle de acesso por perfil (`AuthContext`, `ProtectedRoute`).
- Regras RLS do PocketBase no backend.
- Lógica de classificação de intenção do webhook de WhatsApp.
- Rota de geração de senha e provisionamento de usuários.
- Deduplicação de clientes na importação CSV.
- Cálculo de conversão e faturamento do Painel Geral.

---

## 19. Privacidade e Dados Pessoais (LGPD) — [NÃO CONFORME]

### a) Mapeamento de dados pessoais armazenados

- **Dados cadastrais:** Nome do contato, CPF/CNPJ, telefone celular, e-mail pessoal/corporativo, cidade, data de nascimento.
- **Dados de comunicação:** Histórico integral de mensagens de texto trocadas pelo WhatsApp entre clientes e consultores.
- **Dados comerciais:** Histórico de compras, valores negociados, motivo de perdas e hábitos de consumo.

### b) Criptografia

- **Em trânsito:** Protegido via HTTPS/TLS provisionado pelo Skip Cloud.
- **Em repouso:** **NÃO CONFIRMADO**. O banco PocketBase utiliza SQLite padrão sem extensão de criptografia de banco (como SQLCipher) confirmada no código.

### c) PONTO CRÍTICO LGPD: Compartilhamento com Gateway de IA

- **Evidência no código:** `pocketbase/hooks/sugerir_resposta_ia.js:201-235`:
  ```javascript
  HISTÓRICO DO CLIENTE NO CRM:
  - Nome: ${clienteInfo.nome}
  - Empresa: ${clienteInfo.empresa || 'Pessoa física'}
  - Telefone: ${clienteInfo.telefone}
  - Histórico de Compras: ${clienteInfo.compras_anteriores}
  - Oportunidade Atual: ${clienteInfo.oportunidade_aberta}
  ```
  O backend concatena o nome real, telefone e histórico comercial do cliente juntamente com as últimas 5 mensagens reais trocadas no WhatsApp e envia ao modelo de linguagem no `$ai.chat`.
- **Implicações legais:**
  1. Configura compartilhamento e eventual transferência internacional de dados pessoais.
  2. Não há anonimização ou mascaramento de dados (ex.: substituir telefone e nome por identificador pseudo-anônimo).
  3. Não há coleta de consentimento do titular do WhatsApp para tratamento de suas mensagens por modelos de IA generativa.

### d) Direitos do Titular (Exclusão / Esquecimento)

- **NÃO IMPLEMENTADO.** Não há botão ou fluxo automatizado para atender requisições de titulares (Art. 18 da LGPD) para exportação de dados ou exclusão completa (direito ao esquecimento) sem quebrar o relacionamento com pedidos e mensagens no banco.

### e) Exportação CSV sem restrição

- Em `src/components/relatorios/exportarCsv.ts`, relatórios completos contendo nome, telefone e dados de contato podem ser baixados em CSV sem registro de log de auditoria de quem exportou, facilitando vazamento de carteira.

### f) Classificação Geral de Conformidade

- **Classificação:** **NÃO CONFORME**.

---

## 20. Prontidão para Produção — [MATRIZ DE GO-LIVE]

| Item de Auditoria              | Status Atual                  | Bloqueia Go-Live?    | Ação Necessária Obrigatória                                                  |
| ------------------------------ | ----------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| **Credenciais Seguras**        | Inseguro (`localStorage`)     | **SIM (BLOQUEADOR)** | Mover tokens para backend seguro ou tabela com escrita restrita a superuser. |
| **Bling Read-Only**            | OK (Sem escrita)              | Não                  | Documentar que opera exclusivamente via CSV e remover token órfão.           |
| **WhatsApp Entrada (Webhook)** | Vulnerável (Aberto/Sem Token) | **SIM (BLOQUEADOR)** | Adicionar validação de token/secret e assinatura HMAC na rota do webhook.    |
| **Idempotência do Webhook**    | Inexistente                   | **SIM (BLOQUEADOR)** | Gravar `message_id` externo e descartar eventos repetidos.                   |
| **RLS de Clientes**            | Brecha em leitura de carteira | **SIM (BLOQUEADOR)** | Ajustar `listRule` e `viewRule` de `clientes` para filtrar por responsável.  |
| **Escalada de Privilégio**     | Auto-edição de perfil         | **SIM (BLOQUEADOR)** | Bloquear edição do campo `perfil` por não-CEOs na coleção `usuarios`.        |
| **Privacidade / LGPD na IA**   | Dados expostos no prompt      | **SIM (BLOQUEADOR)** | Remover telefone e dados identificadores do payload enviado ao `$ai.chat`.   |
| **Backup Automatizado**        | Não confirmado / sem rotina   | **SIM (BLOQUEADOR)** | Configurar cron de backup diário com exportação segura.                      |
| **Fila e Retry de Envio**      | Síncrono sem retry            | Não (P1)             | Implementar fila de reenvio para falhas temporárias da Zenvia.               |
| **Testes Automatizados**       | 0 testes                      | Não (P1)             | Escrever testes de integração para login, RLS e webhooks.                    |
| **Paginação de Consultas**     | `getFullList` indiscriminado  | Não (P2)             | Substituir por `getList(page, perPage)` em conversas e relatórios.           |
| **Logs Estruturados**          | Apenas `console.log`          | Não (P2)             | Estruturar logs em JSON e omitir dados sensíveis.                            |

---

## 21. Dívida Técnica — [MATRIZ DE PRIORIZAÇÃO]

### P0 — Obrigatório antes do Go-Live (Falha de Segurança, Integridade ou Disponibilidade Crítica)

| ID       | Problema                                                                   | Severidade | Impacto                                                                | Esforço Estimado | Antes do Go-Live? |
| -------- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- | ---------------- | ----------------- |
| **P0-1** | Endpoint de Webhook público sem autenticação e sem validação de assinatura | CRÍTICA    | Atacantes podem forjar leads e poluir o funil de vendas em massa       | 4 horas          | **SIM**           |
| **P0-2** | Falta de idempotência no webhook do WhatsApp                               | CRÍTICA    | Mensagens duplicadas e métricas corrompidas a cada retentativa de rede | 3 horas          | **SIM**           |
| **P0-3** | RLS de clientes aberta para todos os vendedores                            | CRÍTICA    | Vazamento de carteira entre vendedores concorrentes internos           | 2 horas          | **SIM**           |
| **P0-4** | Token do provedor WhatsApp trafegando do frontend no payload do POST       | CRÍTICA    | Exposição de credenciais e violação de boas práticas                   | 4 horas          | **SIM**           |
| **P0-5** | Dados pessoais (telefone/nome) enviados para a IA sem anonimização         | CRÍTICA    | Não conformidade com LGPD e risco de sanção legal                      | 2 horas          | **SIM**           |
| **P0-6** | Risco de escalada de privilégio na edição de próprio usuário no PocketBase | CRÍTICA    | Vendedor pode se auto-promover a CEO alterando o campo `perfil`        | 2 horas          | **SIM**           |
| **P0-7** | Ausência de política formal de backup do banco de dados                    | ALTA       | Risco de perda irreversível de dados em falha de infraestrutura        | 3 horas          | **SIM**           |

### P1 — Corrigir logo após o Go-Live

| ID       | Problema                                                          | Severidade | Impacto                                               | Esforço Estimado | Antes do Go-Live? |
| -------- | ----------------------------------------------------------------- | ---------- | ----------------------------------------------------- | ---------------- | ----------------- |
| **P1-1** | Ausência de testes automatizados (unitários e RLS)                | ALTA       | Risco de regressão em novos deploys                   | 16 horas         | Não               |
| **P1-2** | Envio de WhatsApp síncrono com Zenvia sem fila ou retry           | ALTA       | Mensagens perdidas se a Zenvia oscilar                | 8 horas          | Não               |
| **P1-3** | Falta de índices nos campos `telefone` e `cnpj_cpf` em `clientes` | MÉDIA      | Degradação de performance na busca do webhook         | 1 hora           | Não               |
| **P1-4** | Armazenamento de credenciais SMTP no `localStorage`               | MÉDIA      | Perda de configurações ao trocar de máquina/navegador | 4 horas          | Não               |
| **P1-5** | Ausência de log de auditoria em exportações CSV de relatórios     | MÉDIA      | Vazamento silencioso de dados de clientes             | 3 horas          | Não               |

### P2 — Evolução (Refatorações, Performance e Arquitetura)

| ID       | Problema                                                                          | Severidade | Impacto                                         | Esforço Estimado | Antes do Go-Live? |
| -------- | --------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | ---------------- | ----------------- |
| **P2-1** | Arquivos monolíticos com mais de 1.000 linhas (`ConversasPage`, `ImportacaoPage`) | BAIXA      | Dificuldade de manutenção e leitura             | 16 horas         | Não               |
| **P2-2** | Eliminar queries `getFullList` e implementar paginação virtual                    | MÉDIA      | Travamento do navegador com crescimento da base | 8 horas          | Não               |
| **P2-3** | Implementar React Query / SWR para cache reativo do CRM                           | BAIXA      | Melhoria de responsividade de interface         | 12 horas         | Não               |
| **P2-4** | Conectar integração direta via API oficial do Bling ERP                           | BAIXA      | Elimina a necessidade de exportar CSV no Bling  | 24 horas         | Não               |

---

## Recomendações Prioritárias (ordenadas por criticidade)

1. **Blindar o endpoint `/backend/v1/webhook_whatsapp`:** Exigir um header com token secreto pré-compartilhado (ex: `X-Webhook-Secret`) ou assinatura do provedor para rejeitar qualquer chamada que não parta do IP/servidor oficial do WhatsApp.
2. **Corrigir a RLS da coleção `clientes`:** Atualizar a migração para que `listRule` e `viewRule` restrinjam a visualização estritamente a `responsavel_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas'`.
3. **Implementar deduplicação e idempotência no Webhook:** Adicionar verificação de `message_id` externo na coleção `mensagens_whatsapp` antes de criar novos registros.
4. **Remover o token de WhatsApp do payload do frontend:** Salvar a configuração da Zenvia na tabela `canais_marketing` do backend e fazer com que `/backend/v1/enviar_whatsapp` leia a chave diretamente do banco no servidor, sem que o cliente a conheça ou envie por HTTP.
5. **Anonimizar dados enviados ao Skip AI Gateway:** No arquivo `pocketbase/hooks/sugerir_resposta_ia.js`, remover o envio de número de telefone, CNPJ e detalhes sensíveis do cliente, limitando o prompt a instruções de contexto genéricas e catálogo de produtos.
6. **Impedir auto-promoção de perfil:** Configurar regra no PocketBase impedindo que `@request.data.perfil` seja modificado a menos que `@request.auth.perfil = 'ceo_financeiro'`.
7. **Configurar rotina de backup diário com retenção externa.**

---

## O que fazer ANTES do go-live

- [ ] Implementar verificação de token ou header de autenticação no webhook de WhatsApp.
- [ ] Adicionar controle de duplicidade no webhook por ID de mensagem.
- [ ] Corrigir as regras RLS de `clientes` no PocketBase para isolar as carteiras dos vendedores no banco de dados.
- [ ] Retirar o tráfego do token de WhatsApp no payload da requisição de envio (`/backend/v1/enviar_whatsapp`).
- [ ] Proteger o campo `perfil` da coleção `usuarios` contra edição por usuários comuns.
- [ ] Anonimizar o payload enviado para o modelo de linguagem no `sugerir_resposta_ia.js`.
- [ ] Validar e documentar a política de snapshot/backup diário da base de dados.

---

## O que pode esperar para DEPOIS do go-live

- [ ] Refatorar os componentes monolíticos (`ConversasPage.tsx`, `ImportacaoPage.tsx`, `UsuariosPage.tsx`).
- [ ] Substituir todas as chamadas `getFullList` por paginação sob demanda (`getList`).
- [ ] Integrar biblioteca de testes automatizados (Vitest + Playwright) para validação de fluxos.
- [ ] Adicionar monitoramento de erros de frontend via Sentry.
- [ ] Implementar fila assíncrona para reenvio automático de mensagens com erro no provedor WhatsApp.
- [ ] Desenvolver integração direta via API REST v3 do Bling ERP para sincronização automática sem planilhas.
