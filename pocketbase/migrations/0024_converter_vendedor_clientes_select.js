migrate(
  (app) => {
    // 1. Localiza a coleção clientes
    const clientesCol = app.findCollectionByNameOrId('clientes')

    // 2. Remove o campo vendedor (que estava como relation)
    const campoVendedor = clientesCol.fields.getByName('vendedor')
    if (campoVendedor) {
      clientesCol.fields.removeByName('vendedor')
    }

    // 3. Adiciona o campo vendedor como SelectField com os 4 valores definidos pelo usuário
    clientesCol.fields.add(
      new SelectField({
        name: 'vendedor',
        values: ['Alice', 'Renan', 'Karoline (Vendas 1)', 'Vendas 2'],
        maxSelect: 1,
        required: false,
      }),
    )

    // 4. Salva a coleção atualizada no schema
    app.save(clientesCol)
  },
  (app) => {
    const clientesCol = app.findCollectionByNameOrId('clientes')
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const campoVendedor = clientesCol.fields.getByName('vendedor')
    if (campoVendedor) {
      clientesCol.fields.removeByName('vendedor')
    }
    clientesCol.fields.add(
      new RelationField({
        name: 'vendedor',
        collectionId: usuariosCol.id,
        maxSelect: 1,
        required: false,
      }),
    )
    app.save(clientesCol)
  },
)
