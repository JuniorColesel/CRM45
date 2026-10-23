migrate(
  (app) => {
    // Ler os últimos 10 logs da sincronização
    const logs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 10, 0)

    // Vamos verificar o status do log mais recente
    if (logs && logs.length > 0) {
      const topo = logs[0]
      const etapa = topo.getString('etapa_atual')
      const pag = topo.getInt('pagina_atual')
      const st = topo.getString('status')
      const msg = topo.getString('mensagem_resumo')

      // Deixar registrado em um comentário no próprio log mais recente ou em campo de texto
      topo.set('avisos', [
        'CHECK_AUDIT: Etapa=' + etapa + ', Pag=' + pag + ', Status=' + st + ', Msg=' + msg,
      ])
      app.save(topo)
    }
  },
  (app) => {},
)
