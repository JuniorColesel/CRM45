migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const clientesCol = app.findCollectionByNameOrId('clientes')
    const canaisCol = app.findCollectionByNameOrId('canais_marketing')

    // =========================================================================
    // 1. TABELA "campanhas"
    // =========================================================================
    // Campos:
    // - id (chave primária)
    // - nome (text, obrigatório)
    // - descricao (text)
    // - tipo (select, maxSelect 1, obrigatório, valores: email, whatsapp, sms, mista)
    // - canal_id (relation para canais_marketing, obrigatório)
    // - responsavel_id (relation para usuarios, obrigatório)
    // - data_inicio (date)
    // - data_fim (date)
    // - status (select, maxSelect 1, valores: rascunho, ativa, pausada, finalizada; padrão rascunho)
    // - publico_alvo (json — para armazenar filtros como cidade, grande_cliente, etapa_funil, etc)
    // - orcamento (number, decimal)
    // - criado_em (autodate onCreate)
    // - atualizado_em (autodate onCreate e onUpdate)
    // - created/updated padrão PocketBase
    // Índices: responsavel_id, canal_id, status.
    //
    // Regras RLS campanhas:
    // - ceo_financeiro: gerencia qualquer registro (CRUD completo).
    // - coordenador_vendas: lê todas as campanhas; cria, edita e exclui apenas as que têm responsavel_id igual ao seu próprio id.
    // - vendedor_1 e vendedor_2: leem apenas campanhas com status "ativa" ou "pausada"; não podem criar, editar nem excluir.
    // - compras_grandes_clientes: só lê campanhas cujo publico_alvo inclua filtro de grande_cliente (publico_alvo.grande_cliente = true ou publico_alvo ~ 'grande_cliente').
    // - estoque: nenhum acesso.
    const campanhasListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (status = 'ativa' || status = 'pausada')) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && (publico_alvo.grande_cliente = true || publico_alvo ~ 'grande_cliente'))" +
      ')'

    const campanhasViewRule = campanhasListRule

    const campanhasCreateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && responsavel_id = @request.auth.id)" +
      ')'

    const campanhasUpdateRule = campanhasCreateRule
    const campanhasDeleteRule = campanhasCreateRule

    const campanhas = new Collection({
      name: 'campanhas',
      type: 'base',
      listRule: campanhasListRule,
      viewRule: campanhasViewRule,
      createRule: campanhasCreateRule,
      updateRule: campanhasUpdateRule,
      deleteRule: campanhasDeleteRule,
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'descricao',
          type: 'text',
          required: false,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['email', 'whatsapp', 'sms', 'mista'],
        },
        {
          name: 'canal_id',
          type: 'relation',
          collectionId: canaisCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'responsavel_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'data_inicio',
          type: 'date',
          required: false,
        },
        {
          name: 'data_fim',
          type: 'date',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['rascunho', 'ativa', 'pausada', 'finalizada'],
        },
        {
          name: 'publico_alvo',
          type: 'json',
          required: false,
        },
        {
          name: 'orcamento',
          type: 'number',
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
        'CREATE INDEX idx_campanhas_responsavel ON campanhas (responsavel_id)',
        'CREATE INDEX idx_campanhas_canal ON campanhas (canal_id)',
        'CREATE INDEX idx_campanhas_status ON campanhas (status)',
      ],
    })
    app.save(campanhas)

    const campanhasCol = app.findCollectionByNameOrId('campanhas')

    // =========================================================================
    // 2. TABELA "conteudos_gerados"
    // =========================================================================
    // Campos:
    // - id (chave primária)
    // - campanha_id (relation para campanhas, obrigatório)
    // - tipo (select, maxSelect 1, obrigatório, valores: texto, imagem, video, audio)
    // - conteudo (text, obrigatório)
    // - prompt_ia (text)
    // - status (select, maxSelect 1, valores: gerado, aprovado, rejeitado; padrão gerado)
    // - criado_em (autodate onCreate)
    // - created/updated padrão PocketBase
    // Índices: campanha_id, status.
    //
    // Regras RLS conteudos_gerados:
    // - ceo_financeiro: gerencia qualquer registro.
    // - coordenador_vendas: cria, edita e exclui conteúdos de campanhas que ele coordena (campanha_id.responsavel_id = @request.auth.id); leitura das suas.
    // - vendedor_1 e vendedor_2: podem criar conteúdos de campanhas ativas (campanha_id.status = 'ativa');
    //   leitura de conteúdos de campanhas ativas ou pausadas;
    //   edição/exclusão restrita a ceo_financeiro e coordenador_vendas da campanha.
    // - compras_grandes_clientes: só lê conteúdos de campanhas vinculadas a grandes clientes (via campanha_id.publico_alvo).
    // - estoque: nenhum acesso.
    const conteudosListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (campanha_id.status = 'ativa' || campanha_id.status = 'pausada')) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && (campanha_id.publico_alvo.grande_cliente = true || campanha_id.publico_alvo ~ 'grande_cliente'))" +
      ')'

    const conteudosViewRule = conteudosListRule

    const conteudosCreateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && campanha_id.status = 'ativa')" +
      ')'

    const conteudosUpdateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id)" +
      ')'

    const conteudosDeleteRule = conteudosUpdateRule

    const conteudosGerados = new Collection({
      name: 'conteudos_gerados',
      type: 'base',
      listRule: conteudosListRule,
      viewRule: conteudosViewRule,
      createRule: conteudosCreateRule,
      updateRule: conteudosUpdateRule,
      deleteRule: conteudosDeleteRule,
      fields: [
        {
          name: 'campanha_id',
          type: 'relation',
          collectionId: campanhasCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['texto', 'imagem', 'video', 'audio'],
        },
        {
          name: 'conteudo',
          type: 'text',
          required: true,
        },
        {
          name: 'prompt_ia',
          type: 'text',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['gerado', 'aprovado', 'rejeitado'],
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
        'CREATE INDEX idx_conteudos_gerados_campanha ON conteudos_gerados (campanha_id)',
        'CREATE INDEX idx_conteudos_gerados_status ON conteudos_gerados (status)',
      ],
    })
    app.save(conteudosGerados)

    const conteudosCol = app.findCollectionByNameOrId('conteudos_gerados')

    // =========================================================================
    // 3. TABELA "publicacoes"
    // =========================================================================
    // Campos:
    // - id (chave primária)
    // - campanha_id (relation para campanhas, obrigatório)
    // - cliente_id (relation para clientes, obrigatório)
    // - conteudo_id (relation para conteudos_gerados, obrigatório)
    // - canal (select, maxSelect 1, obrigatório, valores: whatsapp, email, sms)
    // - status (select, maxSelect 1, valores: agendada, enviada, entregue, lida, falhou; padrão agendada)
    // - data_agendada (date/timestamp, obrigatório)
    // - data_envio (date/timestamp)
    // - criado_em (autodate onCreate)
    // - created/updated padrão PocketBase
    // Índices: campanha_id, cliente_id, conteudo_id, status, data_agendada.
    //
    // Regras RLS publicacoes:
    // - ceo_financeiro: gerencia qualquer registro.
    // - coordenador_vendas: gerencia publicações apenas de campanhas que ele criou (campanha_id.responsavel_id = @request.auth.id).
    // - vendedor_1 e vendedor_2: só podem criar publicações de campanhas ativas (campanha_id.status = 'ativa') E apenas para clientes cujo responsavel_id (do cliente) seja ele mesmo (cliente_id.responsavel_id = @request.auth.id); edição/exclusão apenas das próprias (cliente sob sua responsabilidade).
    // - compras_grandes_clientes: só lê publicações vinculadas a grandes clientes (via cliente_id.grande_cliente = true e/ou campanha_id.publico_alvo).
    // - estoque: nenhum acesso.
    const publicacoesListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && cliente_id.responsavel_id = @request.auth.id) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && (cliente_id.grande_cliente = true || campanha_id.publico_alvo.grande_cliente = true || campanha_id.publico_alvo ~ 'grande_cliente'))" +
      ')'

    const publicacoesViewRule = publicacoesListRule

    const publicacoesCreateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && campanha_id.status = 'ativa' && cliente_id.responsavel_id = @request.auth.id)" +
      ')'

    const publicacoesUpdateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && cliente_id.responsavel_id = @request.auth.id)" +
      ')'

    const publicacoesDeleteRule = publicacoesUpdateRule

    const publicacoes = new Collection({
      name: 'publicacoes',
      type: 'base',
      listRule: publicacoesListRule,
      viewRule: publicacoesViewRule,
      createRule: publicacoesCreateRule,
      updateRule: publicacoesUpdateRule,
      deleteRule: publicacoesDeleteRule,
      fields: [
        {
          name: 'campanha_id',
          type: 'relation',
          collectionId: campanhasCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'conteudo_id',
          type: 'relation',
          collectionId: conteudosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'canal',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['whatsapp', 'email', 'sms'],
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['agendada', 'enviada', 'entregue', 'lida', 'falhou'],
        },
        {
          name: 'data_agendada',
          type: 'date',
          required: true,
        },
        {
          name: 'data_envio',
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
        'CREATE INDEX idx_publicacoes_campanha ON publicacoes (campanha_id)',
        'CREATE INDEX idx_publicacoes_cliente ON publicacoes (cliente_id)',
        'CREATE INDEX idx_publicacoes_conteudo ON publicacoes (conteudo_id)',
        'CREATE INDEX idx_publicacoes_status ON publicacoes (status)',
        'CREATE INDEX idx_publicacoes_data_agendada ON publicacoes (data_agendada)',
      ],
    })
    app.save(publicacoes)

    // =========================================================================
    // 4. TABELA "aprovacoes_pendentes"
    // =========================================================================
    // Campos:
    // - id (chave primária)
    // - conteudo_id (relation para conteudos_gerados, obrigatório)
    // - aprovador_id (relation para usuarios, obrigatório)
    // - status (select, maxSelect 1, valores: pendente, aprovado, rejeitado; padrão pendente)
    // - comentario (text)
    // - criado_em (autodate onCreate)
    // - decidido_em (date/timestamp)
    // - created/updated padrão PocketBase
    // Índices: conteudo_id, aprovador_id, status.
    //
    // Regras RLS aprovacoes_pendentes:
    // - ceo_financeiro: gerencia qualquer registro.
    // - coordenador_vendas: aprova/rejeita conteúdos de campanhas que ele criou
    //   (conteudo_id.campanha_id.responsavel_id = @request.auth.id ou aprovador_id = @request.auth.id).
    // - vendedor_1 e vendedor_2: só podem criar solicitações de aprovação para conteúdos de campanhas ativas
    //   e NÃO podem aprovar/rejeitar (sem update/delete).
    // - compras_grandes_clientes: só lê aprovações vinculadas a grandes clientes (via conteudo_id.campanha_id.publico_alvo).
    // - estoque: nenhum acesso.
    const aprovacoesListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (conteudo_id.campanha_id.responsavel_id = @request.auth.id || aprovador_id = @request.auth.id)) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (conteudo_id.campanha_id.status = 'ativa' || conteudo_id.campanha_id.status = 'pausada')) || " +
      "(@request.auth.perfil = 'compras_grandes_clientes' && (conteudo_id.campanha_id.publico_alvo.grande_cliente = true || conteudo_id.campanha_id.publico_alvo ~ 'grande_cliente'))" +
      ')'

    const aprovacoesViewRule = aprovacoesListRule

    const aprovacoesCreateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && conteudo_id.campanha_id.responsavel_id = @request.auth.id) || " +
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && conteudo_id.campanha_id.status = 'ativa')" +
      ')'

    const aprovacoesUpdateRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (conteudo_id.campanha_id.responsavel_id = @request.auth.id || aprovador_id = @request.auth.id))" +
      ')'

    const aprovacoesDeleteRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "(@request.auth.perfil = 'coordenador_vendas' && (conteudo_id.campanha_id.responsavel_id = @request.auth.id || aprovador_id = @request.auth.id))" +
      ')'

    const aprovacoesPendentes = new Collection({
      name: 'aprovacoes_pendentes',
      type: 'base',
      listRule: aprovacoesListRule,
      viewRule: aprovacoesViewRule,
      createRule: aprovacoesCreateRule,
      updateRule: aprovacoesUpdateRule,
      deleteRule: aprovacoesDeleteRule,
      fields: [
        {
          name: 'conteudo_id',
          type: 'relation',
          collectionId: conteudosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'aprovador_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['pendente', 'aprovado', 'rejeitado'],
        },
        {
          name: 'comentario',
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
          name: 'decidido_em',
          type: 'date',
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
        'CREATE INDEX idx_aprovacoes_conteudo ON aprovacoes_pendentes (conteudo_id)',
        'CREATE INDEX idx_aprovacoes_aprovador ON aprovacoes_pendentes (aprovador_id)',
        'CREATE INDEX idx_aprovacoes_status ON aprovacoes_pendentes (status)',
      ],
    })
    app.save(aprovacoesPendentes)
  },
  (app) => {
    try {
      const aprovacoes = app.findCollectionByNameOrId('aprovacoes_pendentes')
      app.delete(aprovacoes)
    } catch (_) {}
    try {
      const publicacoes = app.findCollectionByNameOrId('publicacoes')
      app.delete(publicacoes)
    } catch (_) {}
    try {
      const conteudos = app.findCollectionByNameOrId('conteudos_gerados')
      app.delete(conteudos)
    } catch (_) {}
    try {
      const campanhas = app.findCollectionByNameOrId('campanhas')
      app.delete(campanhas)
    } catch (_) {}
  },
)
