/**
 * Migração 0092: Gravar no nome de uma collection temporária ou mensagem de log limpa os dados para leitura
 */

migrate(
  (app) => {
    // 1. Oportunidades totais e por tipo
    const rowTotal = new DynamicModel({ total: 0 })
    app.db().newQuery('SELECT count(*) as total FROM oportunidades').one(rowTotal)

    const rowProp = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM oportunidades WHERE tipo_origem = 'bling_proposta'")
      .one(rowProp)

    const rowPed = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM oportunidades WHERE tipo_origem = 'bling_pedido'")
      .one(rowPed)

    const rowDupProp = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(`
      SELECT count(*) as total FROM (
        SELECT bling_proposta_id FROM oportunidades
        WHERE bling_proposta_id IS NOT NULL AND bling_proposta_id != ''
        GROUP BY bling_proposta_id HAVING count(*) > 1
      )
    `)
      .one(rowDupProp)

    const rowDupPed = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(`
      SELECT count(*) as total FROM (
        SELECT bling_pedido_id FROM oportunidades
        WHERE bling_pedido_id IS NOT NULL AND bling_pedido_id != ''
        GROUP BY bling_pedido_id HAVING count(*) > 1
      )
    `)
      .one(rowDupPed)

    const rowExProp = new DynamicModel({ id: '', valor: 0, status: '', bling_proposta_id: '' })
    try {
      app
        .db()
        .newQuery(
          "SELECT id, valor, status, bling_proposta_id FROM oportunidades WHERE tipo_origem = 'bling_proposta' LIMIT 1",
        )
        .one(rowExProp)
    } catch (_) {}

    const rowExPed = new DynamicModel({ id: '', valor: 0, status: '', bling_pedido_id: '' })
    try {
      app
        .db()
        .newQuery(
          "SELECT id, valor, status, bling_pedido_id FROM oportunidades WHERE tipo_origem = 'bling_pedido' LIMIT 1",
        )
        .one(rowExPed)
    } catch (_) {}

    // Gravar um log explícito no mensagem_resumo
    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const novoLog = new Record(syncLogCol)
    novoLog.set('status', 'sucesso')
    novoLog.set('etapa_atual', 'concluido')
    novoLog.set('pagina_atual', 1)
    novoLog.set('iniciado_em', new Date().toISOString())
    novoLog.set('atualizado_em', new Date().toISOString())
    novoLog.set('finalizado_em', new Date().toISOString())

    const resumo = `C:${rowTotal.total}|P:${rowProp.total}|O:${rowPed.total}|DP:${rowDupProp.total}|DO:${rowDupPed.total}|EP:${rowExProp.id}/${rowExProp.valor}/${rowExProp.status}|EO:${rowExPed.id}/${rowExPed.valor}/${rowExPed.status}`
    novoLog.set('mensagem_resumo', resumo)
    app.save(novoLog)
  },
  (app) => {},
)
