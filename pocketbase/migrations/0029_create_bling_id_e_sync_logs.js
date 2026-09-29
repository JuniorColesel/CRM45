migrate(
  (app) => {
    // 1. Adicionar campo bling_id na coleção clientes
    const clientesCol = app.findCollectionByNameOrId('clientes')
    if (!clientesCol.fields.getByName('bling_id')) {
      clientesCol.fields.add(
        new TextField({
          name: 'bling_id',
          required: false,
        }),
      )
      app.save(clientesCol)
    }

    // Adicionar índice para bling_id (não único a priori para evitar bloqueio caso já existam vazios, mas indexado para busca rápida)
    try {
      clientesCol.addIndex('idx_clientes_bling_id', false, 'bling_id', "bling_id != ''")
      app.save(clientesCol)
    } catch (_) {}

    // 2. Criar coleção bling_sync_logs se não existir
    if (!app.hasTable('bling_sync_logs')) {
      const usuariosCol = app.findCollectionByNameOrId('usuarios')

      // Regras de acesso: apenas administradores / gestores
      const syncLogsRule =
        "@request.auth.id != '' && (@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas')"

      const blingSyncLogs = new Collection({
        name: 'bling_sync_logs',
        type: 'base',
        listRule: syncLogsRule,
        viewRule: syncLogsRule,
        createRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        updateRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        fields: [
          { name: 'iniciado_em', type: 'date', required: false },
          { name: 'finalizado_em', type: 'date', required: false },
          {
            name: 'usuario',
            type: 'relation',
            collectionId: usuariosCol.id,
            required: false,
            maxSelect: 1,
          },
          {
            name: 'status',
            type: 'select',
            values: ['processando', 'sucesso', 'sucesso_parcial', 'erro'],
            maxSelect: 1,
            required: true,
          },
          { name: 'clientes_lidos', type: 'number', required: false },
          { name: 'clientes_criados', type: 'number', required: false },
          { name: 'clientes_atualizados', type: 'number', required: false },
          { name: 'clientes_ignorados', type: 'number', required: false },
          { name: 'pedidos_lidos', type: 'number', required: false },
          { name: 'erros', type: 'json', required: false },
          { name: 'duracao_ms', type: 'number', required: false },
          { name: 'mensagem_resumo', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bling_sync_logs_status ON bling_sync_logs (status)',
          'CREATE INDEX idx_bling_sync_logs_created ON bling_sync_logs (created DESC)',
        ],
      })
      app.save(blingSyncLogs)
    }
  },
  (app) => {
    try {
      const blingSyncLogs = app.findCollectionByNameOrId('bling_sync_logs')
      app.delete(blingSyncLogs)
    } catch (_) {}

    try {
      const clientesCol = app.findCollectionByNameOrId('clientes')
      if (clientesCol.fields.getByName('bling_id')) {
        clientesCol.fields.removeByName('bling_id')
        try {
          clientesCol.removeIndex('idx_clientes_bling_id')
        } catch (_) {}
        app.save(clientesCol)
      }
    } catch (_) {}
  },
)
