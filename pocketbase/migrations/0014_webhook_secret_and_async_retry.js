migrate(
  (app) => {
    // 1. Coleção integracoes_config: adicionar campo webhook_secret (se ainda não existir)
    try {
      const configCol = app.findCollectionByNameOrId('integracoes_config')
      if (!configCol.fields.getByName('webhook_secret')) {
        configCol.fields.add(
          new TextField({
            name: 'webhook_secret',
            type: 'text',
            required: false,
            hidden: true,
          }),
        )
        app.save(configCol)
      }
    } catch (err) {
      console.log('Erro ao adicionar webhook_secret em integracoes_config:', err)
    }

    // 2. Coleção webhook_logs:
    // Adicionar status "processado" aos select values se necessário e flag/status para controle de lock e retentativas
    try {
      const logsCol = app.findCollectionByNameOrId('webhook_logs')

      // Atualizar campo 'status' para incluir 'processado' e 'em_processamento' caso não existam
      const statusField = logsCol.fields.getByName('status')
      if (statusField) {
        // Garantir valores: sucesso, pendente, rejeitado, falhou, processado, em_processamento
        statusField.values = [
          'sucesso',
          'pendente',
          'rejeitado',
          'falhou',
          'processado',
          'em_processamento',
        ]
        statusField.maxSelect = 1
      }

      // Adicionar campo proxima_tentativa (timestamp ms para escalonamento 5s, 30s, 2min) se não existir
      if (!logsCol.fields.getByName('proxima_tentativa')) {
        logsCol.fields.add(
          new NumberField({
            name: 'proxima_tentativa',
            type: 'number',
            required: false,
            onlyInt: true,
          }),
        )
      }

      // Adicionar campo em_processamento (bool para lock seguro) se não existir
      if (!logsCol.fields.getByName('em_processamento')) {
        logsCol.fields.add(
          new BoolField({
            name: 'em_processamento',
            type: 'bool',
            required: false,
          }),
        )
      }

      app.save(logsCol)
    } catch (err) {
      console.log('Erro ao atualizar webhook_logs na migracao 0014:', err)
    }
  },
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('webhook_logs')
      if (logsCol.fields.getByName('proxima_tentativa')) {
        logsCol.fields.removeByName('proxima_tentativa')
      }
      if (logsCol.fields.getByName('em_processamento')) {
        logsCol.fields.removeByName('em_processamento')
      }
      app.save(logsCol)
    } catch (_) {}

    try {
      const configCol = app.findCollectionByNameOrId('integracoes_config')
      if (configCol.fields.getByName('webhook_secret')) {
        configCol.fields.removeByName('webhook_secret')
        app.save(configCol)
      }
    } catch (_) {}
  },
)
