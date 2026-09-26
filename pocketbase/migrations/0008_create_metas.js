migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // 1) AUDITORIA DEFENSIVA DE CAMPOS:
    // "verificar se a tabela "clientes" possui o campo "criado_em" (timestamp, padrão agora). Se não existir, criar o campo.
    //  Verificar também se a tabela "oportunidades" possui o campo "data_fechamento" (timestamp). Se não existir, criar o campo.
    //  Não mexer em mais nada dessas tabelas."
    const clientesCol = app.findCollectionByNameOrId('clientes')
    if (!clientesCol.fields.getByName('criado_em')) {
      clientesCol.fields.add(
        new AutodateField({
          name: 'criado_em',
          onCreate: true,
          onUpdate: false,
        }),
      )
      app.save(clientesCol)
    }

    const oportunidadesCol = app.findCollectionByNameOrId('oportunidades')
    if (!oportunidadesCol.fields.getByName('data_fechamento')) {
      oportunidadesCol.fields.add(
        new DateField({
          name: 'data_fechamento',
          required: false,
        }),
      )
      app.save(oportunidadesCol)
    }

    // 2) TABELA DE METAS:
    // campos:
    // - id (uuid, chave primária) - automático no PocketBase
    // - usuario_id (uuid, referência para a tabela usuarios, obrigatório)
    // - ano (integer, obrigatório)
    // - mes (integer, obrigatório, 1-12)
    // - valor_meta (decimal, obrigatório)
    // - meta_oportunidades (integer, obrigatório)
    // - criado_em (timestamp, padrão agora)
    // - atualizado_em (timestamp, padrão agora)
    // Constraint única combinando (usuario_id, ano, mes) para evitar duplicatas.
    // Índices em usuario_id, ano e mes.
    //
    // RLS da tabela "metas" (apenas desta tabela):
    // - ceo_financeiro lê e gerencia todas as metas;
    // - coordenador_vendas lê todas as metas mas só pode criar, editar e excluir metas de usuarios com perfil vendedor_1 ou vendedor_2;
    // - vendedor_1 e vendedor_2 só podem ler e editar a própria meta (usuario_id = id do usuário logado);
    // - compras_grandes_clientes e estoque não têm acesso.

    const listAndViewRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && usuario_id = @request.auth.id)" +
      ')'

    const createRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2'))" +
      ')'

    const updateRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2')) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && usuario_id = @request.auth.id)" +
      ')'

    const deleteRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2'))" +
      ')'

    const metas = new Collection({
      name: 'metas',
      type: 'base',
      listRule: listAndViewRule,
      viewRule: listAndViewRule,
      createRule: createRule,
      updateRule: updateRule,
      deleteRule: deleteRule,
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'ano',
          type: 'number',
          onlyInt: true,
          required: true,
        },
        {
          name: 'mes',
          type: 'number',
          onlyInt: true,
          min: 1,
          max: 12,
          required: true,
        },
        {
          name: 'valor_meta',
          type: 'number',
          required: true,
        },
        {
          name: 'meta_oportunidades',
          type: 'number',
          onlyInt: true,
          required: true,
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
        'CREATE UNIQUE INDEX idx_metas_usuario_ano_mes ON metas (usuario_id, ano, mes)',
        'CREATE INDEX idx_metas_usuario ON metas (usuario_id)',
        'CREATE INDEX idx_metas_ano ON metas (ano)',
        'CREATE INDEX idx_metas_mes ON metas (mes)',
      ],
    })

    app.save(metas)
  },
  (app) => {
    try {
      const metas = app.findCollectionByNameOrId('metas')
      app.delete(metas)
    } catch (_) {}
  },
)
