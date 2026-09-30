migrate(
  (app) => {
    // 1. Adicionar campo 'avisos' (json) e 'status_nao_mapeados' (number) em bling_sync_logs se não existirem
    const colLogs = app.findCollectionByNameOrId('bling_sync_logs')
    let alterouLogs = false
    if (!colLogs.fields.getByName('avisos')) {
      colLogs.fields.add(new JSONField({ name: 'avisos', maxSize: 2097152 }))
      alterouLogs = true
    }
    if (!colLogs.fields.getByName('status_nao_mapeados')) {
      colLogs.fields.add(new NumberField({ name: 'status_nao_mapeados', onlyInt: true }))
      alterouLogs = true
    }
    if (alterouLogs) {
      app.save(colLogs)
    }

    // 2. Correção de dados de bling_pedidos:
    // - situacao_bling_id = '6' -> 'Em aberto', 'em_aberto'
    // - situacao_bling_id = '9' -> 'Atendido', 'atendido'
    // - situacao_bling_id = '12' -> 'Cancelado', 'cancelado'
    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Em aberto', status_normalizado = 'em_aberto'
    WHERE situacao_bling_id = '6'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Atendido', status_normalizado = 'atendido'
    WHERE situacao_bling_id = '9'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Cancelado', status_normalizado = 'cancelado'
    WHERE situacao_bling_id = '12'
  `)
      .execute()

    // 3. Reclassificar situações por palavra-chave para os demais IDs (ex: se o nome contiver termos conhecidos)
    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET status_normalizado = 'atendido'
    WHERE situacao_bling_id NOT IN ('6', '9', '12')
      AND (
        LOWER(situacao_bling_nome) LIKE '%atendido%'
        OR LOWER(situacao_bling_nome) LIKE '%faturado%'
        OR LOWER(situacao_bling_nome) LIKE '%concluid%'
        OR LOWER(situacao_bling_nome) LIKE '%entregue%'
      )
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET status_normalizado = 'cancelado'
    WHERE situacao_bling_id NOT IN ('6', '9', '12')
      AND (
        LOWER(situacao_bling_nome) LIKE '%cancelad%'
        OR LOWER(situacao_bling_nome) LIKE '%estorn%'
      )
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET status_normalizado = 'em_aberto'
    WHERE situacao_bling_id NOT IN ('6', '9', '12')
      AND (
        LOWER(situacao_bling_nome) LIKE '%aberto%'
        OR LOWER(situacao_bling_nome) LIKE '%pendente%'
        OR LOWER(situacao_bling_nome) LIKE '%aguard%'
      )
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET status_normalizado = 'em_andamento'
    WHERE situacao_bling_id NOT IN ('6', '9', '12')
      AND (
        LOWER(situacao_bling_nome) LIKE '%andamento%'
        OR LOWER(situacao_bling_nome) LIKE '%process%'
      )
  `)
      .execute()
  },
  (app) => {
    // Revert opcional - idempotent
  },
)
