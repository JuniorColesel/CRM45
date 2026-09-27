migrate(
  (app) => {
    // 1) REGRAS DA COLEÇÃO 'usuarios'
    // - create: apenas ceo_financeiro pode inserir registros
    // - delete: apenas ceo_financeiro pode excluir, e NUNCA o próprio usuário logado (auth.id != id)
    // - read/update: manter as existentes (@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro') para list/view, update: @request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro'))
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    usuariosCol.createRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"
    usuariosCol.deleteRule =
      "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro' && @request.auth.id != id"
    usuariosCol.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.perfil = 'ceo_financeiro')"
    app.save(usuariosCol)

    // 2) REGRAS DA COLEÇÃO 'metas'
    // - vendedor_1 e vendedor_2: LEITURA APENAS da própria meta (auth.id = usuario_id). Remover qualquer permissão de INSERT/UPDATE/DELETE.
    // - coordenador_vendas: leitura e edição das metas apenas dos perfis vendedor_1 e vendedor_2
    // - ceo_financeiro: leitura e edição de todas as metas
    const metasCol = app.findCollectionByNameOrId('metas')
    metasCol.listRule =
      "@request.auth.id != '' && " +
      "@request.auth.perfil != 'estoque' && " +
      "@request.auth.perfil != 'compras_grandes_clientes' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && usuario_id = @request.auth.id)" +
      ')'
    metasCol.viewRule = metasCol.listRule

    metasCol.createRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2'))" +
      ')'

    metasCol.updateRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2'))" +
      ')'

    metasCol.deleteRule =
      "@request.auth.id != '' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (usuario_id.perfil = 'vendedor_1' || usuario_id.perfil = 'vendedor_2'))" +
      ')'
    app.save(metasCol)

    // 3) REGRAS PARA COORDENADOR DE VENDAS: clientes, oportunidades, tarefas, ligacoes
    // Garantir que coordenador_vendas possa editar e excluir registros dos perfis vendedor_1 e vendedor_2 (além dos seus próprios)

    // 3.1) clientes
    const clientesCol = app.findCollectionByNameOrId('clientes')
    clientesCol.listRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil != 'compras_grandes_clientes' || grande_cliente = true)"
    clientesCol.viewRule = clientesCol.listRule
    clientesCol.createRule = "@request.auth.id != '' && @request.auth.perfil != 'estoque'"
    clientesCol.updateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'coordenador_vendas' && (responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2'))" +
      ')'
    clientesCol.deleteRule = clientesCol.updateRule
    app.save(clientesCol)

    // 3.2) oportunidades
    const oportunidadesCol = app.findCollectionByNameOrId('oportunidades')
    oportunidadesCol.updateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'coordenador_vendas' && (responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2'))" +
      ')'
    oportunidadesCol.deleteRule = oportunidadesCol.updateRule
    app.save(oportunidadesCol)

    // 3.3) tarefas
    const tarefasCol = app.findCollectionByNameOrId('tarefas')
    tarefasCol.updateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'coordenador_vendas' && (responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2'))" +
      ')'
    tarefasCol.deleteRule = tarefasCol.updateRule
    app.save(tarefasCol)

    // 3.4) ligacoes
    const ligacoesCol = app.findCollectionByNameOrId('ligacoes')
    ligacoesCol.updateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'coordenador_vendas' && (responsavel_id.perfil = 'vendedor_1' || responsavel_id.perfil = 'vendedor_2'))" +
      ')'
    ligacoesCol.deleteRule = ligacoesCol.updateRule
    app.save(ligacoesCol)

    // 4) PROVISIONAMENTO DOS CEOs NO BANCO (Idempotente)
    // Junior Colesel e Alice Paitra
    const ceos = [
      {
        email: 'junior.colesel@coleselengenharia.com',
        nome: 'Junior Colesel',
      },
      {
        email: 'alice.paitra@coleselengenharia.com',
        nome: 'Alice Paitra',
      },
    ]

    for (const ceo of ceos) {
      try {
        app.findAuthRecordByEmail('usuarios', ceo.email)
      } catch (_) {
        const rec = new Record(usuariosCol)
        rec.setEmail(ceo.email)
        rec.setPassword($security.randomString(16))
        rec.setVerified(true)
        rec.set('nome', ceo.nome)
        rec.set('perfil', 'ceo_financeiro')
        rec.set('ativo', true)
        app.save(rec)
      }
    }
  },
  (app) => {
    // Reverter regras se necessário
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    usuariosCol.createRule = null
    usuariosCol.deleteRule = null
    usuariosCol.updateRule = "@request.auth.id != '' && id = @request.auth.id"
    app.save(usuariosCol)
  },
)
