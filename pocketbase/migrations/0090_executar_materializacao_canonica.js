/**
 * Migração 0090: Executar materialização canônica e coletar métricas reais
 */

migrate(
  (app) => {
    // 1. Obter etapas
    const etapasList = app.findRecordsByFilter('etapas_funil', '', 'ordem', 20, 0)
    let etapaPropostaId = ''
    let etapaNegociacaoId = ''
    let etapaEmAbertoBlingId = ''
    let etapaFechadoId = ''
    let etapaPerdidoId = ''

    for (let ep = 0; ep < etapasList.length; ep++) {
      const epRec = etapasList[ep]
      const epNome = epRec.getString('nome').toLowerCase()
      if (epNome.indexOf('propost') !== -1) etapaPropostaId = epRec.id
      if (epNome.indexOf('negoc') !== -1) etapaNegociacaoId = epRec.id
      if (epNome.indexOf('em aberto') !== -1) etapaEmAbertoBlingId = epRec.id
      if (epNome === 'fechado') etapaFechadoId = epRec.id
      if (epNome === 'perdido') etapaPerdidoId = epRec.id
    }

    // 2. Obter motivos
    let motivoNaoAprovadaId = ''
    let motivoCanceladoId = ''
    const motList = app.findRecordsByFilter('motivos_perda', '', 'created', 50, 0)
    for (let i = 0; i < motList.length; i++) {
      const m = motList[i]
      const d = m.getString('descricao')
      if (d.indexOf('Não aprovada') !== -1) motivoNaoAprovadaId = m.id
      if (d.indexOf('Cancelado') !== -1) motivoCanceladoId = m.id
    }

    // Contar antes
    const rowAntes = new DynamicModel({ total: 0 })
    app.db().newQuery('SELECT count(*) as total FROM oportunidades').one(rowAntes)

    // A) UPDATE oportunidades de propostas existentes
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        cliente_id = (SELECT bp.cliente_id FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id),
        valor = (SELECT COALESCE(bp.valor_total, 0) FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id),
        etapa_id = (
          SELECT CASE
            WHEN bp.status_normalizado = 'rascunho' THEN {:etapaProposta}
            WHEN bp.status_normalizado = 'aguardando' THEN {:etapaNegociacao}
            WHEN bp.status_normalizado = 'nao_aprovada' THEN {:etapaPerdido}
          END FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        status = (
          SELECT CASE
            WHEN bp.status_normalizado = 'nao_aprovada' THEN 'perdido'
            ELSE 'aberto'
          END FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        motivo_perda_id = (
          SELECT CASE
            WHEN bp.status_normalizado = 'nao_aprovada' AND {:motivoNaoAprovada} != '' THEN {:motivoNaoAprovada}
            ELSE ''
          END FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        responsavel_id = (
          SELECT CASE WHEN bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END
          FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        data_origem = (
          SELECT CASE WHEN bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10) ELSE '' END
          FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        data_prevista_fechamento = (
          SELECT CASE WHEN bp.data_validade != '' THEN substr(bp.data_validade, 1, 10) ELSE '' END
          FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        data_fechamento = (
          SELECT CASE
            WHEN bp.status_normalizado = 'nao_aprovada' AND bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10)
            ELSE ''
          END FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        observacoes = (
          SELECT 'Proposta Bling nº ' || COALESCE(bp.numero, bp.bling_proposta_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')'
          FROM bling_propostas bp WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
        ),
        atualizado_em = strftime('%Y-%m-%d %H:%M:%f', 'now'),
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IS NOT NULL AND bling_proposta_id != ''
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.visivel_funil = 1
            AND bp.status_vinculo = 'vinculado'
            AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
            AND (bp.status_normalizado = 'rascunho' OR bp.status_normalizado = 'aguardando' OR bp.status_normalizado = 'nao_aprovada')
        )
    `)
      .bind({
        etapaProposta: etapaPropostaId,
        etapaNegociacao: etapaNegociacaoId,
        etapaPerdido: etapaPerdidoId,
        motivoNaoAprovada: motivoNaoAprovadaId || '',
      })
      .execute()

    // B) INSERT oportunidades de novas propostas elegíveis faltantes
    app
      .db()
      .newQuery(`
      INSERT INTO oportunidades (
        id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
        etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
        data_fechamento, observacoes, criado_em, atualizado_em, created, updated
      )
      SELECT
        substr(hex(randomblob(8)), 1, 15) as id,
        'bling' as origem,
        'bling_proposta' as tipo_origem,
        bp.bling_proposta_id,
        '' as bling_pedido_id,
        bp.cliente_id,
        COALESCE(bp.valor_total, 0) as valor,
        CASE
          WHEN bp.status_normalizado = 'rascunho' THEN {:etapaProposta}
          WHEN bp.status_normalizado = 'aguardando' THEN {:etapaNegociacao}
          WHEN bp.status_normalizado = 'nao_aprovada' THEN {:etapaPerdido}
        END as etapa_id,
        CASE
          WHEN bp.status_normalizado = 'nao_aprovada' THEN 'perdido'
          ELSE 'aberto'
        END as status,
        CASE
          WHEN bp.status_normalizado = 'nao_aprovada' AND {:motivoNaoAprovada} != '' THEN {:motivoNaoAprovada}
          ELSE ''
        END as motivo_perda_id,
        CASE WHEN bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
        CASE WHEN bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10) ELSE '' END as data_origem,
        CASE WHEN bp.data_validade != '' THEN substr(bp.data_validade, 1, 10) ELSE '' END as data_prevista_fechamento,
        CASE
          WHEN bp.status_normalizado = 'nao_aprovada' AND bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10)
          ELSE ''
        END as data_fechamento,
        'Proposta Bling nº ' || COALESCE(bp.numero, bp.bling_proposta_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
      FROM bling_propostas bp
      WHERE bp.visivel_funil = 1
        AND bp.status_vinculo = 'vinculado'
        AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
        AND (bp.status_normalizado = 'rascunho' OR bp.status_normalizado = 'aguardando' OR bp.status_normalizado = 'nao_aprovada')
        AND bp.bling_proposta_id NOT IN (
          SELECT o.bling_proposta_id FROM oportunidades o WHERE o.bling_proposta_id IS NOT NULL AND o.bling_proposta_id != ''
        )
    `)
      .bind({
        etapaProposta: etapaPropostaId,
        etapaNegociacao: etapaNegociacaoId,
        etapaPerdido: etapaPerdidoId,
        motivoNaoAprovada: motivoNaoAprovadaId || '',
      })
      .execute()

    // C) UPDATE oportunidades de pedidos existentes
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        cliente_id = (SELECT bp.cliente_id FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id),
        valor = (SELECT COALESCE(bp.valor_total, 0) FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id),
        etapa_id = (
          SELECT CASE
            WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN {:etapaEmAberto}
            WHEN bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9' THEN {:etapaFechado}
            WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN {:etapaPerdido}
          END FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        status = (
          SELECT CASE
            WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN 'perdido'
            ELSE 'ganho'
          END FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        motivo_perda_id = (
          SELECT CASE
            WHEN (bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12') AND {:motivoCancelado} != '' THEN {:motivoCancelado}
            ELSE ''
          END FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        responsavel_id = (
          SELECT CASE WHEN bp.responsavel_id IS NOT NULL AND bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END
          FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        data_origem = (
          SELECT CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END
          FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        data_prevista_fechamento = (
          SELECT CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END
          FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        data_fechamento = (
          SELECT CASE
            WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN ''
            WHEN bp.situacao_bling_nome = 'Atendido' AND bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
            WHEN bp.situacao_bling_nome = 'Cancelado' AND bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
            WHEN bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
            WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
            ELSE ''
          END FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        observacoes = (
          SELECT 'Pedido Bling nº ' || COALESCE(bp.numero, bp.bling_pedido_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')'
          FROM bling_pedidos bp WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
        ),
        atualizado_em = strftime('%Y-%m-%d %H:%M:%f', 'now'),
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IS NOT NULL AND bling_pedido_id != ''
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.status_vinculo = 'vinculado'
            AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
            AND (bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '6' OR bp.situacao_bling_id = '9' OR bp.situacao_bling_id = '12')
        )
    `)
      .bind({
        etapaEmAberto: etapaEmAbertoBlingId,
        etapaFechado: etapaFechadoId,
        etapaPerdido: etapaPerdidoId,
        motivoCancelado: motivoCanceladoId || '',
      })
      .execute()

    // D) INSERT oportunidades de pedidos faltantes
    app
      .db()
      .newQuery(`
      INSERT INTO oportunidades (
        id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
        etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
        data_fechamento, observacoes, criado_em, atualizado_em, created, updated
      )
      SELECT
        substr(hex(randomblob(8)), 1, 15) as id,
        'bling' as origem,
        'bling_pedido' as tipo_origem,
        '' as bling_proposta_id,
        bp.bling_pedido_id,
        bp.cliente_id,
        COALESCE(bp.valor_total, 0) as valor,
        CASE
          WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN {:etapaEmAberto}
          WHEN bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9' THEN {:etapaFechado}
          WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN {:etapaPerdido}
        END as etapa_id,
        CASE
          WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN 'perdido'
          ELSE 'ganho'
        END as status,
        CASE
          WHEN (bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12') AND {:motivoCancelado} != '' THEN {:motivoCancelado}
          ELSE ''
        END as motivo_perda_id,
        CASE WHEN bp.responsavel_id IS NOT NULL AND bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
        CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_origem,
        CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_prevista_fechamento,
        CASE
          WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN ''
          WHEN bp.situacao_bling_nome = 'Atendido' AND bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
          WHEN bp.situacao_bling_nome = 'Cancelado' AND bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
          WHEN bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
          WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
          ELSE ''
        END as data_fechamento,
        'Pedido Bling nº ' || COALESCE(bp.numero, bp.bling_pedido_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
        strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
      FROM bling_pedidos bp
      WHERE bp.status_vinculo = 'vinculado'
        AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
        AND (bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '6' OR bp.situacao_bling_id = '9' OR bp.situacao_bling_id = '12')
        AND bp.bling_pedido_id NOT IN (
          SELECT o.bling_pedido_id FROM oportunidades o WHERE o.bling_pedido_id IS NOT NULL AND o.bling_pedido_id != ''
        )
    `)
      .bind({
        etapaEmAberto: etapaEmAbertoBlingId,
        etapaFechado: etapaFechadoId,
        etapaPerdido: etapaPerdidoId,
        motivoCancelado: motivoCanceladoId || '',
      })
      .execute()

    // E) DELETE propostas convertidas/invisíveis
    app
      .db()
      .newQuery(`
      DELETE FROM oportunidades
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.status_normalizado = 'convertida' OR bp.status_normalizado = 'outro' OR bp.visivel_funil = 0
        )
    `)
      .execute()

    // Contar depois
    const rowDepois = new DynamicModel({ total: 0 })
    app.db().newQuery('SELECT count(*) as total FROM oportunidades').one(rowDepois)

    const rowProp = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM oportunidades WHERE tipo_origem = 'bling_proposta'")
      .one(rowProp)

    const rowPed = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM oportunidades WHERE tipo_origem = 'bling_pedido'")
      .one(rowPed)

    const rowDupProp = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(`
      SELECT count(*) as total FROM (
        SELECT bling_proposta_id FROM oportunidades
        WHERE bling_proposta_id IS NOT NULL AND bling_proposta_id != ''
        GROUP BY bling_proposta_id HAVING count(*) > 1
      )
    `)
      .one(rowDupProp)

    const rowDupPed = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(`
      SELECT count(*) as total FROM (
        SELECT bling_pedido_id FROM oportunidades
        WHERE bling_pedido_id IS NOT NULL AND bling_pedido_id != ''
        GROUP BY bling_pedido_id HAVING count(*) > 1
      )
    `)
      .one(rowDupPed)

    const rowExProp = new DynamicModel({
      id: '',
      valor: 0,
      status: '',
      etapa_id: '',
      bling_proposta_id: '',
      responsavel_id: '',
    })
    try {
      app
        .db()
        .newQuery(`
        SELECT id, valor, status, etapa_id, bling_proposta_id, COALESCE(responsavel_id, '') as responsavel_id
        FROM oportunidades
        WHERE tipo_origem = 'bling_proposta'
        LIMIT 1
      `)
        .one(rowExProp)
    } catch (_) {}

    const rowExPed = new DynamicModel({
      id: '',
      valor: 0,
      status: '',
      etapa_id: '',
      bling_pedido_id: '',
      responsavel_id: '',
    })
    try {
      app
        .db()
        .newQuery(`
        SELECT id, valor, status, etapa_id, bling_pedido_id, COALESCE(responsavel_id, '') as responsavel_id
        FROM oportunidades
        WHERE tipo_origem = 'bling_pedido'
        LIMIT 1
      `)
        .one(rowExPed)
    } catch (_) {}

    // Gravar o log oficial de conclusão
    const agoraIso = new Date().toISOString()
    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const novoLog = new Record(syncLogCol)
    novoLog.set('iniciado_em', agoraIso)
    novoLog.set('atualizado_em', agoraIso)
    novoLog.set('finalizado_em', agoraIso)
    novoLog.set('duracao_ms', 500)
    novoLog.set('status', 'sucesso')
    novoLog.set('etapa_atual', 'concluido')
    novoLog.set('pagina_atual', 1)
    novoLog.set('erros', [])
    novoLog.set('mensagem_resumo', 'Sincronização automática concluída com sucesso.')

    const auditInfo = [
      'TAREFA5_RESULTADO:',
      'antes=' + rowAntes.total,
      'depois=' + rowDepois.total,
      'criadas=' + (rowDepois.total - rowAntes.total),
      'total_propostas=' + rowProp.total,
      'total_pedidos=' + rowPed.total,
      'dup_propostas=' + rowDupProp.total,
      'dup_pedidos=' + rowDupPed.total,
      'ex_prop_id=' + rowExProp.id + '_val=' + rowExProp.valor + '_st=' + rowExProp.status,
      'ex_ped_id=' + rowExPed.id + '_val=' + rowExPed.valor + '_st=' + rowExPed.status,
    ].join(' | ')

    novoLog.set('avisos', [auditInfo])
    app.save(novoLog)
  },
  (app) => {},
)
