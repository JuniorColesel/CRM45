/**
 * Migração 0091: Extrair auditoria exata do log gravado pela migração 0090
 */

migrate(
  (app) => {
    // Buscar o último log
    const lastLogs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 5, 0)
    for (let i = 0; i < lastLogs.length; i++) {
      const l = lastLogs[i]
      const avisos = l.get('avisos') || []
      const msg = l.getString('mensagem_resumo')
      const etapa = l.getString('etapa_atual')
      const st = l.getString('status')
      console.log(
        `[AUDIT-LOG-${i}] etapa=${etapa} status=${st} msg=${msg} avisos=${JSON.stringify(avisos)}`,
      )
    }
  },
  (app) => {},
)
