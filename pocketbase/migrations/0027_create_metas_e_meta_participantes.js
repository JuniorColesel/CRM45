migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // 1. Remover a coleção legada 'metas' se existir
    try {
      const oldMetas = app.findCollectionByNameOrId('metas')
      app.delete(oldMetas)
    } catch (_) {}

    // Permissões iniciais para metas:
    // Leitura permitida para usuários autenticados da área comercial/financeira (não estoque/compras_grandes)
    // CEO tem escrita completa
    const metasInitialReadRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes'"

    const ceoOnlyRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    // 2. Criar coleção 'metas'
    const metasCol = new Collection({
      name: 'metas',
      type: 'base',
      listRule: metasInitialReadRule,
      viewRule: metasInitialReadRule,
      createRule: ceoOnlyRule,
      updateRule: ceoOnlyRule,
      deleteRule: ceoOnlyRule,
      fields: [
        {
          name: 'mes',
          type: 'number',
          onlyInt: true,
          min: 1,
          max: 12,
          required: true,
        },
        {
          name: 'ano',
          type: 'number',
          onlyInt: true,
          required: true,
        },
        {
          name: 'meta_geral',
          type: 'number',
          required: false,
        },
        {
          name: 'valor_atingido',
          type: 'number',
          required: false,
        },
        {
          name: 'fonte_atingido',
          type: 'text',
          required: false,
        },
        {
          name: 'criado_por',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
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
        'CREATE UNIQUE INDEX idx_metas_mes_ano ON metas (mes, ano)',
        'CREATE INDEX idx_metas_ano ON metas (ano)',
        'CREATE INDEX idx_metas_mes ON metas (mes)',
      ],
    })
    app.save(metasCol)

    // 3. Criar coleção 'meta_participantes'
    // Permissões:
    // - CEO: full access
    // - Coordenador: somente leitura
    // - Vendedor (vendedor_1, vendedor_2): somente leitura se usuario_id = @request.auth.id
    const partReadRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && usuario_id = @request.auth.id)" +
      ')'

    const participantesCol = new Collection({
      name: 'meta_participantes',
      type: 'base',
      listRule: partReadRule,
      viewRule: partReadRule,
      createRule: ceoOnlyRule,
      updateRule: ceoOnlyRule,
      deleteRule: ceoOnlyRule,
      fields: [
        {
          name: 'meta_id',
          type: 'relation',
          collectionId: metasCol.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'valor_individual',
          type: 'number',
          required: false,
        },
        {
          name: 'percentual',
          type: 'number',
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
        'CREATE UNIQUE INDEX idx_meta_participantes_meta_usuario ON meta_participantes (meta_id, usuario_id)',
        'CREATE INDEX idx_meta_participantes_meta ON meta_participantes (meta_id)',
        'CREATE INDEX idx_meta_participantes_usuario ON meta_participantes (usuario_id)',
      ],
    })
    app.save(participantesCol)

    // 4. Agora que 'meta_participantes' existe com a relation 'meta_id' apontando para 'metas',
    // podemos atualizar a listRule/viewRule de 'metas' para restringir a visão do vendedor
    // apenas às metas onde ele é participante:
    try {
      const metasReloaded = app.findCollectionByNameOrId('metas')
      const metasRestrictedRule =
        "@request.auth.id != '' && " +
        "@request.auth.perfil != 'estoque' && " +
        "@request.auth.perfil != 'compras_grandes_clientes' && (" +
        "@request.auth.perfil = 'ceo_financeiro' || " +
        "@request.auth.perfil = 'coordenador_vendas' || " +
        "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && " +
        'meta_participantes_via_meta_id.usuario_id ?= @request.auth.id)' +
        ')'

      metasReloaded.listRule = metasRestrictedRule
      metasReloaded.viewRule = metasRestrictedRule
      app.save(metasReloaded)
    } catch (e) {
      // Se a sintaxe de back-relation falhar no save, o rule inicial abrangente já protege
      console.log('Aviso ao aplicar back-relation rule em metas:', e)
    }
  },
  (app) => {
    try {
      const part = app.findCollectionByNameOrId('meta_participantes')
      app.delete(part)
    } catch (_) {}
    try {
      const metas = app.findCollectionByNameOrId('metas')
      app.delete(metas)
    } catch (_) {}
  },
)
