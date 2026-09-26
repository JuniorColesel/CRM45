migrate(
  (app) => {
    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const clientesCol = app.findCollectionByNameOrId('clientes')

    // 1. Tabela "canais_marketing"
    // campos:
    // - id (uuid, chave primária gerenciada pelo PB)
    // - nome (texto, obrigatório)
    // - tipo (enum com valores: whatsapp, email, sms, obrigatório)
    // - configuracao (jsonb/json, para armazenar credenciais e configurações do canal)
    // - ativo (booleano, padrão verdadeiro)
    // - criado_em (timestamp, padrão agora)
    // RLS:
    // - Apenas o perfil ceo_financeiro pode criar, editar e excluir canais_marketing
    // - Demais perfis autenticados (exceto estoque) podem apenas ler canais_marketing ativos (ativo = true)
    // - Estoque não tem acesso a nenhuma das três tabelas
    const canaisListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil = 'ceo_financeiro' || ativo = true)"
    const canaisViewRule = canaisListRule
    const canaisManageRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    const canaisMarketing = new Collection({
      name: 'canais_marketing',
      type: 'base',
      listRule: canaisListRule,
      viewRule: canaisViewRule,
      createRule: canaisManageRule,
      updateRule: canaisManageRule,
      deleteRule: canaisManageRule,
      fields: [
        {
          name: 'nome',
          type: 'text',
          required: true,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['whatsapp', 'email', 'sms'],
        },
        {
          name: 'configuracao',
          type: 'json',
          required: false,
        },
        {
          name: 'ativo',
          type: 'bool',
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
        'CREATE INDEX idx_canais_marketing_tipo ON canais_marketing (tipo)',
        'CREATE INDEX idx_canais_marketing_ativo ON canais_marketing (ativo)',
      ],
    })
    app.save(canaisMarketing)

    const canaisCol = app.findCollectionByNameOrId('canais_marketing')

    // 2. Tabela "automacoes"
    // campos:
    // - id (uuid, chave primária gerenciada pelo PB)
    // - nome (texto, obrigatório)
    // - descricao (texto)
    // - gatilho (enum: novo_cliente, nova_oportunidade, mudanca_etapa, tarefa_vencida, sem_contato_dias, aniversario, inativo_dias, obrigatório)
    // - parametro_gatilho (texto, para armazenar valores como número de dias)
    // - acao (enum: enviar_whatsapp, enviar_email, criar_tarefa, mover_etapa, enviar_sms, obrigatório)
    // - canal_id (uuid, referência para a tabela canais_marketing)
    // - mensagem_modelo (texto)
    // - responsavel_id (uuid, referência para a tabela usuarios, obrigatório)
    // - ativa (booleano, padrão verdadeiro)
    // - criada_em (timestamp, padrão agora)
    // - atualizada_em (timestamp, padrão agora)
    // RLS:
    // - Leitura: todos os usuários autenticados (exceto estoque) podem ler automações
    // - Escrita (create, update, delete): cada usuário só pode criar, editar e excluir automações cujo responsavel_id seja igual ao seu próprio id;
    //   o perfil ceo_financeiro pode gerenciar qualquer registro;
    //   o perfil coordenador_vendas só pode criar, editar e excluir as que têm responsavel_id igual ao seu próprio id.
    // - Estoque não tem acesso a nenhuma das três tabelas.
    const automacoesListRule = "@request.auth.id != '' && @request.auth.perfil != 'estoque'"
    const automacoesViewRule = automacoesListRule
    const automacoesWriteRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (@request.auth.perfil = 'ceo_financeiro' || responsavel_id = @request.auth.id)"

    const automacoes = new Collection({
      name: 'automacoes',
      type: 'base',
      listRule: automacoesListRule,
      viewRule: automacoesViewRule,
      createRule: automacoesWriteRule,
      updateRule: automacoesWriteRule,
      deleteRule: automacoesWriteRule,
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
          name: 'gatilho',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'novo_cliente',
            'nova_oportunidade',
            'mudanca_etapa',
            'tarefa_vencida',
            'sem_contato_dias',
            'aniversario',
            'inativo_dias',
          ],
        },
        {
          name: 'parametro_gatilho',
          type: 'text',
          required: false,
        },
        {
          name: 'acao',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['enviar_whatsapp', 'enviar_email', 'criar_tarefa', 'mover_etapa', 'enviar_sms'],
        },
        {
          name: 'canal_id',
          type: 'relation',
          collectionId: canaisCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'mensagem_modelo',
          type: 'text',
          required: false,
        },
        {
          name: 'responsavel_id',
          type: 'relation',
          collectionId: usuariosCol.id,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'ativa',
          type: 'bool',
          required: false,
        },
        {
          name: 'criada_em',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'atualizada_em',
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
        'CREATE INDEX idx_automacoes_responsavel ON automacoes (responsavel_id)',
        'CREATE INDEX idx_automacoes_canal ON automacoes (canal_id)',
        'CREATE INDEX idx_automacoes_gatilho ON automacoes (gatilho)',
        'CREATE INDEX idx_automacoes_ativa ON automacoes (ativa)',
      ],
    })
    app.save(automacoes)

    const automacoesCol = app.findCollectionByNameOrId('automacoes')

    // 3. Tabela "mensagens_enviadas"
    // campos:
    // - id (uuid, chave primária gerenciada pelo PB)
    // - automacao_id (uuid, referência para a tabela automacoes)
    // - cliente_id (uuid, referência para a tabela clientes, obrigatório)
    // - canal (enum com valores: whatsapp, email, sms, obrigatório)
    // - conteudo (texto, obrigatório)
    // - status (enum com valores: pendente, enviada, entregue, lida, falhou, obrigatório)
    // - data_envio (timestamp/date)
    // - data_leitura (timestamp/date)
    // - erro (texto)
    // - criado_em (timestamp, padrão agora)
    // RLS:
    // - Leitura: todos os autenticados exceto estoque podem ler;
    //   compras_grandes_clientes só pode ler registros vinculados a clientes onde grande_cliente seja verdadeiro;
    //   coordenador_vendas e ceo_financeiro podem ler todas;
    //   estoque não tem acesso.
    // - Escrita: ceo_financeiro pode gerenciar qualquer registro;
    //   demais usuários (e coordenador_vendas na escrita) gerenciam apenas registros do cliente sob sua responsabilidade (cliente_id.responsavel_id = @request.auth.id).
    const mensagensListRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil != 'compras_grandes_clientes' || cliente_id.grande_cliente = true" +
      ')'
    const mensagensViewRule = mensagensListRule

    const mensagensWriteRule =
      "@request.auth.id != '' && @request.auth.perfil != 'estoque' && (" +
      "@request.auth.perfil = 'ceo_financeiro' || " +
      'cliente_id.responsavel_id = @request.auth.id' +
      ')'

    const mensagensEnviadas = new Collection({
      name: 'mensagens_enviadas',
      type: 'base',
      listRule: mensagensListRule,
      viewRule: mensagensViewRule,
      createRule: mensagensWriteRule,
      updateRule: mensagensWriteRule,
      deleteRule: mensagensWriteRule,
      fields: [
        {
          name: 'automacao_id',
          type: 'relation',
          collectionId: automacoesCol.id,
          maxSelect: 1,
          required: false,
        },
        {
          name: 'cliente_id',
          type: 'relation',
          collectionId: clientesCol.id,
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
          name: 'conteudo',
          type: 'text',
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['pendente', 'enviada', 'entregue', 'lida', 'falhou'],
        },
        {
          name: 'data_envio',
          type: 'date',
          required: false,
        },
        {
          name: 'data_leitura',
          type: 'date',
          required: false,
        },
        {
          name: 'erro',
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
        'CREATE INDEX idx_mensagens_enviadas_automacao ON mensagens_enviadas (automacao_id)',
        'CREATE INDEX idx_mensagens_enviadas_cliente ON mensagens_enviadas (cliente_id)',
        'CREATE INDEX idx_mensagens_enviadas_canal ON mensagens_enviadas (canal)',
        'CREATE INDEX idx_mensagens_enviadas_status ON mensagens_enviadas (status)',
      ],
    })
    app.save(mensagensEnviadas)
  },
  (app) => {
    try {
      const mensagensEnviadas = app.findCollectionByNameOrId('mensagens_enviadas')
      app.delete(mensagensEnviadas)
    } catch (_) {}
    try {
      const automacoes = app.findCollectionByNameOrId('automacoes')
      app.delete(automacoes)
    } catch (_) {}
    try {
      const canaisMarketing = app.findCollectionByNameOrId('canais_marketing')
      app.delete(canaisMarketing)
    } catch (_) {}
  },
)
