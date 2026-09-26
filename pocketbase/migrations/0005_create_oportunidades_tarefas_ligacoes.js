migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const clientesCol = app.findCollectionByNameOrId('clientes')
    const etapasFunilCol = app.findCollectionByNameOrId('etapas_funil')
    const motivosPerdaCol = app.findCollectionByNameOrId('motivos_perda')

    // RLS especificadas:
    // - O perfil estoque não tem acesso a nenhuma das três tabelas (@request.auth.perfil != 'estoque').
    // - O perfil ceo_financeiro pode ler, inserir, editar e excluir qualquer registro das três tabelas.
    // - Todos os usuários autenticados (exceto estoque) podem ler, inserir, editar e excluir registros apenas quando o responsavel_id for igual ao seu próprio id.
    // - O perfil coordenador_vendas pode ler todas as oportunidades, tarefas e ligacoes, mas só pode editar e excluir as que têm responsavel_id igual ao seu próprio id.
    // - O perfil compras_grandes_clientes só pode ler registros vinculados a clientes onde grande_cliente seja verdadeiro.

    const listAndViewRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      "@request.auth.perfil = 'coordenador_vendas' || " +
      'responsavel_id = @request.auth.id || ' +
      "(@request.auth.perfil = 'compras_grandes_clientes' && cliente_id.grande_cliente = true)" +
      ')'

    const createRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id' +
      ')'

    const updateAndDeleteRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'responsavel_id = @request.auth.id' +
      ')'

    // 1. Tabela "oportunidades"
    // campos: id (uuid, chave primária), cliente_id (uuid, referência para a tabela clientes, obrigatório),
    // valor (decimal, obrigatório), etapa_id (uuid, referência para a tabela etapas_funil, obrigatório),
    // responsavel_id (uuid, referência para a tabela usuarios, obrigatório),
    // motivo_perda_id (uuid, referência para a tabela motivos_perda),
    // data_prevista_fechamento (date), data_fechamento (timestamp/date),
    // status (enum com valores: aberto, ganho, perdido, padrão aberto),
    // observacoes (texto), criado_em (timestamp, padrão agora), atualizado_em (timestamp, padrão agora).
    const oportunidades = new Collection({
      name: 'oportunidades',
      type: 'base',
      listRule: listAndViewRule,
      viewRule: listAndViewRule,
      createRule: createRule,
      updateRule: updateAndDeleteRule,
      deleteRule: updateAndDeleteRule,
      fields: [
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'valor',
          type: 'number',
          required: true,
        },
        {
          name: 'etapa_id',
          type: 'relation',
          collectionId: etapasFunilCol.id,
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
          name: 'motivo_perda_id',
          type: 'relation',
          collectionId: motivosPerdaCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'data_prevista_fechamento',
          type: 'date',
          required: false,
        },
        {
          name: 'data_fechamento',
          type: 'date',
          required: false,
        },
        {
          name: 'status',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['aberto', 'ganho', 'perdido'],
        },
        {
          name: 'observacoes',
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
        'CREATE INDEX idx_oportunidades_cliente ON oportunidades (cliente_id)',
        'CREATE INDEX idx_oportunidades_responsavel ON oportunidades (responsavel_id)',
        'CREATE INDEX idx_oportunidades_etapa ON oportunidades (etapa_id)',
        'CREATE INDEX idx_oportunidades_status ON oportunidades (status)',
      ],
    })
    app.save(oportunidades)

    // 2. Tabela "tarefas"
    // campos: id (uuid, chave primária), cliente_id (uuid, referência para a tabela clientes, obrigatório),
    // responsavel_id (uuid, referência para a tabela usuarios, obrigatório),
    // tipo (enum com valores: ligacao, visita, email, whatsapp, reuniao, outro, obrigatório),
    // descricao (texto, obrigatório), data_hora (timestamp/date, obrigatório),
    // concluida (booleano, padrão falso), data_conclusao (timestamp/date),
    // criado_em (timestamp, padrão agora).
    const tarefas = new Collection({
      name: 'tarefas',
      type: 'base',
      listRule: listAndViewRule,
      viewRule: listAndViewRule,
      createRule: createRule,
      updateRule: updateAndDeleteRule,
      deleteRule: updateAndDeleteRule,
      fields: [
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
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
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['ligacao', 'visita', 'email', 'whatsapp', 'reuniao', 'outro'],
        },
        {
          name: 'descricao',
          type: 'text',
          required: true,
        },
        {
          name: 'data_hora',
          type: 'date',
          required: true,
        },
        {
          name: 'concluida',
          type: 'bool',
          required: false,
        },
        {
          name: 'data_conclusao',
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
        'CREATE INDEX idx_tarefas_cliente ON tarefas (cliente_id)',
        'CREATE INDEX idx_tarefas_responsavel ON tarefas (responsavel_id)',
        'CREATE INDEX idx_tarefas_data_hora ON tarefas (data_hora)',
      ],
    })
    app.save(tarefas)

    // 3. Tabela "ligacoes"
    // campos: id (uuid, chave primária), cliente_id (uuid, referência para a tabela clientes, obrigatório),
    // responsavel_id (uuid, referência para a tabela usuarios, obrigatório),
    // data_hora (timestamp, obrigatório), duracao_segundos (inteiro),
    // tipo (enum com valores: entrada, saida, perdida, obrigatório),
    // resultado (enum com valores: atendeu, nao_atendeu, caixa_postal, ocupado, desligou),
    // observacoes (texto), proxima_acao (texto), data_proxima_acao (timestamp), criado_em (timestamp, padrão agora).
    const ligacoes = new Collection({
      name: 'ligacoes',
      type: 'base',
      listRule: listAndViewRule,
      viewRule: listAndViewRule,
      createRule: createRule,
      updateRule: updateAndDeleteRule,
      deleteRule: updateAndDeleteRule,
      fields: [
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
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
          name: 'data_hora',
          type: 'date',
          required: true,
        },
        {
          name: 'duracao_segundos',
          type: 'number',
          onlyInt: true,
          required: false,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['entrada', 'saida', 'perdida'],
        },
        {
          name: 'resultado',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['atendeu', 'nao_atendeu', 'caixa_postal', 'ocupado', 'desligou'],
        },
        {
          name: 'observacoes',
          type: 'text',
          required: false,
        },
        {
          name: 'proxima_acao',
          type: 'text',
          required: false,
        },
        {
          name: 'data_proxima_acao',
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
        'CREATE INDEX idx_ligacoes_cliente ON ligacoes (cliente_id)',
        'CREATE INDEX idx_ligacoes_responsavel ON ligacoes (responsavel_id)',
        'CREATE INDEX idx_ligacoes_data_hora ON ligacoes (data_hora)',
      ],
    })
    app.save(ligacoes)
  },
  (app) => {
    try {
      const ligacoes = app.findCollectionByNameOrId('ligacoes')
      app.delete(ligacoes)
    } catch (_) {}
    try {
      const tarefas = app.findCollectionByNameOrId('tarefas')
      app.delete(tarefas)
    } catch (_) {}
    try {
      const oportunidades = app.findCollectionByNameOrId('oportunidades')
      app.delete(oportunidades)
    } catch (_) {}
  },
)
