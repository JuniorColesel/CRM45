/**
 * Migração 0032: Criar coleção bling_pedidos e expandir campos de auditoria em bling_sync_logs
 *
 * 1. Coleção bling_pedidos:
 *    - bling_pedido_id (text, required, único)
 *    - numero (text)
 *    - cliente_id (relation opcional -> clientes)
 *    - bling_contato_id (text)
 *    - contato_nome (text)
 *    - documento (text)
 *    - vendedor_bling (text)
 *    - vendedor_crm (text)
 *    - responsavel_id (relation opcional -> usuarios)
 *    - data_pedido (date)
 *    - data_atendimento (date)
 *    - valor_total (number)
 *    - situacao_bling_id (text)
 *    - situacao_bling_nome (text)
 *    - status_normalizado (text)
 *    - status_vinculo (select: vinculado | pendente | sem_cliente)
 *    - oportunidade_id (relation opcional -> oportunidades)
 *    - sincronizado_em (date)
 *    - created (autodate onCreate)
 *    - updated (autodate onCreate, onUpdate)
 *
 * 2. Índices:
 *    - CREATE UNIQUE INDEX idx_bling_pedidos_pedido_id ON bling_pedidos (bling_pedido_id)
 *    - CREATE INDEX idx_bling_pedidos_cliente ON bling_pedidos (cliente_id)
 *    - CREATE INDEX idx_bling_pedidos_responsavel ON bling_pedidos (responsavel_id)
 *    - CREATE INDEX idx_bling_pedidos_data ON bling_pedidos (data_pedido DESC)
 *    - CREATE INDEX idx_bling_pedidos_vinculo ON bling_pedidos (status_vinculo)
 *
 * 3. RLS / Permissões (espelha padrão de clientes/logs):
 *    - list/view: ceo_financeiro e coordenador_vendas; vendedores apenas da própria carteira
 *    - create/update/delete: ceo_financeiro e coordenador_vendas (operações automáticas da sync)
 *
 * 4. Expandir bling_sync_logs com métricas de pedidos:
 *    - pedidos_persistidos (number)
 *    - pedidos_atualizados (number)
 *    - pedidos_duplicados (number)
 *    - pedidos_sem_cliente (number)
 *    - paginas_pedidos_lidas (number)
 *    - erros_pedidos (json)
 */

migrate(
  (app) => {
    const clientesColId = app.findCollectionByNameOrId('clientes').id
    const usuariosColId = app.findCollectionByNameOrId('usuarios').id
    const oportunidadesColId = app.findCollectionByNameOrId('oportunidades').id

    // 1. Criar coleção bling_pedidos se não existir
    if (!app.hasTable('bling_pedidos')) {
      const blingPedidosCol = new Collection({
        name: 'bling_pedidos',
        type: 'base',
        // listRule e viewRule:
        // CEO Financeiro e Coordenador de Vendas veem tudo.
        // Vendedor 1 e 2 veem apenas pedidos onde responsavel_id é ele mesmo ou cliente_id pertence a ele.
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
          { name: 'bling_pedido_id', type: 'text', required: true },
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
          { name: 'data_pedido', type: 'date' },
          { name: 'data_atendimento', type: 'date' },
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
          {
            name: 'oportunidade_id',
            type: 'relation',
            collectionId: oportunidadesColId,
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'sincronizado_em', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_bling_pedidos_pedido_id ON bling_pedidos (bling_pedido_id)',
          'CREATE INDEX idx_bling_pedidos_cliente ON bling_pedidos (cliente_id)',
          'CREATE INDEX idx_bling_pedidos_responsavel ON bling_pedidos (responsavel_id)',
          'CREATE INDEX idx_bling_pedidos_data ON bling_pedidos (data_pedido DESC)',
          'CREATE INDEX idx_bling_pedidos_vinculo ON bling_pedidos (status_vinculo)',
        ],
      })
      app.save(blingPedidosCol)
    }

    // 2. Expandir coleção bling_sync_logs com novos campos de controle de pedidos
    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      let alterouLog = false

      if (!syncLogCol.fields.getByName('pedidos_persistidos')) {
        syncLogCol.fields.add(new NumberField({ name: 'pedidos_persistidos' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('pedidos_atualizados')) {
        syncLogCol.fields.add(new NumberField({ name: 'pedidos_atualizados' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('pedidos_duplicados')) {
        syncLogCol.fields.add(new NumberField({ name: 'pedidos_duplicados' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('pedidos_sem_cliente')) {
        syncLogCol.fields.add(new NumberField({ name: 'pedidos_sem_cliente' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('paginas_pedidos_lidas')) {
        syncLogCol.fields.add(new NumberField({ name: 'paginas_pedidos_lidas' }))
        alterouLog = true
      }
      if (!syncLogCol.fields.getByName('erros_pedidos')) {
        syncLogCol.fields.add(new JSONField({ name: 'erros_pedidos' }))
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
      const blingPedidosCol = app.findCollectionByNameOrId('bling_pedidos')
      app.delete(blingPedidosCol)
    } catch (_) {}

    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      const campos = [
        'pedidos_persistidos',
        'pedidos_atualizados',
        'pedidos_duplicados',
        'pedidos_sem_cliente',
        'paginas_pedidos_lidas',
        'erros_pedidos',
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
