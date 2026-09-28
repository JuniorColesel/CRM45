migrate(
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('webhook_logs')
      const statusField = logsCol.fields.getByName('status')
      if (statusField) {
        // Nomenclatura atualizada:
        // Ciclo: pendente -> processando -> processado
        // Falha definitiva após 3 tentativas: falha_definitiva
        // Mantém compatibilidade com valores existentes
        statusField.values = [
          'sucesso',
          'pendente',
          'processando',
          'processado',
          'falha_definitiva',
          'rejeitado',
          'falhou',
          'em_processamento',
        ]
        statusField.maxSelect = 1
        app.save(logsCol)
      }
    } catch (err) {
      console.log('Erro ao atualizar status de webhook_logs na migracao 0015:', err)
    }
  },
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('webhook_logs')
      const statusField = logsCol.fields.getByName('status')
      if (statusField) {
        statusField.values = [
          'sucesso',
          'pendente',
          'rejeitado',
          'falhou',
          'processado',
          'em_processamento',
        ]
        app.save(logsCol)
      }
    } catch (_) {}
  },
)
