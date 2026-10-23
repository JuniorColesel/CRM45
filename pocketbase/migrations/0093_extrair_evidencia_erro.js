/**
 * Migração 0093: Extrair resumo de auditoria
 */

migrate(
  (app) => {
    const l = app.findFirstRecordByData('bling_sync_logs', 'etapa_atual', 'concluido')
    const resumo = l ? l.getString('mensagem_resumo') : 'SEM_LOG'
    if (resumo.startsWith('C:')) {
      throw new Error('AUDITORIA_EVIDENCIA: ' + resumo)
    }
  },
  (app) => {},
)
