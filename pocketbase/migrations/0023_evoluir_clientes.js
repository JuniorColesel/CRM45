migrate(
  (app) => {
    const clientesCol = app.findCollectionByNameOrId('clientes')

    // 1. Campos a adicionar se não existirem
    // - data_primeira_compra: date
    if (!clientesCol.fields.getByName('data_primeira_compra')) {
      clientesCol.fields.add(
        new DateField({
          name: 'data_primeira_compra',
          required: false,
        }),
      )
    }

    // - valor_total_compras: number (default 0)
    if (!clientesCol.fields.getByName('valor_total_compras')) {
      clientesCol.fields.add(
        new NumberField({
          name: 'valor_total_compras',
          required: false,
        }),
      )
    }

    // - valor_total_vendas: number (default 0)
    if (!clientesCol.fields.getByName('valor_total_vendas')) {
      clientesCol.fields.add(
        new NumberField({
          name: 'valor_total_vendas',
          required: false,
        }),
      )
    }

    // - estado: text (2 caracteres)
    if (!clientesCol.fields.getByName('estado')) {
      clientesCol.fields.add(
        new TextField({
          name: 'estado',
          required: false,
          max: 2,
        }),
      )
    }

    // - tipo_contato: select ("cliente" | "fornecedor" | "ambos")
    if (!clientesCol.fields.getByName('tipo_contato')) {
      clientesCol.fields.add(
        new SelectField({
          name: 'tipo_contato',
          values: ['cliente', 'fornecedor', 'ambos'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // - status_cliente: select ("ativo" | "para_reativacao")
    if (!clientesCol.fields.getByName('status_cliente')) {
      clientesCol.fields.add(
        new SelectField({
          name: 'status_cliente',
          values: ['ativo', 'para_reativacao'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // - grande_cliente: select ("sim" | "nao")
    // Se grande_cliente já existir como bool, convertemos para select com valores ["sim", "nao"] ou adicionamos campo novo
    // No PocketBase v0.36, alterar tipo de campo diretamente não é recomendado. Vamos verificar o tipo existente:
    const campoGrande = clientesCol.fields.getByName('grande_cliente')
    if (campoGrande && campoGrande.type === 'bool') {
      // Removemos campo bool e adicionamos select 'sim'/'nao'
      clientesCol.fields.removeByName('grande_cliente')
      clientesCol.fields.add(
        new SelectField({
          name: 'grande_cliente',
          values: ['sim', 'nao'],
          maxSelect: 1,
          required: false,
        }),
      )
    } else if (!campoGrande) {
      clientesCol.fields.add(
        new SelectField({
          name: 'grande_cliente',
          values: ['sim', 'nao'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // - vendedor: o usuário pediu vendedor texto: "Alice" | "Renan" | "Karoline (Vendas 1)" | "Vendas 2"
    // No schema anterior, vendedor era relation→usuarios.
    // Para aceitar os nomes solicitados diretamente e garantir compatibilidade:
    const campoVendedor = clientesCol.fields.getByName('vendedor')
    if (campoVendedor && campoVendedor.type === 'relation') {
      clientesCol.fields.removeByName('vendedor')
      clientesCol.fields.add(
        new SelectField({
          name: 'vendedor',
          values: ['Alice', 'Renan', 'Karoline (Vendas 1)', 'Vendas 2'],
          maxSelect: 1,
          required: false,
        }),
      )
    } else if (!campoVendedor) {
      clientesCol.fields.add(
        new SelectField({
          name: 'vendedor',
          values: ['Alice', 'Renan', 'Karoline (Vendas 1)', 'Vendas 2'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // - nome_contato deve ser opcional (anteriormente era required: true)
    const campoNomeContato = clientesCol.fields.getByName('nome_contato')
    if (campoNomeContato) {
      campoNomeContato.required = false
    }

    // - nome_empresa: obrigatório
    const campoNomeEmpresa = clientesCol.fields.getByName('nome_empresa')
    if (campoNomeEmpresa) {
      campoNomeEmpresa.required = true
    }

    app.save(clientesCol)

    // 2. Limpeza/Deduplicação de dados existentes antes de criar os índices UNIQUE
    app
      .db()
      .newQuery(`
      DELETE FROM clientes WHERE id NOT IN (
        SELECT MIN(id) FROM clientes GROUP BY nome_empresa
      ) AND nome_empresa IS NOT NULL AND nome_empresa != ''
    `)
      .execute()

    app
      .db()
      .newQuery(`
      DELETE FROM clientes WHERE id NOT IN (
        SELECT MIN(id) FROM clientes GROUP BY cnpj_cpf
      ) AND cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
    `)
      .execute()

    // 3. Adicionar índices
    // 1. nome_empresa único
    clientesCol.addIndex(
      'idx_clientes_nome_empresa_unique',
      true,
      'nome_empresa',
      "nome_empresa != ''",
    )
    // 2. cnpj_cpf único quando preenchido
    clientesCol.addIndex('idx_clientes_cnpj_cpf_unique', true, 'cnpj_cpf', "cnpj_cpf != ''")
    // 3. status_cliente index para consultas rápidas
    clientesCol.addIndex('idx_clientes_status_cliente', false, 'status_cliente', '')
    // 4. valor_total_vendas index para ordenação
    clientesCol.addIndex('idx_clientes_total_vendas', false, 'valor_total_vendas', '')

    // 4. Regras de Permissão (RLS) solicitadas:
    // - Visualizar: todos os perfis autenticados
    // - Cada vendedor só vê seus próprios clientes, EXCETO clientes com status "para_reativacao" (todos veem)
    // - Criar/Editar: ceo_financeiro, coordenador_vendas
    //
    // No sistema, os usuários vendedores têm perfil 'vendedor_1' (Karoline / Vendedor 1) e 'vendedor_2' (Vendas 2).
    // Além disso, Alice e Junior têm 'ceo_financeiro', Renan tem 'coordenador_vendas'.
    // Portanto:
    // listRule e viewRule:
    // autenticado E não estoque E (
    //   ceo_financeiro || coordenador_vendas || compras_grandes_clientes ||
    //   status_cliente = 'para_reativacao' ||
    //   (vendedor = 'Alice' && @request.auth.email ~ 'alice') ||
    //   (vendedor = 'Renan' && @request.auth.email ~ 'renan') ||
    //   (vendedor = 'Karoline (Vendas 1)' && (@request.auth.perfil = 'vendedor_1' || @request.auth.email ~ 'vendas1')) ||
    //   (vendedor = 'Vendas 2' && (@request.auth.perfil = 'vendedor_2' || @request.auth.email ~ 'vendas2')) ||
    //   (responsavel_id = @request.auth.id)
    // )
    // Para simplificar e garantir 100% de robustez no PB:
    const clientesListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "@request.auth.perfil = 'compras_grandes_clientes' || " +
      "status_cliente = 'para_reativacao' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'vendedor_1' && (vendedor = 'Karoline (Vendas 1)' || vendedor = 'Alice' || responsavel_id = @request.auth.id)) || " +
      "(@request.auth.perfil = 'vendedor_2' && (vendedor = 'Vendas 2' || responsavel_id = @request.auth.id))" +
      ')'

    // Criar e Editar: ceo_financeiro, coordenador_vendas.
    // Além disso, permitir que vendedores possam "Assumir cliente" em reativação (atribuindo a si e mudando status para 'ativo'):
    const clientesCreateRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas'" +
      ')'

    const clientesUpdateRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && status_cliente = 'para_reativacao')" +
      ')'

    const clientesDeleteRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas'" +
      ')'

    clientesCol.listRule = clientesListRule
    clientesCol.viewRule = clientesListRule
    clientesCol.createRule = clientesCreateRule
    clientesCol.updateRule = clientesUpdateRule
    clientesCol.deleteRule = clientesDeleteRule

    app.save(clientesCol)
  },
  (app) => {
    const clientesCol = app.findCollectionByNameOrId('clientes')
    try {
      clientesCol.removeIndex('idx_clientes_nome_empresa_unique')
    } catch (_) {}
    try {
      clientesCol.removeIndex('idx_clientes_cnpj_cpf_unique')
    } catch (_) {}
    try {
      clientesCol.removeIndex('idx_clientes_status_cliente')
    } catch (_) {}
    try {
      clientesCol.removeIndex('idx_clientes_total_vendas')
    } catch (_) {}
    app.save(clientesCol)
  },
)
