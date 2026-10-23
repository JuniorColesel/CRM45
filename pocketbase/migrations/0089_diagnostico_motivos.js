/**
 * Migração 0089: Diagnóstico com DynamicModel
 */

migrate(
  (app) => {
    let motivoNaoAprovadaId = ''
    let motivoCanceladoId = ''
    try {
      const motList = app.findRecordsByFilter('motivos_perda', '', 'created', 50, 0)
      for (let i = 0; i < motList.length; i++) {
        const m = motList[i]
        const d = m.getString('descricao')
        if (d.indexOf('Não aprovada') !== -1) motivoNaoAprovadaId = m.id
        if (d.indexOf('Cancelado') !== -1) motivoCanceladoId = m.id
      }
    } catch (_) {}

    const rowOp = new DynamicModel({ total: 0 })
    try {
      app.db().newQuery('SELECT count(*) as total FROM oportunidades').one(rowOp)
    } catch (e) {}

    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const logRec = new Record(syncLogCol)
    logRec.set('status', 'sucesso')
    logRec.set('etapa_atual', 'funil')
    logRec.set('pagina_atual', 1)
    logRec.set(
      'mensagem_resumo',
      'DIAGNOSTICO_MOTIVOS: nao_aprov=' +
        motivoNaoAprovadaId +
        ', canc=' +
        motivoCanceladoId +
        ', countOp=' +
        rowOp.total,
    )
    logRec.set('iniciado_em', new Date().toISOString())
    logRec.set('atualizado_em', new Date().toISOString())
    logRec.set('finalizado_em', new Date().toISOString())
    app.save(logRec)
  },
  (app) => {},
)
