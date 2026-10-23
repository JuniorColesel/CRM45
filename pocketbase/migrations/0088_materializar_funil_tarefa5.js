/**
 * Migração 0088: Diagnóstico etapas do funil
 */

migrate(
  (app) => {
    const etapas = app.findRecordsByFilter('etapas_funil', '', 'ordem', 20, 0)
    const logInfo = []
    for (let i = 0; i < etapas.length; i++) {
      const e = etapas[i]
      logInfo.push(e.id + ' : ' + e.getString('nome') + ' : ' + e.getInt('ordem'))
    }

    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const logRec = new Record(syncLogCol)
    logRec.set('status', 'sucesso')
    logRec.set('etapa_atual', 'funil')
    logRec.set('pagina_atual', 1)
    logRec.set('mensagem_resumo', 'DIAGNOSTICO_ETAPAS: ' + logInfo.join(' | '))
    logRec.set('iniciado_em', new Date().toISOString())
    logRec.set('atualizado_em', new Date().toISOString())
    logRec.set('finalizado_em', new Date().toISOString())
    app.save(logRec)
  },
  (app) => {},
)
