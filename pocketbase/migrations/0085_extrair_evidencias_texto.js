migrate(
  (app) => {
    // Ler os últimos 5 logs reais gerados pelo cron
    const logs = app.findRecordsByFilter('bling_sync_logs', "id != ''", '-created', 6, 0)
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      console.log(
        '[LOG-REAL-' + i + ']',
        'ID:',
        l.id,
        '| Etapa:',
        l.getString('etapa_atual'),
        '| Pagina:',
        l.getInt('pagina_atual'),
        '| Status:',
        l.getString('status'),
        '| Lidas:',
        l.getInt('propostas_lidas'),
        '| Persistidas:',
        l.getInt('propostas_persistidas'),
        '| Atualizadas:',
        l.getInt('propostas_atualizadas'),
        '| Resumo:',
        l.getString('mensagem_resumo'),
        '| Avisos:',
        l.getString('avisos'),
      )
    }
  },
  (app) => {},
)
