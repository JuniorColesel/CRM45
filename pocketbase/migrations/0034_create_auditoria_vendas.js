migrate(
  (app) => {
    // Criar tabela de auditoria bling_auditoria_vendas
    if (!app.hasTable('bling_auditoria_vendas')) {
      const col = new Collection({
        name: 'bling_auditoria_vendas',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          { name: 'chave', type: 'text', required: true },
          { name: 'ano', type: 'text' },
          { name: 'situacao_id', type: 'text' },
          { name: 'situacao_nome', type: 'text' },
          { name: 'pedidos_qtd', type: 'number' },
          { name: 'valor_total', type: 'number' },
          { name: 'detalhes_json', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(col)
    }

    // Preencher dados agregados de bling_pedidos
    app
      .db()
      .newQuery(`
    INSERT INTO bling_auditoria_vendas (id, chave, ano, situacao_id, situacao_nome, pedidos_qtd, valor_total, created, updated)
    SELECT 
      substr(hex(randomblob(8)), 1, 15) as id,
      'por_ano_situacao' as chave,
      substr(data_pedido, 1, 4) as ano,
      situacao_bling_id as situacao_id,
      situacao_bling_nome as situacao_nome,
      count(*) as pedidos_qtd,
      round(sum(valor_total), 2) as valor_total,
      datetime('now') as created,
      datetime('now') as updated
    FROM bling_pedidos
    GROUP BY substr(data_pedido, 1, 4), situacao_bling_id
  `)
      .execute()

    // Preencher totais consolidados
    app
      .db()
      .newQuery(`
    INSERT INTO bling_auditoria_vendas (id, chave, ano, situacao_id, situacao_nome, pedidos_qtd, valor_total, created, updated)
    SELECT 
      substr(hex(randomblob(8)), 1, 15) as id,
      'total_geral' as chave,
      'todos' as ano,
      'todos' as situacao_id,
      'Total Geral' as situacao_nome,
      count(*) as pedidos_qtd,
      round(sum(valor_total), 2) as valor_total,
      datetime('now') as created,
      datetime('now') as updated
    FROM bling_pedidos
  `)
      .execute()

    // Preencher totais válidos geral
    app
      .db()
      .newQuery(`
    INSERT INTO bling_auditoria_vendas (id, chave, ano, situacao_id, situacao_nome, pedidos_qtd, valor_total, created, updated)
    SELECT 
      substr(hex(randomblob(8)), 1, 15) as id,
      'total_validos' as chave,
      'todos' as ano,
      '6,9' as situacao_id,
      'Válidos (Em aberto + Atendido)' as situacao_nome,
      count(*) as pedidos_qtd,
      round(sum(valor_total), 2) as valor_total,
      datetime('now') as created,
      datetime('now') as updated
    FROM bling_pedidos
    WHERE situacao_bling_id IN ('6', '9')
  `)
      .execute()

    // Preencher total clientes
    app
      .db()
      .newQuery(`
    INSERT INTO bling_auditoria_vendas (id, chave, ano, situacao_id, situacao_nome, pedidos_qtd, valor_total, created, updated)
    SELECT 
      substr(hex(randomblob(8)), 1, 15) as id,
      'clientes_consolidado' as chave,
      'todos' as ano,
      'clientes' as situacao_id,
      'Clientes com valor > 0' as situacao_nome,
      count(*) as pedidos_qtd,
      round(sum(valor_total_vendas), 2) as valor_total,
      datetime('now') as created,
      datetime('now') as updated
    FROM clientes
    WHERE valor_total_vendas > 0
  `)
      .execute()
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('bling_auditoria_vendas')
      app.delete(col)
    } catch (_) {}
  },
)
