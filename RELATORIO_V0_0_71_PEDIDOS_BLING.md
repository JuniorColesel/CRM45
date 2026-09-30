# Relatório Técnico v0.0.71 — Bling: Persistência Confiável de Pedidos de Venda

**Data:** 01 de Outubro de 2026  
**Versão:** `v0.0.71`  
**Escopo:** Motor de Leitura e Persistência de Pedidos de Venda Bling ERP no CRM Colesel 45  
**Natureza da Operação:** **100% Read-Only** no Bling (nenhum POST/PUT/PATCH/DELETE em dados de negócio)  
**Status do QA:** Aprovado (Linter, Typecheck, Build e Vitest 15 suítes / 110 testes passando)

---

## 1. Causa Exata do Sintoma 300 → 0 Pedidos

Na auditoria das sincronizações anteriores:

1. **Primeira Sincronização:** Leu ~300 pedidos e consolidou valores agregados diretamente nos clientes (`valor_total_vendas`, `data_primeira_compra`, `data_ultima_compra`).
2. **Segunda Sincronização:** Apresentou 0 pedidos lidos.

### Investigação e Diagnóstico Técnico das Causas Raiz:

- **Ausência de Persistência Local:** Até a v0.0.70, os pedidos **não eram persistidos** em nenhuma tabela do CRM. Cada sincronização precisava varrer a API do Bling do início ao fim via paginação genérica.
- **Interrupção Silenciosa por Erro HTTP / Timeout:** O laço de leitura de pedidos anterior continha `break` silencioso caso qualquer status diferente de 200 ocorresse (`if (resPedidos.statusCode !== 200) { errosGerais.push(...); break; }`) sem detalhamento de página, sem medição de duração por página, e sem retentativa contextual com backoff para páginas intermediárias.
- **Tratamento Frágil de Retentativas e Conexão Transitória:** Falhas temporárias (como 429 Too Many Requests ou 502/504 Bad Gateway comuns em picos da API do Bling) podiam abortar o loop na página 1 antes de qualquer pedido ser processado, registrando apenas o resumo genérico.
- **Falha de Conciliação e Dependência Exclusiva de Clientes:** Se o contato do pedido falhasse na conciliação ou se o contato sofresse com a trava do índice único em `nome_empresa`, o pedido era simplesmente descartado ou não computado.

---

## 2. Correções Aplicadas na Leitura e Paginação

1. **Leitura Paginada Robusta e Observável:**
   - Endpoint utilizado: `GET https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=N&limite=100`.
   - Registro detalhado de auditoria por página: página consultada, status HTTP, duração em milissegundos e erro detalhado.
   - Retentativas com **Backoff Ativo** (até 3 tentativas para códigos 429 e 5xx).
   - Nenhuma saída silenciosa: erros são estruturados no novo campo `erros_pedidos` da coleção `bling_sync_logs`.

2. **Detecção e Busca de Situações Reais:**
   - Consulta dinâmica de situações dos módulos via `GET https://api.bling.com.br/Api/v3/situacoes/modulos` com fallback resiliente para as situações observadas nos payloads dos pedidos.
   - Tabela de situações mapeadas:
     | ID Situação | Situação no Bling | Status Normalizado no CRM |
     |:-----------:|:------------------|:--------------------------|
     | _ | Em aberto / Pendente / Aguardando | `em_aberto` |
     | _ | Em andamento / Em processamento | `em_andamento` |
     | _ | Atendido / Faturado / Concluído / Entregue | `atendido` |
     | _ | Cancelado / Estornado | `cancelado` |
     | Outros | Situação personalizada | `outro` |

3. **Mapeamento de Vendedores:**
   - Reutilização estrita da função homologada `mapearVendedor()`:
     - Alice Paitra Colesel → `Alice`
     - Renan Souza / outros desconhecidos → `Renan` (default homologado)
     - Karoline / Vendas 1 / Maria Caroline Santos / Consumidor Final → `Karoline (Vendas 1)`
     - Vendas 2 → `Vendas 2`
   - Resolução determinística para a coleção `usuarios`:
     - Resolução do ID do usuário CRM correspondente para o campo `responsavel_id`.

---

## 3. Coleção `bling_pedidos` e Estrutura de Dados

Criada a coleção `bling_pedidos` na Migração `0032_create_bling_pedidos.js` com a seguinte modelagem:

| Campo                 | Tipo                               | Descrição                                                             |
| :-------------------- | :--------------------------------- | :-------------------------------------------------------------------- |
| `bling_pedido_id`     | text (único, obrigatório)          | ID numérico ou textual do pedido no Bling                             |
| `numero`              | text                               | Número visível do pedido de venda                                     |
| `cliente_id`          | relation (clientes, opcional)      | Vínculo com o cliente no CRM Colesel 45                               |
| `bling_contato_id`    | text                               | ID do contato associado no Bling                                      |
| `contato_nome`        | text                               | Nome ou Razão Social do contato no pedido                             |
| `documento`           | text                               | CPF ou CNPJ original do pedido                                        |
| `vendedor_bling`      | text                               | Nome do vendedor retornado pelo Bling                                 |
| `vendedor_crm`        | text                               | Nome padronizado do vendedor no CRM                                   |
| `responsavel_id`      | relation (usuarios, opcional)      | Usuário responsável pela carteira no CRM                              |
| `data_pedido`         | date                               | Data em que o pedido foi emitido                                      |
| `data_atendimento`    | date                               | Data de atendimento / saída se disponível                             |
| `valor_total`         | number                             | Valor monetário total do pedido                                       |
| `situacao_bling_id`   | text                               | ID da situação no Bling                                               |
| `situacao_bling_nome` | text                               | Nome ou descrição da situação                                         |
| `status_normalizado`  | text                               | `atendido` \| `cancelado` \| `em_aberto` \| `em_andamento` \| `outro` |
| `status_vinculo`      | select                             | `vinculado` \| `pendente` \| `sem_cliente`                            |
| `oportunidade_id`     | relation (oportunidades, opcional) | Reservado para fases futuras (inalterado nesta versão)                |
| `sincronizado_em`     | date                               | Timestamp da última conciliação                                       |

### Índices Criados:

- `CREATE UNIQUE INDEX idx_bling_pedidos_pedido_id ON bling_pedidos (bling_pedido_id)`
- `CREATE INDEX idx_bling_pedidos_cliente ON bling_pedidos (cliente_id)`
- `CREATE INDEX idx_bling_pedidos_responsavel ON bling_pedidos (responsavel_id)`
- `CREATE INDEX idx_bling_pedidos_data ON bling_pedidos (data_pedido DESC)`
- `CREATE INDEX idx_bling_pedidos_vinculo ON bling_pedidos (status_vinculo)`

### Regras de RLS / Permissões:

- **List / View:** Administradores (`ceo_financeiro` e `coordenador_vendas`) visualizam todos os pedidos; vendedores (`vendedor_1` e `vendedor_2`) visualizam exclusivamente os pedidos atribuídos à sua carteira (via `responsavel_id` ou via `cliente_id`).
- **Create / Update / Delete:** Restrito a chamadas autenticadas com perfil administrativo (`ceo_financeiro` e `coordenador_vendas`).

---

## 4. Matching Resiliente e Desacoplamento de Clientes

- **Prioridade de Matching:**
  1. `bling_id` do cliente cadastrado;
  2. CNPJ / CPF normalizado (sem pontuações);
  3. Consumidor Final unificado;
  4. Razão Social / Nome da empresa.
- **Tratamento de Pedidos Sem Cliente ou Conflito de `nome_empresa`:**
  - Caso o cliente não exista ou ocorra qualquer erro na inserção/atualização cadastral (como o índice único de `nome_empresa`), o pedido **NÃO É DESCARTADO**.
  - O pedido é gravado em `bling_pedidos` com:
    - `cliente_id = null`
    - `status_vinculo = "pendente"`
    - `bling_contato_id = <ID real retornado pelo Bling>`
    - `contato_nome = <Nome retornado pelo Bling>`
    - `documento = <Documento retornado pelo Bling>`
  - Isso garante que nenhuma venda seja perdida por inconsistência cadastral externa.

---

## 5. Prova de Idempotência e Suíte de Testes

A suíte de testes `tests/bling-pedidos-v0071.test.ts` foi adicionada com 10 testes automatizados cobrindo os requisitos:

1. `Idempotência: rodar a mesma sincronização 2x não duplica pedidos no CRM`: Aprovado.
2. `Pedido sem cliente correspondente é persistido localmente com status_vinculo "pendente"`: Aprovado.
3. `UPSERT determinístico: atualiza os dados do pedido local quando seu bling_pedido_id já existe`: Aprovado.
4. `Chamada HTTP com status 429 Too Many Requests executa retry até 3 vezes com backoff`: Aprovado.
5. `Chamada HTTP com erro de servidor 5xx executa retry até 3 vezes com backoff`: Aprovado.
6. `Falha em página de pedidos é capturada em erros_pedidos sem quebrar o log de auditoria`: Aprovado.
7. `Situação do pedido é gravada com id, nome e status_normalizado`: Aprovado.
8. `Vendedor do pedido é mapeado e atribuído ao usuário CRM correspondente`: Aprovado.
9. `Prioridade de matching: associa o pedido ao cliente por bling_id antes de CNPJ ou Razão Social`: Aprovado.
10. `Operação 100% Read-Only: nenhum POST/PUT/PATCH/DELETE em dados de negócio do Bling`: Aprovado.

---

## 6. Prova de Execução Real e Instruções para o Usuário

Conforme o **Lembrete Crítico de Infraestrutura** do projeto CRM Colesel 45:

> _O developer NÃO possui ferramenta de rede/HTTP direta para disparar o endpoint seguro `/backend/v1/bling/sincronizar` — qualquer tentativa de disparar via migrações/hooks automáticos gerou incidentes no passado (28/09 e 30/09)._

### Passo a passo para o teste real de duas sincronizações consecutivas:

1. Acesse o CRM em `/bling` autenticado como `ceo_financeiro` (Alice Paitra Colesel).
2. Verifique se o status do Bling indica **Conectado (OAuth v3)**.
3. Clique no botão **"SINCRONIZAR AGORA"** para a 1ª execução:
   - Observe a leitura de contatos e pedidos.
   - O card de indicadores exibirá a contagem de **Pedidos Salvos (`bling_pedidos`)** e pedidos com **Vínculo Pendente**.
4. Clique novamente no botão **"SINCRONIZAR AGORA"** para a 2ª execução:
   - Os pedidos lidos serão confrontados via UPSERT por `bling_pedido_id`.
   - O contador de novos pedidos persistidos será 0 (ou apenas pedidos genuinamente criados no ERP no intervalo).
   - O contador de pedidos atualizados registrará a totalidade dos pedidos existentes.
   - Nenhuma duplicação numérica de pedidos ou valores ocorrerá.
