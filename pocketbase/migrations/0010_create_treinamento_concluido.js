migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')

    // Tabela "treinamento_concluido"
    // Campos:
    // - usuario_id: relation para usuarios (obrigatório, maxSelect 1)
    // - concluido_em: date (timestamp do momento da conclusão)
    // - versao_treinamento: text (ex: "1.0")
    // - created, updated: autodate padrão
    //
    // RLS:
    // Cada usuário só lê/escreve o próprio registro (usuario_id = @request.auth.id),
    // e ceo_financeiro lê todos.
    const treinamentoListRule =
      "@request.auth.id != '' && (usuario_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')"
    const treinamentoViewRule = treinamentoListRule
    const treinamentoCreateRule =
      "@request.auth.id != '' && (usuario_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')"
    const treinamentoUpdateRule =
      "@request.auth.id != '' && (usuario_id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')"
    const treinamentoDeleteRule =
      "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    const treinamentoConcluido = new Collection({
      name: 'treinamento_concluido',
      type: 'base',
      listRule: treinamentoListRule,
      viewRule: treinamentoViewRule,
      createRule: treinamentoCreateRule,
      updateRule: treinamentoUpdateRule,
      deleteRule: treinamentoDeleteRule,
      fields: [
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'concluido_em',
          type: 'date',
          required: false,
        },
        {
          name: 'versao_treinamento',
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
      indexes: [
        'CREATE INDEX idx_treinamento_usuario ON treinamento_concluido (usuario_id)',
        'CREATE INDEX idx_treinamento_versao ON treinamento_concluido (versao_treinamento)',
      ],
    })

    app.save(treinamentoConcluido)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('treinamento_concluido')
      app.delete(col)
    } catch (_) {}
  },
)
