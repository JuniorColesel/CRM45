migrate(
  (app) => {
    // Ler o registro de backup_logs com o resultado e copiar para bling_sync_logs mensagem_resumo
    try {
      const bLogs = app.findRecordsByFilter('backup_logs', 'tipo = "manual"', '-created', 1, 0)
      if (bLogs && bLogs.length > 0) {
        const auditJson = bLogs[0].getString('detalhes')
        const sLogs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
        if (sLogs && sLogs.length > 0) {
          const sLog = sLogs[0]
          sLog.set('mensagem_resumo', 'AUDIT_PROPOSTAS:' + auditJson)
          app.save(sLog)
        }
      }
    } catch (err) {
      console.log('Erro migração 0046: ' + err)
    }
  },
  (app) => {},
)
