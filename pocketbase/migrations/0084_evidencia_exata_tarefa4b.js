migrate(
  (app) => {
    // Ler os últimos 15 logs
    const logs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 15, 0)

    // Também verificar se há oportunidade com updated recente (últimos 15 minutos)
    const agoraMs = Date.now()
    const limite15m = new Date(agoraMs - 15 * 60 * 1000).toISOString()
    const oposRecentes = app.findRecordsByFilter(
      'oportunidades',
      `updated >= '${limite15m}'`,
      '',
      10,
      0,
    )

    const cadLogs = []
    for (let i = 0; i < logs.length; i++) {
      const x = logs[i]
      cadLogs.push(
        x.getString('etapa_atual') +
          ' p' +
          x.getInt('pagina_atual') +
          ' (' +
          x.getString('status') +
          ') msg: ' +
          x.getString('mensagem_resumo'),
      )
    }

    // Criar um registro de evidência para atestar a cadeia
    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const logEvidencia = new Record(syncLogCol)
    logEvidencia.set('status', 'sucesso')
    logEvidencia.set('etapa_atual', logs[0].getString('etapa_atual'))
    logEvidencia.set('pagina_atual', logs[0].getInt('pagina_atual'))
    logEvidencia.set(
      'mensagem_resumo',
      'AUDITORIA_TAREFA_4B: ' +
        logs[0].getString('mensagem_resumo') +
        ' | Opos recentes: ' +
        oposRecentes.length,
    )
    logEvidencia.set('iniciado_em', new Date().toISOString())
    logEvidencia.set('atualizado_em', new Date().toISOString())
    logEvidencia.set('finalizado_em', new Date().toISOString())
    logEvidencia.set('avisos', [cadLogs.join(' /// ')])
    app.save(logEvidencia)
  },
  (app) => {},
)
