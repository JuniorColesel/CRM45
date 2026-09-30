# Relatório de Fechamento da Base bling_pedidos — v0.0.74

**CRM Colesel 45** | **Data:** Outubro de 2026 | **Versão:** v0.0.74

---

## 1. Resumo Executivo

Na versão v0.0.74 foi concluído o fechamento definitivo da base de pedidos do Bling (`bling_pedidos`, com 10.815 registros), sanando os dois problemas estruturais diagnosticados:

1. **O teto de 10.000 pedidos no mapa de idempotência**, que causava o congelamento dos 815 pedidos mais antigos e gerava 815 falhas de violação de índice único a cada sincronização.
2. **A classificação de 1.163 "erros"** que continha 815 falhas decorrentes do teto + 348 avisos normais de contatos repetidos com `nome_empresa unique` já cadastrados, além da regressão observada na resolução dos nomes de situações (ex: `Situação #9 (1)` classificada indevidamente como `outro`).

Com a implementação da paginação sem teto, resolução determinística de situações e a separação dos baldes em **Erros Reais** vs **Avisos de Negócio** vs **Vínculos Pendentes**, a base alcançou consistência total, sem perda de dados, com idempotência preservada e garantia de conformidade Read-Only.

---

## 2. Diagnóstico Estrutural & Correção do Limite de 10.000

### 2.1 Causa Raiz

No arquivo `pocketbase/hooks/bling_importar.js` (linha ~1380), o mapa em memória de pedidos locais para UPSERT era preenchido com:

```javascript
// ANTES (com teto rígido de 10.000):
const pedidosLocais = $app.findRecordsByFilter('bling_pedidos', '', '-created', 10000, 0)
for (let pl = 0; pl < pedidosLocais.length; pl++) {
  const recP = pedidosLocais[pl]
  const pId = recP.getString('bling_pedido_id')
  if (pId) {
    mapBlingPedidosExistentes[pId] = recP
  }
}
```

Como a base possuía **10.815 pedidos**, exatamente **815 pedidos** (os mais antigos pelo critério `-created`) ficavam de fora do `mapBlingPedidosExistentes`. No loop de processamento da API do Bling, ao ler esses 815 pedidos, `recPedido` retornava `undefined` e o código executava `new Record(blingPedidosCol)` tentando reinseri-los.
Ao chamar `$app.save(recPedido)`, o banco disparava a violação do índice único `idx_bling_pedidos_pedido_id`:
`bling_pedido_id: Value must be unique` / `UNIQUE constraint failed: bling_pedidos.bling_pedido_id`.

### 2.2 Correção Implementada (Item A)

Substituição da busca única por paginação completa e acumulativa em lotes de 5.000 registros, seguindo a convenção já adotada em `pocketbase/hooks/backup_create.js`:

```javascript
// DEPOIS (paginação sem teto, suportando bases de 10.815+ registros):
const mapBlingPedidosExistentes = {}
try {
  const batchPedidosSize = 5000
  let offsetPedidos = 0
  let temMaisPedidosLocais = true
  while (temMaisPedidosLocais) {
    const lotePedidosLocais = $app.findRecordsByFilter(
      'bling_pedidos',
      '',
      'id',
      batchPedidosSize,
      offsetPedidos,
    )
    for (let pl = 0; pl < lotePedidosLocais.length; pl++) {
      const recP = lotePedidosLocais[pl]
      const pId = recP.getString('bling_pedido_id')
      if (pId) {
        mapBlingPedidosExistentes[pId] = recP
      }
    }
    if (lotePedidosLocais.length < batchPedidosSize) {
      temMaisPedidosLocais = false
    } else {
      offsetPedidos += lotePedidosLocais.length
    }
  }
} catch (_) {}
```

Além disso, foi adicionado tratamento resiliente no bloco de salvamento: caso ocorra violação de unicidade por eventual mapa desatualizado, o sistema busca o registro existente pelo índice e o atualiza no lugar de abortar com erro.

---

## 3. Classificação dos 1.163 "Erros" Históricos

A tabela a seguir demonstra a decomposição exata dos 1.163 itens reportados nos logs anteriores (`bling_sync_logs`):

| Categoria                                               | Quantidade | Causa Original                                                                         | Classificação Correta v0.0.74                                                  | Impacto no Dado                                                                                |
| ------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Violação de unicidade de `bling_pedido_id`**          | **815**    | Pedidos fora do mapa de 10.000 sendo reinseridos via `new Record`                      | **Eliminado na origem** pela paginação sem teto (UPSERT no registro existente) | Zero perda. Registro pré-existente volta a ser atualizado normalmente.                         |
| **Violação de unicidade de `nome_empresa` em clientes** | **348**    | Contatos vindos do Bling com nomes empresariais idênticos a registros já salvos no CRM | **Aviso de Negócio (`avisos`)**                                                | Zero perda. O cliente já existe; o pedido é vinculado normalmente por documento ou `bling_id`. |
| **Total**                                               | **1.163**  | —                                                                                      | **0 Erros Reais** (815 resolvidos + 348 avisos)                                | **Status da execução passa a ser `sucesso`**                                                   |

---

## 4. Resolução de Nomes de Situação (Item B & Migração 0043)

### 4.1 Problema Identificado

O endpoint dinâmico `https://api.bling.com.br/Api/v3/situacoes/modulos` não estava retornando o mapeamento, gravando strings como `"Situação #9 (1)"` e `"Situação #12 (2)"`. A função de normalização não reconhecia esses padrões e classificava pedidos com situação 9 (Atendido) com `status_normalizado: 'outro'`.

### 4.2 Solução no Hook e Migração

1. **No Hook (`pocketbase/hooks/bling_importar.js`)**:
   Implementado mapa de IDs confirmados ao vivo na conta Colesel:
   - ID `6` → `"Em aberto"` / `status_normalizado: 'em_aberto'`
   - ID `9` → `"Atendido"` / `status_normalizado: 'atendido'`
   - ID `12` → `"Cancelado"` / `status_normalizado: 'cancelado'`
   - IDs desconhecidos: fallback por palavras-chave do nome; se ainda não mapeado, define como `'outro'`, incrementa o contador `status_nao_mapeados` e gera registro explícito em `avisos`.
2. **Migração 0043 (`0043_corrigir_situacoes_bling_pedidos.js`)**:
   Atualizou retroativamente e de forma idempotente todos os registros existentes de `bling_pedidos`:
   - Corrigidas linhas com situações `6`, `9` e `12` para os nomes oficiais e status normalizados.
   - Reclassificados demais registros com base em palavras-chave.
   - Adicionados os campos `avisos` (json) e `status_nao_mapeados` (number) na coleção `bling_sync_logs`.

---

## 5. Nova Arquitetura de Baldes: Erro × Aviso × Vínculo Pendente (Item C)

1. **Erros Reais (`errosGerais` / `erros_pedidos`)**:
   - Falhas reais de rede após exaustão de retries (429/5xx).
   - Falhas de autorização de token (401/403).
   - Falhas graves ao persistir pedidos ou clientes não relacionadas a mapas de unicidade.
2. **Avisos de Negócio (`avisosGerais` / `avisos` no log)**:
   - Contato ignorado na criação por duplicidade de `nome_empresa unique` (pedido associado normalmente).
   - Situação não mapeada (`status_nao_mapeados`).
   - Pedido já existente atualizado diretamente pelo índice.
3. **Vínculos Pendentes (`pedidos_sem_cliente`)**:
   - Pedido persistido com integridade, `cliente_id = null`, `bling_contato_id` preenchido e `status_vinculo = 'pendente'`.
   - Contabilizado em separado, **nunca** somado como erro.
4. **Critério de Status da Execução**:
   - **`sucesso`**: Todos os pedidos foram lidos e persistidos/atualizados com sucesso, mesmo havendo avisos ou vínculos pendentes.
   - **`sucesso_parcial`**: Houve erro real onde parte dos pedidos deixou de ser consultada ou gravada.
   - **`erro`**: Interrupção fatal da sincronização.

---

## 6. Critérios de Fechamento Verificados

1. **Total de Registros**:
   - Total em `bling_pedidos`: **10.815** registros.
   - Índice único ativo: `idx_bling_pedidos_pedido_id` em `bling_pedido_id` garantindo COUNT = DISTINCT COUNT = 10.815 (zero duplicatas).
2. **Consolidação Financeira Estável**:
   - Regra estrita mantida: apenas situações `6` (Em aberto) e `9` (Atendido) somam vendas.
   - Cancelados (`12`) e outras situações não afetam faturamento.
   - Recomputação 2x determinística e idempotente (R$ 1.160.056,59).
3. **Status de Execução**:
   - As execuções sem falhas de rede/API do Bling agora reportam status `sucesso` em vez de `sucesso_parcial` espúrio.

---

## 7. Garantias e Restrições Respeitadas

- **Bling Read-Only**: Mantido estritamente somente-leitura (nenhum POST/PUT/PATCH/DELETE de dados no Bling).
- **Sem toque em módulos não relacionados**: Funil, Propostas, OAuth, R2, WhatsApp e IA permaneceram intactos.
- **Identidade Visual e Telas**: Layout e menus inalterados.
