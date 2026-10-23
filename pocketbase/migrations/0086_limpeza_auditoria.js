migrate(
  (app) => {
    // Ler os últimos 20 logs da sincronização
    const logs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 20, 0)

    // Limpar os logs de auditoria técnica das migrações anteriores para deixar o banco impecável
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      const msg = l.getString('mensagem_resumo')
      if (msg.indexOf('AUDITORIA_TAREFA_4B') !== -1) {
        app.delete(l)
      }
    }
  },
  (app) => {},
)
