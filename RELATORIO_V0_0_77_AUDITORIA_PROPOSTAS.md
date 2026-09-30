# Relatório de Auditoria v0.0.77 — Pipeline de Propostas Comerciais Bling ERP

**Data:** 30/09/2026  
**Versão:** v0.0.77  
**Escopo:** Conserto do pipeline de auditoria de propostas comerciais (quebrado na v0.0.76), de-para determinístico de situações, restauração de integridade de logs corrompidos, atualização de indicadores em `/bling` e relatório técnico conclusivo.

---

## 1. Diagnóstico do Pipeline Quebrado da v0.0.76

Na rodada anterior (v0.0.76), foram criadas as migrations `0045_auditoria_propostas_coleta.js`, `0046_exportar_audit_para_synclog.js`, `0047_log_audit_console.js` e `0048_formatar_md_auditoria.js`.

### O que deu errado ao vivo:

1. **Falha de gravação em `backup_logs`:** A migration `0045` tentava gravar agregações de propostas em `backup_logs` com tipo `'manual'`. Esse registro nunca foi criado adequadamente porque a coleção `backup_logs` é reservada para dumps reais de backup (Cloudflare R2/local) com esquema restrito.
2. **Corrupção de log de produção:** A migration `0048` buscava em `backup_logs` com tipo `'manual'`, pegava o registro incorreto (o backup manual de 29/09) e sobrescrevia o campo `mensagem_resumo` do último registro de `bling_sync_logs` (ID `168wiasaf5wfg9i`) com texto truncado e espúrio (`AUDIT_PROPOSTAS:Backup manual sob demanda criado com sucesso (327 registros...)`), corrompendo o log oficial de sincronização da produção.
3. **Falha em `integracoes_config`:** A migration `0048` também tentava salvar markdown de auditoria em `integracoes_config.ia_prompt_sistema`, porém a coleção não possui registros ativos, resultando em operação silenciosamente abortada/vazia.
4. **Migrations inexistentes:** As migrations `0049_ler_bloco_1.js` e `0050_ler_auditoria.js` citadas no commit da v0.0.76 sequer existiam no repositório.

### Ações Corretivas Implementadas (v0.0.77):

- **Neutralização:** O corpo das migrations `0045_auditoria_propostas_coleta.js`, `0046_exportar_audit_para_synclog.js`, `0047_log_audit_console.js` e `0048_formatar_md_auditoria.js` foi neutralizado (arquivos mantidos no repositório com funções `up`/`down` vazias, preservando a linearidade do histórico do PocketBase sem mutações indevidas).
- **Restauração do log corrompido:** O registro `168wiasaf5wfg9i` de `bling_sync_logs` teve seu campo `mensagem_resumo` pontualmente restaurado para o valor fidedigno original de 66s:
  > _"Concluído em 66s: 1432 contatos lidos (0 novos, 3 atualizados), 10815 pedidos lidos (0 persistidos, 10815 atualizados, 3 pendentes vínculo), 2910 propostas lidas (0 persistidas, 2910 atualizadas, 10 pendentes vínculo). Avisos: 2348."_
- **Persistência canônica do objeto JSON:** A auditoria estruturada passou a ser gravada de forma nativa e segura no campo JSON `erros_propostas` da tabela `bling_sync_logs`.

---

## 2. De-Para Determinístico de Situações (Item 5 da Pauta)

Substituição da normalização prévia por `indexOf` / `includes` por correspondência **determinística e exata por nome** (com `trim()`, minúsculas e remoção de acentos via NFD regex):

| Situação no Bling ERP               | Situação Normalizada CRM | visivel_funil | Trata como Não Mapeado? | Justificativa / Comportamento                                                                                                                                                           |
| :---------------------------------- | :----------------------- | :-----------: | :---------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rascunho**                        | `rascunho`               |    `true`     |           Não           | Proposta em edição comercial inicial; elegível à visualização de funil ativo.                                                                                                           |
| **Aguardando**                      | `aguardando`             |    `true`     |           Não           | Proposta enviada aguardando resposta/aprovação do cliente.                                                                                                                              |
| **Pendente**                        | `aguardando`             |    `true`     |           Não           | Variação sinonímica de aguardando no Bling ERP.                                                                                                                                         |
| **Não aprovado** / **Não aprovada** | `nao_aprovada`           |    `true`     |           Não           | Proposta rejeitada/perdida; visível para follow-up de perdas.                                                                                                                           |
| **Aprovado** / **Aprovada**         | `convertida`             |    `false`    |           Não           | Proposta aceita pelo cliente; gera pedido de venda no Bling; fecha o ciclo de propostas.                                                                                                |
| **Concluído** / **Concluída**       | `outro`                  |    `false`    |         **Não**         | **Semântica ambígua:** pode representar proposta convertida ou simplesmente encerrada/arquivada administrativamente. Não conta como `status_nao_mapeados`. Decisão pendente do usuário. |
| **Qualquer outro nome / ID**        | `outro`                  |    `false`    |         **Sim**         | Situação desconhecida ou não prevista; incrementa `status_nao_mapeados` e gera aviso no log de sincronização.                                                                           |

---

## 3. Auditoria ao Vivo da Base `bling_propostas` (2.910 Registros)

A auditoria ao vivo foi executada percorrendo 100% da coleção `bling_propostas` (paginação de 5.000 registros sem teto).

### Resumo dos Totais:

- **Total de registros lidos:** 2.910
- **Total de IDs distintos (`bling_proposta_id`):** 2.910
- **Duplicados:** 0 (índice único `idx_bling_propostas_proposta_id` íntegro)
- **Registros com `situacao_bling_id`:** 0 (limitação da listagem GET do Bling, ver seção 4)
- **Distribuição de `visivel_funil`:**
  - `visivel_funil = true`: 2.000 (Rascunho: 2.000)
  - `visivel_funil = false`: 910 (Concluído: 910)

### Tabela de Distribuição: ID Bling | Situação Real | Normalizado | visivel_funil | Quantidade

| ID Bling  | Situação Real no Bling | Status Normalizado CRM               | visivel_funil | Quantidade Exata | Percentual  |
| :-------: | :--------------------- | :----------------------------------- | :-----------: | :--------------: | :---------: |
| _(vazio)_ | **Rascunho**           | `rascunho`                           |    `true`     |    **2.000**     |   68,73%    |
| _(vazio)_ | **Concluído**          | `outro` _(classificação provisória)_ |    `false`    |     **910**      |   31,27%    |
|     —     | **Total**              | —                                    |       —       |    **2.910**     | **100,00%** |

_Observação:_ Não foram identificadas outras situações na base atual além de "Rascunho" e "Concluído". A soma é exatamente **2.910**.

---

## 4. Classificação e Auditoria dos 2.348 Avisos

No log de sincronização de referência, foram totalizados **2.348 avisos**. A decomposição exata da origem dos avisos é:

1. **2.000 avisos de situações de propostas:**
   - Na versão anterior (v0.0.76), "Rascunho" ou situações sem ID disparavam avisos de situação não mapeada pelo contador.
   - Na v0.0.77, com o de-para determinístico, "Rascunho" é conhecido e mapeado explicitamente para `rascunho`, e "Concluído" para `outro` sem gerar avisos de não mapeado. Nas próximas sincronizações, os 2.000 avisos serão suprimidos.
2. **348 avisos de unicidade de `nome_empresa` em CONTATOS:**
   - Ocorrem quando o Bling retorna múltiplos contatos distintos que possuem o mesmo nome de fantasia ou razão social simplificada, acionando a restrição de unicidade em `clientes.nome_empresa`. O motor trata esses casos como avisos de resiliência sem abortar a sincronização.
3. **Total consolidado:** 2.000 + 348 = **2.348 avisos confirmados**.

---

## 5. Auditoria de Dados Ausentes e Vendedores

### Por que `situacao_bling_id`, `contato_nome`, `documento` e `vendedor_bling` estavam vazios:

- **Investigação do payload GET `/propostas-comerciais` (listagem):**
  - A API v3 do Bling ERP retorna na listagem principal os campos `id`, `numero`, `data`, `total`, `situacao.valor` (onde vem a string `"Rascunho"` ou `"Concluído"`), e `contato.id`.
  - Os campos detalhados de `situacao.id`, `contato.nome`, `contato.numeroDocumento` e o objeto `vendedor` vêm frequentemente vazios ou omitidos na listagem rápida da API do Bling para otimização de largura de banda.
- **Tratamento Implementado na v0.0.77:**
  - **Enriquecimento via Cliente Vinculado:** Tanto na migration retroativa `0052` quanto no motor de sincronização contínuo (`pocketbase/hooks/bling_importar.js`), quando o payload não traz `contato.nome` ou `documento`, o CRM herda automaticamente a Razão Social/Nome de Contato e CNPJ/CPF do registro correspondente já persistido em `clientes`.
  - **Vendedor Default Renan mantido:** Conforme exigência expressa do usuário, como o Bling não envia o objeto de vendedor nas propostas comerciais, o CRM **preserva o default "Renan"** (`vendedor_crm = 'Renan'`, associado ao respectivo `responsavel_id` de vendedor no PocketBase). Isso evita a quebra de regras de visibilidade (RLS) e filtros de equipe.
- **Distribuição de Vendedor na Auditoria:**
  - `vendedor_bling`: _(vazio)_
  - `vendedor_crm`: `Renan` (2.910 propostas atribuídas)
  - `responsavel_id`: ID de usuário do Renan no CRM (2.910 propostas)

---

## 6. Propostas com Vínculo Pendente (10 Registros)

A auditoria identificou exatamente **10 propostas** com `status_vinculo = 'pendente'` (propostas cujos contatos do Bling não possuíam correspondente em `clientes` por ID do Bling, CNPJ/CPF ou nome):

| Bling Proposta ID | Número | Bling Contato ID | Contato Nome | Documento | Situação Real | Status Normalizado | Valor Total | Cliente ID |
| :---------------: | :----: | :--------------: | :----------: | :-------: | :-----------: | :----------------: | :---------: | :--------: |
|   `16462705979`   |  3131  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705980`   |  3132  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705981`   |  3133  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705982`   |  3134  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705983`   |  3135  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705984`   |  3136  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705985`   |  3137  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705986`   |  3138  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705987`   |  3139  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |
|   `16462705988`   |  3140  |  `16358485233`   |      —       |     —     |   Concluído   |      `outro`       |   R$ 0,00   |   `null`   |

_Diagnóstico dos 10 pendentes:_ Todos pertencem ao mesmo contato Bling (`16358485233`), possuem valor R$ 0,00 e situação "Concluído" no Bling. Permanecem preservados de forma segura na base local sem descarte.

---

## 7. Card "Propostas Comerciais" na Página `/bling` (Item 14 da Pauta)

O card "Propostas Comerciais" em `src/pages/BlingPage.tsx` foi atualizado para exibir as contagens analíticas reais derivadas diretamente de `bling_propostas` (ou da rota autenticada `/backend/v1/bling/status`):

- **Propostas Salvas (Total):** 2.910
- **Rascunho:** 2.000
- **Aguardando:** 0
- **Não Aprovada:** 0
- **Convertidas:** 0
- **Outras (Concluído):** 910
- **Vínculo Pendente (sem cliente):** 10

---

## 8. Respostas Objetivas da Auditoria Técnica

- **Total de propostas / distintos / duplicados:** 2.910 total / 2.910 distintos / 0 duplicados.
- **Distribuição de visibilidade de funil:**
  - `visivel_funil = true`: 2.000 (todas "Rascunho")
  - `visivel_funil = false`: 910 (todas "Concluído")
- **Total de avisos e origens:** 2.348 (2.000 avisos prévios de situações não mapeadas + 348 de duplicidade de nome_empresa em contatos).
- **Vendedores não mapeados:** 0 (todas as 2.910 propostas associadas deterministicamente ao default Renan).
- **Mapeamento por situação está confiável:** **SIM** (100% determinístico por nome exato com normalização acentual).
- **Base de propostas homologada para alimentar o Funil:** **NÃO (ainda não)**.
  - _Ressalva 1 (Decisão de Negócio):_ É mandatória a decisão do usuário sobre a semântica de **"Concluído"** (910 registros): deve ser tratada como proposta convertida em venda ou como simples arquivamento/encerramento?
  - _Ressalva 2 (Atribuição de Vendedor):_ Todas as 2.910 propostas comerciais estão atribuídas a Renan por omissão do payload do Bling. A equipe comercial deve validar se essa atribuição é aceitável para visualização analítica antes de habilitar a geração de oportunidades no Funil.
