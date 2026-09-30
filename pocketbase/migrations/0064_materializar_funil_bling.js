/**
 * Migração 0064: Materialização Inicial e Idempotente do Funil Híbrido Bling
 *
 * Popula a coleção 'oportunidades' a partir das propostas e pedidos existentes no banco real:
 * - Propostas: Rascunho -> Proposta (aberto), Aguardando -> Negociação (aberto), Não aprovada -> Fechado (perdido)
 * - Pedidos: Em aberto -> Fechado (ganho), Atendido -> Fechado (ganho), Cancelado -> Fechado (perdido)
 * - Respeita vínculos de clientes (apenas clientes válidos)
 * - Define chaves externas e timestamps de data_origem e data_fechamento (usando '' em vez de NULL caso coluna SQLite seja NOT NULL)
 */

migrate(
  (app) => {
    // 1. Garantir que colunas opcionais não sejam required no schema do PocketBase
    try {
      const opCol = app.findCollectionByNameOrId('oportunidades')
      let saveNeeded = false
      const df = opCol.fields.getByName('data_fechamento')
      if (df && df.required) {
        df.required = false
        saveNeeded = true
      }
      const dpf = opCol.fields.getByName('data_prevista_fechamento')
      if (dpf && dpf.required) {
        dpf.required = false
        saveNeeded = true
      }
      const mp = opCol.fields.getByName('motivo_perda_id')
      if (mp && mp.required) {
        mp.required = false
        saveNeeded = true
      }
      if (saveNeeded) {
        app.save(opCol)
      }
    } catch (_) {}

    // 2. Resolver etapas
    const etapaProposta = app.findFirstRecordByData('etapas_funil', 'nome', 'Proposta')
    const etapaNegociacao = app.findFirstRecordByData('etapas_funil', 'nome', 'Negociação')
    const etapaFechado = app.findFirstRecordByData('etapas_funil', 'nome', 'Fechado')

    const etapaPropostaId = etapaProposta ? etapaProposta.id : ''
    const etapaNegociacaoId = etapaNegociacao ? etapaNegociacao.id : ''
    const etapaFechadoId = etapaFechado ? etapaFechado.id : ''

    // 3. Resolver motivos de perda
    let motivoNaoAprovadaId = null
    let motivoCanceladoId = null
    try {
      const motNao = app.findFirstRecordByData(
        'motivos_perda',
        'descricao',
        'Não aprovada no Bling',
      )
      if (motNao) motivoNaoAprovadaId = motNao.id
    } catch (_) {}
    try {
      const motCanc = app.findFirstRecordByData('motivos_perda', 'descricao', 'Cancelado no Bling')
      if (motCanc) motivoCanceladoId = motCanc.id
    } catch (_) {}

    // 4. Inserir propostas Bling elegíveis no funil
    // NOTA SQLite PocketBase: campos date NOT NULL vazios usam ''
    app
      .db()
      .newQuery(`
      INSERT INTO oportunidades (
        id,
        origem,
        tipo_origem,
        bling_proposta_id,
        bling_pedido_id,
        cliente_id,
        valor,
        etapa_id,
        status,
        motivo_perda_id,
        responsavel_id,
        data_origem,
        data_prevista_fechamento,
        data_fechamento,
        observacoes,
        criado_em,
        atualizado_em,
        created,
        updated
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
          WHEN bp.status_normalizado = 'nao_aprovada' THEN {:etapaFechado}
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
        etapaFechado: etapaFechadoId,
        motivoNaoAprovada: motivoNaoAprovadaId || '',
      })
      .execute()

    // 5. Inserir pedidos Bling elegíveis no funil
    app
      .db()
      .newQuery(`
      INSERT INTO oportunidades (
        id,
        origem,
        tipo_origem,
        bling_proposta_id,
        bling_pedido_id,
        cliente_id,
        valor,
        etapa_id,
        status,
        motivo_perda_id,
        responsavel_id,
        data_origem,
        data_prevista_fechamento,
        data_fechamento,
        observacoes,
        criado_em,
        atualizado_em,
        created,
        updated
      )
      SELECT
        substr(hex(randomblob(8)), 1, 15) as id,
        'bling' as origem,
        'bling_pedido' as tipo_origem,
        '' as bling_proposta_id,
        bp.bling_pedido_id,
        bp.cliente_id,
        COALESCE(bp.valor_total, 0) as valor,
        {:etapaFechado} as etapa_id,
        CASE
          WHEN bp.situacao_bling_nome = 'Cancelado' THEN 'perdido'
          ELSE 'ganho'
        END as status,
        CASE
          WHEN bp.situacao_bling_nome = 'Cancelado' AND {:motivoCancelado} != '' THEN {:motivoCancelado}
          ELSE ''
        END as motivo_perda_id,
        CASE WHEN bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
        CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_origem,
        CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_prevista_fechamento,
        CASE
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
        AND (bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_nome = 'Cancelado')
        AND bp.bling_pedido_id NOT IN (
          SELECT o.bling_pedido_id FROM oportunidades o WHERE o.bling_pedido_id IS NOT NULL AND o.bling_pedido_id != ''
        )
    `)
      .bind({
        etapaFechado: etapaFechadoId,
        motivoCancelado: motivoCanceladoId || '',
      })
      .execute()
  },
  (app) => {
    try {
      app.db().newQuery("DELETE FROM oportunidades WHERE origem = 'bling'").execute()
    } catch (_) {}
  },
)
