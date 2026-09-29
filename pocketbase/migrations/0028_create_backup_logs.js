migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // Regra de list/view: CEO ou Coordenador de Vendas
    const readRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas'" +
      ')'

    // Regra de create/update/delete: CEO apenas (ou criação via backend hooks / superuser)
    const writeRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    const backupLogsCol = new Collection({
      name: 'backup_logs',
      type: 'base',
      listRule: readRule,
      viewRule: readRule,
      createRule: writeRule,
      updateRule: writeRule,
      deleteRule: writeRule,
      fields: [
        {
          name: 'data_hora',
          type: 'date',
          required: true,
        },
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'tipo',
          type: 'select',
          values: ['auto', 'manual'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'resultado',
          type: 'select',
          values: ['sucesso', 'falha'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'duracao_ms',
          type: 'number',
          onlyInt: true,
          required: false,
        },
        {
          name: 'detalhes',
          type: 'text',
          required: false,
        },
        {
          name: 'arquivos_gerados',
          type: 'json',
          required: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_backup_logs_data_hora ON backup_logs (data_hora DESC)',
        'CREATE INDEX idx_backup_logs_usuario ON backup_logs (usuario_id)',
        'CREATE INDEX idx_backup_logs_tipo ON backup_logs (tipo)',
        'CREATE INDEX idx_backup_logs_resultado ON backup_logs (resultado)',
      ],
    })

    app.save(backupLogsCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('backup_logs')
      app.delete(col)
    } catch (_) {}
  },
)
