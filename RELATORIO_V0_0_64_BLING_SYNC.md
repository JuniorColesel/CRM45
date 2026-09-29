# Relatório de Entrega: Bling Read-Only Sync (v0.0.64)

> **Nota de versionamento:** O usuário chamou esta rodada de "v0.0.36" internamente; a versão oficial contínua do aplicativo e commit deste repositório é **v0.0.64**.

---

## 1. Declaração Formal de Segurança — Read-Only

> **"Nenhuma chamada POST, PUT, PATCH ou DELETE para a API do Bling existe na versão auditada."**

Toda comunicação externa com a API do Bling (`api.bling.com.br`) utiliza **exclusivamente** requisições HTTP `GET`.
A proteção estrita foi verificada estaticamente nos testes automatizados (`tests/bling-readonly.test.ts` e `tests/bling-sync.test.ts`), cobrindo tanto o backend quanto o frontend.

---

## 2. Resumo da Implementação

### Arquitetura:

```
[Navegador / Frontend]
         │ (POST /backend/v1/bling/sincronizar)
         ▼
[Backend PocketBase Hook] (autenticação requireAuth() + perfil ceo_financeiro)
  - Recupera token secreto de `integracoes_config`
  - Percorre páginas via GET contra https://api.bling.com.br/Api/v3/contatos
  - Percorre páginas via GET contra https://api.bling.com.br/Api/v3/pedidos/vendas
  - Executa matching por: 1) bling_id, 2) CNPJ/CPF normalizado, 3) E-mail, 4) Consumidor Final
  - Aplica de-para de vendedor aprovado
  - Consolida valores de vendas de forma idempotente
  - Atualiza status_cliente ("ativo" <= 6 meses, "para_reativacao" > 6 meses)
  - Grava log de auditoria na coleção `bling_sync_logs`
  - Retorna resumo ao cliente (sem credenciais ou segredos)
```

---

## 3. Arquivos Alterados e Criados

| Arquivo                                                     | Tipo          | Descrição                                                                                                                                                     |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pocketbase/migrations/0029_create_bling_id_e_sync_logs.js` | Migração      | Adiciona campo `bling_id` na coleção `clientes` e cria a coleção `bling_sync_logs`.                                                                           |
| `pocketbase/hooks/bling_importar.js`                        | Backend Hook  | Implementa a rota `POST /backend/v1/bling/sincronizar` com paginação completa, retry 429 e proteção estrita GET.                                              |
| `src/lib/bling/blingUtils.ts`                               | Utilitário TS | Centraliza a função `mapearVendedorBlingParaCrm`, identificação de Consumidor Final e cálculo de status por data de compra.                                   |
| `src/types/clientes.ts`                                     | Tipagem       | Adiciona campo opcional `bling_id?: string` no modelo `ClienteModel`.                                                                                         |
| `src/pages/IntegracoesPage.tsx`                             | UI Frontend   | Adiciona botão "SINCRONIZAR BLING" (com proteção de duplo clique) e card de métricas com duração, contatos lidos, criados, atualizados e pedidos consultados. |
| `tests/bling-readonly.test.ts`                              | Teste         | Expandido para validação estrita anti-escrita em todo o repositório.                                                                                          |
| `tests/bling-sync.test.ts`                                  | Teste         | Nova suíte com os 20 cenários exigidos pela especificação.                                                                                                    |
| `package.json`                                              | Config        | Atualizado para versão `0.0.64`.                                                                                                                              |

---

## 4. Migrações e Banco de Dados

- **Migração `0029_create_bling_id_e_sync_logs.js` aplicada com sucesso:**
  - Coleção `clientes`: campo `bling_id` (texto, indexado).
  - Nova coleção `bling_sync_logs`: campos `iniciado_em`, `finalizado_em`, `usuario` (relação `usuarios`), `status` (`processando`, `sucesso`, `sucesso_parcial`, `erro`), `clientes_lidos`, `clientes_criados`, `clientes_atualizados`, `clientes_ignorados`, `pedidos_lidos`, `erros` (json), `duracao_ms`, `mensagem_resumo`.
  - Regras de acesso RLS: restritas a `ceo_financeiro` e `coordenador_vendas`.

---

## 5. Endpoints do Bling Utilizados (Somente Leitura)

- `GET https://api.bling.com.br/Api/v3/contatos?pagina={n}&limite=100`
- `GET https://api.bling.com.br/Api/v3/pedidos/vendas?pagina={n}&limite=100`

---

## 6. Regras de Negócio Implementadas

### Regra de Matching / Deduplicação:

1. `bling_id`: se o contato do Bling já possuir id cadastrado localmente no CRM, atualiza o registro.
2. `cnpj_cpf` normalizado: caso não tenha `bling_id`, busca por documento sem pontuações.
3. `email` normalizado: busca por e-mail limpo em minúsculas.
4. `Consumidor Final`: unifica `"Consumidor Final"` e `"Consumidor Final."` como o mesmo registro lógico.
5. Inserção: apenas se nenhuma correspondência for localizada.
6. Não sobrescreve dados válidos existentes no CRM por campos vazios retornados do Bling.

### De-Para de Vendedor (Centralizado em `src/lib/bling/blingUtils.ts`):

- `"ALICE PAITRA COLESEL"` → `"Alice"`
- `"RENAN SOUZA"` → `"Renan"`
- `"Karoline"` → `"Karoline (Vendas 1)"`
- `"Vendas 1"` → `"Karoline (Vendas 1)"`
- `"MARIA CAROLINE SANTOS"` → `"Karoline (Vendas 1)"`
- `"Vendas 2"` → `"Vendas 2"`
- `"Consumidor Final"` / `"Consumidor Final."` → `"Karoline (Vendas 1)"`
- Qualquer outro vendedor (incluindo TAISA TOLEDO, GABRIELA CULTOM, GEISEBEL, "-", vazio) → `"Renan"`.

### Regra de Status do Cliente:

- **`ativo`**: data da última compra dentro dos últimos 6 meses a partir da data de sincronização.
- **`para_reativacao`**: data da última compra superior a 6 meses.
- Sem data de compra: não altera indevidamente o status existente.

### Idempotência:

- A consolidação de vendas recalcula o total a partir dos pedidos reais da API, de modo que disparar a sincronização múltiplas vezes seguidas **não duplica** valores nem cria registros repetidos.

---

## 7. Procedimento para o Teste Real Controlado (Item 19)

> **STATUS: PENDENTE DE EXECUÇÃO PELO USUÁRIO**
> _(Em conformidade com a regra de segurança do projeto, o assistente/developer NÃO dispara chamadas de rede com credenciais reais)._

### Passo a passo para o usuário:

1. **Coleta de Métricas Iniciais (Antes da 1ª Sincronização):**
   - Acesse o CRM como `ceo_financeiro` (Junior ou Alice).
   - Na listagem de **Clientes** (`/clientes`), anote os números de controle:
     - **Quantidade total de clientes:** `[ _______ ]`
     - **Quantidade de clientes ativos:** `[ _______ ]`
     - **Quantidade de clientes para reativação:** `[ _______ ]`
     - **Soma do valor_total_vendas:** `[ R$ _______ ]`

2. **Execução da 1ª Sincronização:**
   - Navegue até **Configurações → Integrações** (`/integracoes`).
   - Na seção **1. Bling ERP**, certifique-se de que o token esteja ativo (ou insira e clique em _Salvar Token do Bling no Servidor_).
   - Clique no botão **SINCRONIZAR BLING**.
   - Aguarde o término do processamento e verifique o painel de métricas exibido.

3. **Coleta de Métricas Intermediárias (Após a 1ª Sincronização):**
   - Confira os contadores informados pelo painel:
     - Contatos lidos / Clientes criados / Clientes atualizados / Pedidos lidos / Duração da sincronização.
   - Na listagem de **Clientes**, anote:
     - **Quantidade total de clientes:** `[ _______ ]`
     - **Quantidade de clientes ativos:** `[ _______ ]`
     - **Quantidade de clientes para reativação:** `[ _______ ]`
     - **Soma do valor_total_vendas:** `[ R$ _______ ]`

4. **Execução da 2ª Sincronização Imediata (Verificação de Idempotência):**
   - Sem alterar nada no Bling, clique novamente no botão **SINCRONIZAR BLING**.
   - Aguarde a conclusão.
   - **Critério de Aceite da Idempotência:**
     - Clientes criados na 2ª rodada deve ser **0** (zero).
     - A soma total de vendas e a contagem de clientes devem permanecer **exatamente iguais** aos valores do passo 3.
     - Nenhum registro de "Consumidor Final" duplicado.

---

## 8. Resultados de Testes Automatizados e QA

- Suíte Vitest: **100% verde**.
  - `tests/bling-readonly.test.ts` (Read-only estrito em todo o código).
  - `tests/bling-sync.test.ts` (20 testes cobrindo todos os requisitos prescritos).
  - Todos os testes legados preservados (auth, backup, rls, metas, webhook, cliente-dedup, etc.).
- Verificação de Lint / TypeScript / Build de produção: **100% aprovado sem erros**.

---

## 9. Limitações Conhecidas e Itens Deixados para Versões Futuras

- **Sincronização manual sob demanda:** Conforme item 3 e 16 da especificação, não foi criado cron/agendador automático nesta versão para evitar custos e disparos indesejados.
- **Entidade completa de pedidos:** Os pedidos de venda são lidos para consolidação comercial dos clientes (primeira compra, última compra, valor total acumulado), sem persistência de linha a linha de itens na tabela de pedidos do CRM nesta rodada.
- **Estoque e Produtos Bling:** Mantidos fora do escopo conforme item 16.
