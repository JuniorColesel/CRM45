migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // 1. Tabela "etapas_funil"
    // Regras: leitura para todos autenticados exceto estoque; escrita apenas administradores (ceo_financeiro)
    const etapasFunil = new Collection({
      name: 'etapas_funil',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      viewRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      createRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      updateRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'ordem',
          type: 'number',
          required: true,
          onlyInt: true,
        },
        {
          name: 'cor',
          type: 'text',
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
      indexes: ['CREATE INDEX idx_etapas_funil_ordem ON etapas_funil (ordem)'],
    })
    app.save(etapasFunil)

    // 2. Tabela "motivos_perda"
    // Regras: leitura para todos autenticados exceto estoque; escrita apenas administradores (ceo_financeiro)
    const motivosPerda = new Collection({
      name: 'motivos_perda',
      type: 'base',
      listRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      viewRule: "@request.auth.id != '' && @request.auth.perfil != 'estoque'",
      createRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      updateRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      deleteRule: "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'",
      fields: [
        {
          name: 'descricao',
          type: 'text',
          required: true,
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
    })
    app.save(motivosPerda)

    // 3. Tabela "clientes"
    // Regras de acesso (RLS):
    // - O perfil estoque NÃO tem acesso a essas tabelas (nem leitura) -> @request.auth.perfil != 'estoque'
    // - O perfil compras_grandes_clientes só pode LER clientes onde grande_cliente seja verdadeiro ->
    //     se compras_grandes_clientes, grande_cliente = true; para outros perfis (exceto estoque), podem ler normalmente.
    // - Todos os usuários autenticados (exceto estoque) podem INSERIR clientes.
    // - Cada usuário só pode EDITAR e EXCLUIR clientes cujo responsavel_id seja igual ao seu próprio id;
    //   o perfil ceo_financeiro pode editar e excluir QUALQUER cliente.
    const clientesListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil != 'compras_grandes_clientes' || grande_cliente = true)"
    const clientesViewRule = clientesListRule
    const clientesCreateRule = "@request.auth.id != '' && @request.auth.perfil != 'estoque'"
    const clientesUpdateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil = 'ceo_financeiro' || responsavel_id = @request.auth.id)"
    const clientesDeleteRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil = 'ceo_financeiro' || responsavel_id = @request.auth.id)"

    const clientes = new Collection({
      name: 'clientes',
      type: 'base',
      listRule: clientesListRule,
      viewRule: clientesViewRule,
      createRule: clientesCreateRule,
      updateRule: clientesUpdateRule,
      deleteRule: clientesDeleteRule,
      fields: [
        {
          name: 'nome_contato',
          type: 'text',
          required: true,
        },
        {
          name: 'nome_empresa',
          type: 'text',
          required: false,
        },
        {
          name: 'telefone',
          type: 'text',
          required: false,
        },
        {
          name: 'cidade',
          type: 'text',
          required: false,
        },
        {
          name: 'email',
          type: 'text',
          required: false,
        },
        {
          name: 'cnpj_cpf',
          type: 'text',
          required: false,
        },
        {
          name: 'data_nascimento',
          type: 'date',
          required: false,
        },
        {
          name: 'observacoes',
          type: 'text',
          required: false,
        },
        {
          name: 'grande_cliente',
          type: 'bool',
          required: false,
        },
        {
          name: 'aceita_mensagens',
          type: 'bool',
          required: false,
        },
        {
          name: 'responsavel_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'data_ultima_compra',
          type: 'date',
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
        'CREATE INDEX idx_clientes_responsavel ON clientes (responsavel_id)',
        'CREATE INDEX idx_clientes_grande_cliente ON clientes (grande_cliente)',
      ],
    })
    app.save(clientes)
  },
  (app) => {
    try {
      const clientes = app.findCollectionByNameOrId('clientes')
      app.delete(clientes)
    } catch (_) {}
    try {
      const motivosPerda = app.findCollectionByNameOrId('motivos_perda')
      app.delete(motivosPerda)
    } catch (_) {}
    try {
      const etapasFunil = app.findCollectionByNameOrId('etapas_funil')
      app.delete(etapasFunil)
    } catch (_) {}
  },
)
