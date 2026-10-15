/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0072: Garantir que responsavel_id da tabela SQLite oportunidades seja NULL e relatar contagens do Backfill
 */
migrate((app) => {
  try {
    const opCol = app.findCollectionByNameOrId('oportunidades')
    const respField = opCol.fields.getByName('responsavel_id')
    if (respField) {
      respField.required = false
      app.save(opCol)
    }
  } catch (err) {
    console.error('[MIGRATION-0072] Erro ao ajustar campo responsavel_id:', err)
  }

  // Contagem para auditoria da Parte B / R:
  // - Clientes atribuídos a Alice
  // - Pedidos Bling com Alice
  // - Propostas Bling com Alice
  // - Oportunidades com Alice
  try {
    const rowCli = new DynamicModel({ total: 0 })
    app.db().newQuery("SELECT count(*) as total FROM clientes WHERE vendedor = 'Alice'").one(rowCli)

    const rowPed = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM bling_pedidos WHERE vendedor_crm = 'Alice'")
      .one(rowPed)

    const rowProp = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM bling_propostas WHERE vendedor_crm = 'Alice'")
      .one(rowProp)

    const rowOps = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM oportunidades WHERE vendedor = '7nngwxctdc2209b'")
      .one(rowOps)

    console.log(
      `[BACKFILL-REPORT] Atribuições Alice Paitra: Clientes=${rowCli.total}, Pedidos=${rowPed.total}, Propostas=${rowProp.total}, Oportunidades=${rowOps.total}`,
    )
  } catch (errReport) {
    console.error('[MIGRATION-0072] Erro ao emitir relatório:', errReport)
  }
})
