migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // 1. Provisionar usuários dos perfis para testes e uso comercial se não existirem
    const usuariosParaCriar = [
      {
        email: 'renan.coordenador@coleselengenharia.com',
        nome: 'Renan Coordenador',
        perfil: 'coordenador_vendas',
      },
      {
        email: 'vendas1@coleselengenharia.com',
        nome: 'Vendedor 1',
        perfil: 'vendedor_1',
      },
      {
        email: 'vendas2@coleselengenharia.com',
        nome: 'Vendedor 2',
        perfil: 'vendedor_2',
      },
    ]

    for (const u of usuariosParaCriar) {
      try {
        app.findAuthRecordByEmail('usuarios', u.email)
      } catch (_) {
        const rec = new Record(usuariosCol)
        rec.setEmail(u.email)
        rec.setPassword('Skip@Pass123')
        rec.setVerified(true)
        rec.set('nome', u.nome)
        rec.set('perfil', u.perfil)
        rec.set('ativo', true)
        app.save(rec)
      }
    }

    // 2. Adicionar campo denormalizado "vendedor" (relation -> usuarios) nas coleções necessárias
    // Coleção clientes
    const clientesCol = app.findCollectionByNameOrId('clientes')
    if (!clientesCol.fields.getByName('vendedor')) {
      clientesCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(clientesCol)
    }

    // Coleção oportunidades
    const oportunidadesCol = app.findCollectionByNameOrId('oportunidades')
    if (!oportunidadesCol.fields.getByName('vendedor')) {
      oportunidadesCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(oportunidadesCol)
    }

    // Coleção tarefas
    const tarefasCol = app.findCollectionByNameOrId('tarefas')
    if (!tarefasCol.fields.getByName('vendedor')) {
      tarefasCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(tarefasCol)
    }

    // Coleção ligacoes
    const ligacoesCol = app.findCollectionByNameOrId('ligacoes')
    if (!ligacoesCol.fields.getByName('vendedor')) {
      ligacoesCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(ligacoesCol)
    }

    // Coleção conversas_whatsapp
    const conversasCol = app.findCollectionByNameOrId('conversas_whatsapp')
    if (!conversasCol.fields.getByName('vendedor')) {
      conversasCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(conversasCol)
    }

    // Coleção mensagens_whatsapp: campo "vendedor" e campo "external_id" com UNIQUE
    const mensagensCol = app.findCollectionByNameOrId('mensagens_whatsapp')
    if (!mensagensCol.fields.getByName('vendedor')) {
      mensagensCol.fields.add(
        new RelationField({
          name: 'vendedor',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!mensagensCol.fields.getByName('external_id')) {
      mensagensCol.fields.add(
        new TextField({
          name: 'external_id',
          required: false,
        }),
      )
    }
    app.save(mensagensCol)

    // Índice único para mensagens_whatsapp.external_id (apenas quando não vazio)
    app
      .db()
      .newQuery(`
      DELETE FROM mensagens_whatsapp WHERE id NOT IN (
        SELECT MIN(id) FROM mensagens_whatsapp GROUP BY external_id
      ) AND external_id IS NOT NULL AND external_id != ''
    `)
      .execute()

    mensagensCol.addIndex('idx_mensagens_external_id', true, 'external_id', "external_id != ''")
    app.save(mensagensCol)

    // 3. Backfill nos registros existentes
    // clientes: vendedor = responsavel_id
    app
      .db()
      .newQuery(`
      UPDATE clientes SET vendedor = responsavel_id WHERE (vendedor IS NULL OR vendedor = '') AND responsavel_id IS NOT NULL AND responsavel_id != ''
    `)
      .execute()

    // oportunidades: vendedor = responsavel_id (ou herda de clientes)
    app
      .db()
      .newQuery(`
      UPDATE oportunidades SET vendedor = responsavel_id WHERE (vendedor IS NULL OR vendedor = '') AND responsavel_id IS NOT NULL AND responsavel_id != ''
    `)
      .execute()
    app
      .db()
      .newQuery(`
      UPDATE oportunidades SET vendedor = (SELECT c.vendedor FROM clientes c WHERE c.id = oportunidades.cliente_id) WHERE (vendedor IS NULL OR vendedor = '')
    `)
      .execute()

    // tarefas: vendedor = responsavel_id (ou herda de clientes)
    app
      .db()
      .newQuery(`
      UPDATE tarefas SET vendedor = responsavel_id WHERE (vendedor IS NULL OR vendedor = '') AND responsavel_id IS NOT NULL AND responsavel_id != ''
    `)
      .execute()
    app
      .db()
      .newQuery(`
      UPDATE tarefas SET vendedor = (SELECT c.vendedor FROM clientes c WHERE c.id = tarefas.cliente_id) WHERE (vendedor IS NULL OR vendedor = '')
    `)
      .execute()

    // ligacoes: vendedor = responsavel_id (ou herda de clientes)
    app
      .db()
      .newQuery(`
      UPDATE ligacoes SET vendedor = responsavel_id WHERE (vendedor IS NULL OR vendedor = '') AND responsavel_id IS NOT NULL AND responsavel_id != ''
    `)
      .execute()
    app
      .db()
      .newQuery(`
      UPDATE ligacoes SET vendedor = (SELECT c.vendedor FROM clientes c WHERE c.id = ligacoes.cliente_id) WHERE (vendedor IS NULL OR vendedor = '')
    `)
      .execute()

    // conversas_whatsapp: herda vendedor do cliente vinculado
    app
      .db()
      .newQuery(`
      UPDATE conversas_whatsapp SET vendedor = (SELECT c.vendedor FROM clientes c WHERE c.id = conversas_whatsapp.cliente_id) WHERE (vendedor IS NULL OR vendedor = '') AND cliente_id IS NOT NULL AND cliente_id != ''
    `)
      .execute()

    // mensagens_whatsapp: herda vendedor da conversa vinculada
    app
      .db()
      .newQuery(`
      UPDATE mensagens_whatsapp SET vendedor = (SELECT cw.vendedor FROM conversas_whatsapp cw WHERE cw.id = mensagens_whatsapp.conversa_id) WHERE (vendedor IS NULL OR vendedor = '') AND conversa_id IS NOT NULL AND conversa_id != ''
    `)
      .execute()

    // 4. Criar coleção "webhook_logs"
    try {
      app.findCollectionByNameOrId('webhook_logs')
    } catch (_) {
      const webhookLogs = new Collection({
        name: 'webhook_logs',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        viewRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        createRule: null, // Apenas hooks / superuser criam
        updateRule: null,
        deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
        fields: [
          {
            name: 'external_id',
            type: 'text',
            required: false,
          },
          {
            name: 'provider',
            type: 'text',
            required: false,
          },
          {
            name: 'timestamp_req',
            type: 'text',
            required: false,
          },
          {
            name: 'status',
            type: 'select',
            values: ['sucesso', 'pendente', 'rejeitado', 'falhou'],
            maxSelect: 1,
            required: true,
          },
          {
            name: 'tentativas',
            type: 'number',
            onlyInt: true,
            required: false,
          },
          {
            name: 'erro',
            type: 'text',
            required: false,
          },
          {
            name: 'payload',
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
          'CREATE INDEX idx_webhook_logs_ext ON webhook_logs (external_id)',
          'CREATE INDEX idx_webhook_logs_status ON webhook_logs (status)',
        ],
      })
      app.save(webhookLogs)
    }

    // 5. Regras de Acesso RLS Hardened por coleção
    // 5.1 clientes
    const clientesListRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2' || responsavel_id = @request.auth.id || (vendedor = null && responsavel_id = null))) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || responsavel_id = @request.auth.id)) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && grande_cliente = true)" +
      ')'

    const clientesCreateRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || responsavel_id = @request.auth.id || @request.body.vendedor = @request.auth.id || @request.body.responsavel_id = @request.auth.id))" +
      ')'

    const clientesUpdateDeleteRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2' || responsavel_id = @request.auth.id || (vendedor = null && responsavel_id = null))) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || responsavel_id = @request.auth.id))" +
      ')'

    clientesCol.listRule = clientesListRule
    clientesCol.viewRule = clientesListRule
    clientesCol.createRule = clientesCreateRule
    clientesCol.updateRule = clientesUpdateDeleteRule
    clientesCol.deleteRule = clientesUpdateDeleteRule
    app.save(clientesCol)

    // 5.2 oportunidades, tarefas, ligacoes (possuem cliente_id)
    const entidadesComClienteListRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2' || responsavel_id = @request.auth.id || (vendedor = null && responsavel_id = null))) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || responsavel_id = @request.auth.id)) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && cliente_id.grande_cliente = true)" +
      ')'

    // oportunidades
    oportunidadesCol.listRule = entidadesComClienteListRule
    oportunidadesCol.viewRule = entidadesComClienteListRule
    oportunidadesCol.createRule = clientesCreateRule
    oportunidadesCol.updateRule = clientesUpdateDeleteRule
    oportunidadesCol.deleteRule = clientesUpdateDeleteRule
    app.save(oportunidadesCol)

    // tarefas
    tarefasCol.listRule = entidadesComClienteListRule
    tarefasCol.viewRule = entidadesComClienteListRule
    tarefasCol.createRule = clientesCreateRule
    tarefasCol.updateRule = clientesUpdateDeleteRule
    tarefasCol.deleteRule = clientesUpdateDeleteRule
    app.save(tarefasCol)

    // ligacoes
    ligacoesCol.listRule = entidadesComClienteListRule
    ligacoesCol.viewRule = entidadesComClienteListRule
    ligacoesCol.createRule = clientesCreateRule
    ligacoesCol.updateRule = clientesUpdateDeleteRule
    ligacoesCol.deleteRule = clientesUpdateDeleteRule
    app.save(ligacoesCol)

    // 5.3 conversas_whatsapp
    const conversasListRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || vendedor = null)) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || (vendedor = null && cliente_id = null)))" +
      ')'

    const conversasUpdateDeleteRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || vendedor = null)) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && vendedor = @request.auth.id)" +
      ')'

    conversasCol.listRule = conversasListRule
    conversasCol.viewRule = conversasListRule
    conversasCol.createRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && @request.auth.perfil != 'compras_grandes_clientes'"
    conversasCol.updateRule = conversasUpdateDeleteRule
    conversasCol.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"
    app.save(conversasCol)

    // 5.4 mensagens_whatsapp (não possui cliente_id direto, possui conversa_id)
    const mensagensListRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (vendedor.perfil = 'vendedor_1' || vendedor.perfil = 'vendedor_2' || vendedor = @request.auth.id || vendedor = null)) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || (vendedor = null && conversa_id.cliente_id = null)))" +
      ')'

    mensagensCol.listRule = mensagensListRule
    mensagensCol.viewRule = mensagensListRule
    mensagensCol.createRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && @request.auth.perfil != 'compras_grandes_clientes'"
    mensagensCol.updateRule = conversasUpdateDeleteRule
    mensagensCol.deleteRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"
    app.save(mensagensCol)

    // 6. Proteção de escalada de privilégios na coleção usuarios (P0 #6)
    usuariosCol.updateRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      '(id = @request.auth.id && @request.body.perfil:isset = false)' +
      ')'
    app.save(usuariosCol)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('webhook_logs')
      app.delete(col)
    } catch (_) {}
  },
)
