/**
 * Migração 0044: Criar coleção bling_propostas e expandir contadores de propostas em bling_sync_logs
 *
 * 1. Coleção bling_propostas:
 *    - bling_proposta_id: text, required, unique
 *    - numero: text
 *    - cliente_id: relation opcional -> clientes
 *    - bling_contato_id: text
 *    - contato_nome: text
 *    - documento: text
 *    - vendedor_bling: text
 *    - vendedor_crm: text
 *    - responsavel_id: relation opcional -> usuarios
 *    - data_proposta: date
 *    - data_validade: date
 *    - valor_total: number
 *    - situacao_bling_id: text
 *    - situacao_bling_nome: text
 *    - status_normalizado: text (rascunho, aguardando, nao_aprovada, convertida, outro)
 *    - status_vinculo: select (vinculado, pendente, sem_cliente)
 *    - visivel_funil: bool (default false, preenchido pelas regras sem alterar o funil nesta versão)
 *    - sincronizado_em: date
 *    - created, updated: autodate
 *
 *    Índices:
 *    - CREATE UNIQUE INDEX idx_bling_propostas_proposta_id ON bling_propostas (bling_proposta_id)
 *    - CREATE INDEX idx_bling_propostas_cliente ON bling_propostas (cliente_id)
 *    - CREATE INDEX idx_bling_propostas_responsavel ON bling_propostas (responsavel_id)
 *    - CREATE INDEX idx_bling_propostas_data ON bling_propostas (data_proposta DESC)
 *    - CREATE INDEX idx_bling_propostas_vinculo ON bling_propostas (status_vinculo)
 *    - CREATE INDEX idx_bling_propostas_visivel ON bling_propostas (visivel_funil)
 *
 *    API Rules:
 *    - Mesmo padrão de bling_pedidos: CEO e coordenador veem tudo; vendedores veem apenas de sua carteira.
 *
 * 2. Coleção bling_sync_logs:
 *    - propostas_lidas: number
 *    - propostas_persistidas: number
 *    - propostas_atualizadas: number
 *    - propostas_duplicadas: number
 *    - propostas_sem_cliente: number
 *    - paginas_propostas_lidas: number
 *    - erros_propostas: json
 */

migrate(
  (app) => {
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id

    // 1. Criar coleção bling_propostas se não existir
    if (!app.hasTable('bling_propostas')) {
      const blingPropostasCol = new Collection({
        name: 'bling_propostas',
        type: 'base',
        listRule:
          "@request.auth.id != '' && (" +
          "@request.auth.perfil = 'ceo_financeiro' || " +
          "@request.auth.perfil = 'coordenador_vendas' || " +
          'responsavel_id = @request.auth.id || ' +
          'cliente_id.responsavel_id = @request.auth.id || ' +
          "(@request.auth.perfil = 'vendedor_1' && (vendedor_crm = 'Karoline (Vendas 1)' || vendedor_crm = 'Alice' || cliente_id.vendedor = 'Karoline (Vendas 1)' || cliente_id.vendedor = 'Alice')) || " +
          "(@request.auth.perfil = 'vendedor_2' && (vendedor_crm = 'Vendas 2' || cliente_id.vendedor = 'Vendas 2'))" +
          ')',
        viewRule:
          "@request.auth.id != '' && (" +
          "@request.auth.perfil = 'ceo_financeiro' || " +
          "@request.auth.perfil = 'coordenador_vendas' || " +
          'responsavel_id = @request.auth.id || ' +
          'cliente_id.responsavel_id = @request.auth.id || ' +
          "(@request.auth.perfil = 'vendedor_1' && (vendedor_crm = 'Karoline (Vendas 1)' || vendedor_crm = 'Alice' || cliente_id.vendedor = 'Karoline (Vendas 1)' || cliente_id.vendedor = 'Alice')) || " +
          "(@request.auth.perfil = 'vendedor_2' && (vendedor_crm = 'Vendas 2' || cliente_id.vendedor = 'Vendas 2'))" +
          ')',
        createRule:
          "@request.auth.id != '' && (" +
          "@request.auth.perfil = 'ceo_financeiro' || " +
          "@request.auth.perfil = 'coordenador_vendas'" +
          ')',
        updateRule:
          "@request.auth.id != '' && (" +
          "@request.auth.perfil = 'ceo_financeiro' || " +
          "@request.auth.perfil = 'coordenador_vendas'" +
          ')',
        deleteRule:
          "@request.auth.id != '' && (" +
          "@request.auth.perfil = 'ceo_financeiro' || " +
          "@request.auth.perfil = 'coordenador_vendas'" +
          ')',
        fields: [
          { name: 'bling_proposta_id', type: 'text', required: true },
          { name: 'numero', type: 'text' },
          {
            name: 'cliente_id',
            type: 'relation',
            collectionId: clientesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'bling_contato_id', type: 'text' },
          { name: 'contato_nome', type: 'text' },
          { name: 'documento', type: 'text' },
          { name: 'vendedor_bling', type: 'text' },
          { name: 'vendedor_crm', type: 'text' },
          {
            name: 'responsavel_id',
            type: 'relation',
            collectionId: usuariosColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'data_proposta', type: 'date' },
          { name: 'data_validade', type: 'date' },
          { name: 'valor_total', type: 'number' },
          { name: 'situacao_bling_id', type: 'text' },
          { name: 'situacao_bling_nome', type: 'text' },
          { name: 'status_normalizado', type: 'text' },
          {
            name: 'status_vinculo',
            type: 'select',
            values: ['vinculado', 'pendente', 'sem_cliente'],
            maxSelect: 1,
          },
          { name: 'visivel_funil', type: 'bool' },
          { name: 'sincronizado_em', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_bling_propostas_proposta_id ON bling_propostas (bling_proposta_id)',
          'CREATE INDEX idx_bling_propostas_cliente ON bling_propostas (cliente_id)',
          'CREATE INDEX idx_bling_propostas_responsavel ON bling_propostas (responsavel_id)',
          'CREATE INDEX idx_bling_propostas_data ON bling_propostas (data_proposta DESC)',
          'CREATE INDEX idx_bling_propostas_vinculo ON bling_propostas (status_vinculo)',
          'CREATE INDEX idx_bling_propostas_visivel ON bling_propostas (visivel_funil)',
        ],
      })
      app.save(blingPropostasCol)
    }

    // 2. Expandir coleção bling_sync_logs com novos campos de controle de propostas
    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      let alterouLog = false

      if (!syncLogCol.fields.getByName('propostas_lidas')) {
        syncLogCol.fields.add(new NumberField({ name: 'propostas_lidas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('propostas_persistidas')) {
        syncLogCol.fields.add(new NumberField({ name: 'propostas_persistidas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('propostas_atualizadas')) {
        syncLogCol.fields.add(new NumberField({ name: 'propostas_atualizadas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('propostas_duplicadas')) {
        syncLogCol.fields.add(new NumberField({ name: 'propostas_duplicadas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('propostas_sem_cliente')) {
        syncLogCol.fields.add(new NumberField({ name: 'propostas_sem_cliente' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('paginas_propostas_lidas')) {
        syncLogCol.fields.add(new NumberField({ name: 'paginas_propostas_lidas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('erros_propostas')) {
        syncLogCol.fields.add(new JSONField({ name: 'erros_propostas' }))
        alterouLog = true
      }

      if (alterouLog) {
        app.save(syncLogCol)
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão
    try {
      const blingPropostasCol = app.findCollectionByNameOrId('bling_propostas')
      app.delete(blingPropostasCol)
    } catch (_) {}

    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      const campos = [
        'propostas_lidas',
        'propostas_persistidas',
        'propostas_atualizadas',
        'propostas_duplicadas',
        'propostas_sem_cliente',
        'paginas_propostas_lidas',
        'erros_propostas',
      ]
      for (let i = 0; i < campos.length; i++) {
        try {
          syncLogCol.fields.removeByName(campos[i])
        } catch (_) {}
      }
      app.save(syncLogCol)
    } catch (_) {}
  },
)
