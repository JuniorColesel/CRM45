migrate(
  (app) => {
    const clientesCol = app.findCollectionByNameOrId('clientes')

    // 1) Adicionar campo status na coleção clientes se ainda não existir (ativo | rascunho)
    // Clientes criados via WhatsApp sem cadastro prévio entram como 'rascunho'
    if (!clientesCol.fields.getByName('status')) {
      clientesCol.fields.add(
        new SelectField({
          name: 'status',
          values: ['ativo', 'rascunho'],
          maxSelect: 1,
          required: false,
        }),
      )
      app.save(clientesCol)
    }

    // 2) Tabela conversas_whatsapp
    // id, cliente_id (nullable), numero, provedor, status (aberta/fechada), ultima_mensagem, ultima_intencao, ultima_resposta_ia, criado_em, atualizado_em
    // RLS: vendedor lê conversas dos próprios clientes (ou sem cliente atribuído/responsavel_id = user.id), coordenador dos vendedores + dele, CEO tudo.
    const conversasRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (cliente_id = null || cliente_id.responsavel_id = @request.auth.id))" +
      ')'

    const conversasWhatsapp = new Collection({
      name: 'conversas_whatsapp',
      type: 'base',
      listRule: conversasRule,
      viewRule: conversasRule,
      createRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      updateRule: conversasRule,
      deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      fields: [
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'numero',
          type: 'text',
          required: true,
        },
        {
          name: 'provedor',
          type: 'text',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          values: ['aberta', 'fechada'],
          maxSelect: 1,
          required: false,
        },
        {
          name: 'ultima_mensagem',
          type: 'text',
          required: false,
        },
        {
          name: 'ultima_intencao',
          type: 'select',
          values: ['alta', 'media', 'baixa'],
          maxSelect: 1,
          required: false,
        },
        {
          name: 'ultima_resposta_ia',
          type: 'text',
          required: false,
        },
        {
          name: 'criado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'atualizado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
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
        'CREATE INDEX idx_conversas_numero ON conversas_whatsapp (numero)',
        'CREATE INDEX idx_conversas_cliente ON conversas_whatsapp (cliente_id)',
        'CREATE INDEX idx_conversas_status ON conversas_whatsapp (status)',
      ],
    })
    app.save(conversasWhatsapp)

    // 3) Tabela mensagens_whatsapp
    // id, conversa_id, direcao (entrada/saida), texto, intencao_detectada, sugestao_ia, usada_ia (boolean), criado_em
    const mensagensRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (conversa_id.cliente_id = null || conversa_id.cliente_id.responsavel_id = @request.auth.id))" +
      ')'

    const mensagensWhatsapp = new Collection({
      name: 'mensagens_whatsapp',
      type: 'base',
      listRule: mensagensRule,
      viewRule: mensagensRule,
      createRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      updateRule: mensagensRule,
      deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      fields: [
        {
          name: 'conversa_id',
          type: 'relation',
          collectionId: conversasWhatsapp.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'direcao',
          type: 'select',
          values: ['entrada', 'saida'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'texto',
          type: 'text',
          required: true,
        },
        {
          name: 'intencao_detectada',
          type: 'select',
          values: ['alta', 'media', 'baixa'],
          maxSelect: 1,
          required: false,
        },
        {
          name: 'sugestao_ia',
          type: 'text',
          required: false,
        },
        {
          name: 'usada_ia',
          type: 'bool',
          required: false,
        },
        {
          name: 'criado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
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
        'CREATE INDEX idx_mensagens_conversa ON mensagens_whatsapp (conversa_id)',
        'CREATE INDEX idx_mensagens_direcao ON mensagens_whatsapp (direcao)',
      ],
    })
    app.save(mensagensWhatsapp)

    // 4) Tabela produtos
    // id, nome, preco, unidade, disponibilidade, prazo_entrega, criado_em, atualizado_em
    // RLS: leitura para perfis de vendas (ceo_financeiro, coordenador_vendas, vendedor_1, vendedor_2, compras_grandes_clientes); escrita só CEO.
    const produtosListRule = "@request.auth.id != '' && @request.auth.perfil != 'estoque'"
    const produtosWriteRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    const produtos = new Collection({
      name: 'produtos',
      type: 'base',
      listRule: produtosListRule,
      viewRule: produtosListRule,
      createRule: produtosWriteRule,
      updateRule: produtosWriteRule,
      deleteRule: produtosWriteRule,
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'preco',
          type: 'number',
          required: true,
        },
        {
          name: 'unidade',
          type: 'text',
          required: true,
        },
        {
          name: 'disponibilidade',
          type: 'bool',
          required: false,
        },
        {
          name: 'prazo_entrega',
          type: 'text',
          required: false,
        },
        {
          name: 'criado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'atualizado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
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
      indexes: ['CREATE INDEX idx_produtos_nome ON produtos (nome)'],
    })
    app.save(produtos)

    // 5) Tabela sugestoes_ia
    // id, conversa_id, mensagem_cliente, sugestao_gerada, usada (boolean), editada (boolean), criado_em
    // RLS: escrita via backend (ou superuser/auth), leitura conforme escopo da conversa
    const sugestoesRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (conversa_id.cliente_id = null || conversa_id.cliente_id.responsavel_id = @request.auth.id))" +
      ')'

    const sugestoesIa = new Collection({
      name: 'sugestoes_ia',
      type: 'base',
      listRule: sugestoesRule,
      viewRule: sugestoesRule,
      createRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      updateRule: sugestoesRule,
      deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      fields: [
        {
          name: 'conversa_id',
          type: 'relation',
          collectionId: conversasWhatsapp.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'mensagem_cliente',
          type: 'text',
          required: false,
        },
        {
          name: 'sugestao_gerada',
          type: 'text',
          required: true,
        },
        {
          name: 'usada',
          type: 'bool',
          required: false,
        },
        {
          name: 'editada',
          type: 'bool',
          required: false,
        },
        {
          name: 'criado_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
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
      indexes: ['CREATE INDEX idx_sugestoes_conversa ON sugestoes_ia (conversa_id)'],
    })
    app.save(sugestoesIa)
  },
  (app) => {
    try {
      const sugestoesIa = app.findCollectionByNameOrId('sugestoes_ia')
      app.delete(sugestoesIa)
    } catch (_) {}
    try {
      const produtos = app.findCollectionByNameOrId('produtos')
      app.delete(produtos)
    } catch (_) {}
    try {
      const mensagensWhatsapp = app.findCollectionByNameOrId('mensagens_whatsapp')
      app.delete(mensagensWhatsapp)
    } catch (_) {}
    try {
      const conversasWhatsapp = app.findCollectionByNameOrId('conversas_whatsapp')
      app.delete(conversasWhatsapp)
    } catch (_) {}
  },
)
