/**
 * Migração 0094: Obter último log concluído
 */

migrate(
  (app) => {
    const logs = app.findRecordsByFilter(
      'bling_sync_logs',
      "etapa_atual = 'concluido'",
      '-created',
      5,
      0,
    )
    for (let i = 0; i < logs.length; i++) {
      const msg = logs[i].getString('mensagem_resumo')
      if (msg.indexOf('C:') !== -1) {
        throw new Error('EVIDENCIA_0094: ' + msg)
      }
    }
  },
  (app) => {},
)
