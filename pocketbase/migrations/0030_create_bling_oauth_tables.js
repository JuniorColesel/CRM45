migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // 1. Coleção bling_connections
    // Guarda access_token e refresh_token server-side.
    // Regras estritas: list/view/create/update/delete com null (apenas superuser/backend via $app)
    // Isso garante que NENHUM usuário ou frontend consiga ler tokens via API pública do PocketBase.
    if (!app.hasTable('bling_connections')) {
      const blingConnections = new Collection({
        name: 'bling_connections',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user_id',
            type: 'relation',
            collectionId: usuariosCol.id,
            required: false,
            maxSelect: 1,
          },
          { name: 'access_token', type: 'text', required: true, hidden: true },
          { name: 'refresh_token', type: 'text', required: true, hidden: true },
          { name: 'token_type', type: 'text', required: false },
          { name: 'expires_at', type: 'date', required: true },
          { name: 'last_refresh_at', type: 'date', required: false },
          {
            name: 'status',
            type: 'select',
            values: ['conectado', 'desconectado', 'erro_renovacao'],
            maxSelect: 1,
            required: true,
          },
          { name: 'ultimo_erro', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_bling_conn_status ON bling_connections (status)',
          'CREATE INDEX idx_bling_conn_user ON bling_connections (user_id)',
          'CREATE INDEX idx_bling_conn_created ON bling_connections (created DESC)',
        ],
      })
      app.save(blingConnections)
    }

    // 2. Coleção bling_oauth_states
    // Armazena states anti-CSRF temporários (64+ caracteres, validade 10min, uso único).
    // RLS: null (gerenciado e validado exclusivamente pelos hooks de backend via $app).
    if (!app.hasTable('bling_oauth_states')) {
      const blingOAuthStates = new Collection({
        name: 'bling_oauth_states',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'state', type: 'text', required: true },
          {
            name: 'user_id',
            type: 'relation',
            collectionId: usuariosCol.id,
            required: true,
            maxSelect: 1,
          },
          { name: 'expires_at', type: 'date', required: true },
          { name: 'used_at', type: 'date', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_bling_state_uniq ON bling_oauth_states (state)',
          'CREATE INDEX idx_bling_state_expires ON bling_oauth_states (expires_at)',
        ],
      })
      app.save(blingOAuthStates)
    }
  },
  (app) => {
    try {
      const blingOAuthStates = app.findCollectionByNameOrId('bling_oauth_states')
      app.delete(blingOAuthStates)
    } catch (_) {}

    try {
      const blingConnections = app.findCollectionByNameOrId('bling_connections')
      app.delete(blingConnections)
    } catch (_) {}
  },
)
