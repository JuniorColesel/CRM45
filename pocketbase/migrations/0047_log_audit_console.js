migrate(
  (app) => {
    try {
      const sLogs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
      if (sLogs && sLogs.length > 0) {
        const msg = sLogs[0].getString('mensagem_resumo')
        // Quebrar em pedaços de 400 caracteres e printar no console
        console.log('=== INICIO AUDITORIA PROPOSTAS ===')
        for (let i = 0; i < msg.length; i += 400) {
          console.log(msg.slice(i, i + 400))
        }
        console.log('=== FIM AUDITORIA PROPOSTAS ===')
      }
    } catch (e) {
      console.log('Erro 0047: ' + e)
    }
  },
  (app) => {},
)
