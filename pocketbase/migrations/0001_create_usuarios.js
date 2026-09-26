migrate(
  (app) => {
    const collection = new Collection({
      name: 'usuarios',
      type: 'auth',
      listRule:
        "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')",
      viewRule:
        "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')",
      createRule: null,
      updateRule: "@request.auth.id != '' && id = @request.auth.id",
      deleteRule: null,
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'perfil',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'ceo_financeiro',
            'coordenador_vendas',
            'compras_grandes_clientes',
            'estoque',
            'vendedor_1',
            'vendedor_2',
          ],
        },
        {
          name: 'ativo',
          type: 'bool',
          required: false,
        },
      ],
    })

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('usuarios')
    app.delete(collection)
  },
)
