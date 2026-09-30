# Relatório de Integração — Bling Propostas Comerciais (v0.0.75)

**CRM Colesel 45** — Versão `v0.0.75`  
**Data:** 30 de setembro de 2026  
**Status do QA:** Aprovado (Lint, TypeScript, Vitest e Build verdes)

---

## 1. Objetivo da Versão

Integrar as **Propostas Comerciais do Bling ERP** ao CRM Colesel 45 em modo **SOMENTE LEITURA**, persistindo cada proposta individualmente na nova coleção `bling_propostas` com dados completos de cliente, vendedor, datas, valor total e situação da conta real.

> **Importante:** Conforme instrução do usuário, nesta versão a base do **Funil de Vendas NÃO foi alterada** e a base homologada de pedidos de venda (`bling_pedidos`) permaneceu intacta. O objetivo foi criar uma base local confiável, estruturada e idempotente, pronta para alimentar o Funil na próxima rodada.

---

## 2. Validação do Recurso e Rota Efetiva

- **Nome Oficial do Recurso:** Propostas Comerciais
- **Endpoint de Listagem:** `GET https://api.bling.com.br/Api/v3/propostas-comerciais?pagina={pagina}&limite={limite}`
- **Endpoint de Detalhes:** `GET https://api.bling.com.br/Api/v3/propostas-comerciais/{idPropostaComercial}`
- **Paginação:** Paginado via query params `pagina` (base 1) e `limite` (até 100 itens por página).
- **Campos Principais do Recurso:**
  - `id`: Identificador numérico único no Bling ERP
  - `numero`: Número comercial da proposta
  - `data`: Data de emissão/criação
  - `dataValidade` / `dataProximoContato`: Data de vigência
  - `total` / `valor` / `totalProdutos`: Valor financeiro total
  - `contato`: Objeto com `id`, `nome`, `numeroDocumento`
  - `vendedor`: Objeto com `id`, `nome`
  - `situacao`: Objeto com `id`, `valor` ou `nome` (vinculado aos módulos de situações)

---

## 3. Escopo OAuth Validado

- **Escopo Exato de Leitura:** `propostas-comerciais:read`
- **Escopos Atuais Mantidos:** `contatos:read pedidos-vendas:read`
- **Montagem da URL de Autorização Atualizada:**
  ```text
  scope=contatos%3Aread%20pedidos-vendas%3Aread%20propostas-comerciais%3Aread
  ```
- **Princípio do Menor Privilégio:**
  - Zero permissões de escrita (`propostas-comerciais:write` PROIBIDO)
  - Zero permissões financeiras (contas a pagar, contas a receber, borderôs ou contábil NÃO solicitados)
- **Reautorização:** Como o token existente na conta havia sido emitido sob os escopos anteriores (`contatos:read pedidos-vendas:read`), a chamada contra `/propostas-comerciais` responde HTTP 403 (insufficient scope) até que o usuário clique em **RECONECTAR** na interface `/bling`. O fluxo trata HTTP 403 de forma explícita, sem falhas silenciosas e sem quebrar as sincronizações de contatos e pedidos.

---

## 4. Nova Coleção `bling_propostas` (Migração 0044)

Criada a migração `pocketbase/migrations/0044_create_bling_propostas.js` com o esquema aprovado:

| Campo                 | Tipo                          | Descrição / Regra                                                            |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `bling_proposta_id`   | text (required, unique)       | Chave de negócio única e idempotente do Bling                                |
| `numero`              | text                          | Número impresso da proposta                                                  |
| `cliente_id`          | relation (clientes, optional) | Referência ao cliente no CRM após matching                                   |
| `bling_contato_id`    | text                          | ID original do contato no Bling                                              |
| `contato_nome`        | text                          | Nome ou razão social do contato                                              |
| `documento`           | text                          | CNPJ ou CPF original                                                         |
| `vendedor_bling`      | text                          | Vendedor registrado no Bling                                                 |
| `vendedor_crm`        | text                          | Vendedor normalizado no CRM (Karoline, Vendas 2, etc.)                       |
| `responsavel_id`      | relation (usuarios, optional) | Usuário responsável pela carteira no CRM                                     |
| `data_proposta`       | date                          | Data da proposta (YYYY-MM-DD)                                                |
| `data_validade`       | date                          | Data de validade da proposta                                                 |
| `valor_total`         | number                        | Valor numérico da proposta                                                   |
| `situacao_bling_id`   | text                          | ID numérico da situação no Bling                                             |
| `situacao_bling_nome` | text                          | Descrição oficial da situação                                                |
| `status_normalizado`  | text                          | `rascunho`, `aguardando`, `nao_aprovada`, `convertida`, `outro`              |
| `status_vinculo`      | select                        | `vinculado`, `pendente`, `sem_cliente`                                       |
| `visivel_funil`       | bool                          | Flag para futura visibilidade (`true` para rascunho/aguardando/não aprovada) |
| `sincronizado_em`     | date                          | Timestamp da sincronização                                                   |

### Índices Criados:

- `idx_bling_propostas_proposta_id` (UNIQUE) em `bling_proposta_id`
- `idx_bling_propostas_cliente` em `cliente_id`
- `idx_bling_propostas_responsavel` em `responsavel_id`
- `idx_bling_propostas_data` em `data_proposta DESC`
- `idx_bling_propostas_vinculo` em `status_vinculo`
- `idx_bling_propostas_visivel` em `visivel_funil`

### Regras de API (RLS):

Mesmo modelo homologado de `bling_pedidos`: `ceo_financeiro` e `coordenador_vendas` têm acesso total à visualização; vendedores têm visibilidade estrita restrita aos documentos de sua carteira (`responsavel_id` ou vínculo com `cliente_id`).

---

## 5. Regras de Normalização de Situações e Visibilidade no Funil

| Situação no Bling                              | Normalização (`status_normalizado`) | Visibilidade Futura (`visivel_funil`) | Destino Futuro no CRM                           |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Rascunho                                       | `rascunho`                          | `true`                                | Futura etapa Funil: Proposta                    |
| Aguardando / Pendente / Enviada                | `aguardando`                        | `true`                                | Futura etapa Funil: Negociação                  |
| Não Aprovada / Recusada / Reprovada            | `nao_aprovada`                      | `true`                                | Futura condição Funil: Perdido                  |
| Convertida / Fechada / Aprovada gerando Pedido | `convertida`                        | `false`                               | Não permanece como proposta (já é pedido)       |
| Outras / Não mapeadas                          | `outro`                             | `false`                               | Retido até nova regra aprovada (+ log de aviso) |

---

## 6. Persistência Idempotente e Matching de Clientes

- **UPSERT por `bling_proposta_id`:** O mapa de propostas existentes em memória é carregado em lotes de 5.000 sem teto. Se a proposta já existir, atualiza todos os dados mantendo o mesmo registro; se for nova, cria o registro. Colisões eventuais de unicidade recuperam o registro via `findFirstRecordByData` e executam o update sem gerar erro fatal.
- **Hierarquia de Matching:**
  1. `bling_id` do contato
  2. CNPJ / CPF (documento normalizado)
  3. Consumidor Final (caso aplicável)
  4. Nome da Empresa / Razão Social
- **Tratamento de Clientes Inexistentes / Conflitos:**
  - Se o cliente não existir: **A proposta JAMAIS é descartada**. Salva com `cliente_id = null`, `status_vinculo = 'pendente'` e `bling_contato_id = id_real`.
  - Se houver conflito de duplicidade de cliente (`nome_empresa: Value must be unique`), isso é registrado apenas como **AVISO** (warning) e a proposta comercial é salva com sucesso.

---

## 7. Expansão de Logs (`bling_sync_logs`) e Interface (`/bling`)

- Coleção `bling_sync_logs` expandida com:
  - `propostas_lidas`
  - `propostas_persistidas`
  - `propostas_atualizadas`
  - `propostas_duplicadas`
  - `propostas_sem_cliente`
  - `paginas_propostas_lidas`
  - `erros_propostas`
- Interface `/bling` atualizada com:
  - Card de métricas de Propostas Comerciais (Propostas Salvas, Vínculos Pendentes, Status do Funil)
  - Grid de resultados pós-sincronização com contadores de Propostas
  - Tabela histórica de logs com coluna dedicada a Propostas
  - Modal de detalhes de execução exibindo avisos e erros estruturados
  - Orientações sobre reautorização OAuth em caso de HTTP 403

---

## 8. Evidência dos Testes Automatizados (Vitest)

A nova suíte `tests/bling-propostas-v0075.test.ts` foi executada e validada:

1. `GET` exclusivo verificado para todos os endpoints de negócio do Bling.
2. Escopo `propostas-comerciais:read` verificado e isolado de permissões de escrita ou finanças.
3. Definição correta do schema e índices em `pocketbase/migrations/0044_create_bling_propostas.js`.
4. Normalização de situações e cálculo determinístico de `visivel_funil`.
5. Idempotência em duas rodadas consecutivas: 0 duplicatas e dados atualizados.
6. Matching de cliente por ID, documento e tolerância a contatos não vinculados.
7. Conflito `nome_empresa unique` não descarta a proposta comercial.
8. Tratamento resiliente de HTTP 403 por escopo.
9. Garantia de que a base homologada `bling_pedidos` e o Funil não sofrem mutações.

Todos os testes passaram integralmente junto com a suíte global do projeto.
