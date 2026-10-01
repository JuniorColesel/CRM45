/**
 * Migração 0068: Sincronização e Auditoria Rigorosa de Oportunidades Bling
 *
 * 1. Sincroniza data_origem das oportunidades com base no documento de origem:
 *    - bling_pedidos: data_origem = substr(data_pedido, 1, 10)
 *    - bling_propostas: data_origem = substr(data_proposta, 1, 10)
 *    Isso garante que todas as oportunidades reflitam a data real do pedido/proposta.
 *
 * 2. Garante reclassificação idempotente das oportunidades:
 *    - Pedidos com situacao_bling_nome = 'Em aberto' ou situacao_bling_id = '6':
 *      etapa_id = 'urmqwi8utcs7090' (Em aberto Bling), status = 'ganho', motivo_perda_id = ''
 *    - Pedidos com situacao_bling_nome = 'Atendido' ou situacao_bling_id = '9':
 *      etapa_id = '8py63pcqd6wzqdl' (Fechado), status = 'ganho', motivo_perda_id = ''
 *    - Pedidos com situacao_bling_nome = 'Cancelado' ou situacao_bling_id = '12':
 *      etapa_id = '3rk88yu1u2iqdf5' (Perdido), status = 'perdido', motivo_perda_id = mc59nv8fm6n4h00 (Cancelado no Bling)
 *    - Propostas com status_normalizado = 'nao_aprovada':
 *      etapa_id = '3rk88yu1u2iqdf5' (Perdido), status = 'perdido', motivo_perda_id = nc3qldmyovipzkr (Não aprovada no Bling)
 *    - Propostas com status_normalizado = 'rascunho':
 *      etapa_id = '23irf0s97gtcx3t' (Proposta), status = 'aberto'
 *    - Propostas com status_normalizado = 'aguardando':
 *      etapa_id = 'k7x624b33llmjid' (Negociação), status = 'aberto'
 *
 * 3. Reconciliação dos números canônicos de Setembro/2026 e log de auditoria
 */

migrate(
  (app) => {
    // 1. Sincronizar data_origem das oportunidades
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET data_origem = (
        SELECT substr(bp.data_pedido, 1, 10)
        FROM bling_pedidos bp
        WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
      )
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.data_pedido != '' AND bp.data_pedido IS NOT NULL
        )
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET data_origem = (
        SELECT substr(bp.data_proposta, 1, 10)
        FROM bling_propostas bp
        WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
      )
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.data_proposta != '' AND bp.data_proposta IS NOT NULL
        )
    `)
      .execute()

    // 2. Garantir etapas
    const etapaEmAberto = 'urmqwi8utcs7090'
    const etapaFechado = '8py63pcqd6wzqdl'
    const etapaPerdido = '3rk88yu1u2iqdf5'
    const etapaProposta = '23irf0s97gtcx3t'
    const etapaNegociacao = 'k7x624b33llmjid'

    // Resolver IDs de motivos de perda
    let motivoCanceladoId = 'mc59nv8fm6n4h00'
    let motivoNaoAprovadaId = 'nc3qldmyovipzkr'
    try {
      const mc = app.findFirstRecordByData('motivos_perda', 'descricao', 'Cancelado no Bling')
      if (mc) motivoCanceladoId = mc.id
    } catch (_) {}
    try {
      const mna = app.findFirstRecordByData('motivos_perda', 'descricao', 'Não aprovada no Bling')
      if (mna) motivoNaoAprovadaId = mna.id
    } catch (_) {}

    // 2.1 Em aberto Bling
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'ganho',
        motivo_perda_id = '',
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6'
        )
    `)
      .bind({ etapa: etapaEmAberto })
      .execute()

    // 2.2 Atendidos -> Fechado
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'ganho',
        motivo_perda_id = '',
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9'
        )
    `)
      .bind({ etapa: etapaFechado })
      .execute()

    // 2.3 Cancelados -> Perdido
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'perdido',
        motivo_perda_id = {:motivo},
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12'
        )
    `)
      .bind({ etapa: etapaPerdido, motivo: motivoCanceladoId })
      .execute()

    // 2.4 Propostas Não aprovadas -> Perdido
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'perdido',
        motivo_perda_id = {:motivo},
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.status_normalizado = 'nao_aprovada'
        )
    `)
      .bind({ etapa: etapaPerdido, motivo: motivoNaoAprovadaId })
      .execute()

    // 2.5 Propostas Rascunho -> Proposta
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'aberto',
        motivo_perda_id = '',
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.status_normalizado = 'rascunho'
        )
    `)
      .bind({ etapa: etapaProposta })
      .execute()

    // 2.6 Propostas Aguardando -> Negociação
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET
        etapa_id = {:etapa},
        status = 'aberto',
        motivo_perda_id = '',
        updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.status_normalizado = 'aguardando'
        )
    `)
      .bind({ etapa: etapaNegociacao })
      .execute()

    // 3. Auditoria Setembro/2026
    const auditEmAberto = new DynamicModel({ qtd: 0, soma: '' })
    app
      .db()
      .newQuery(`
      SELECT COUNT(*) as qtd, CAST(COALESCE(SUM(valor), 0) AS TEXT) as soma
      FROM oportunidades
      WHERE etapa_id = {:etapa}
        AND substr(data_origem, 1, 10) >= '2026-09-01'
        AND substr(data_origem, 1, 10) <= '2026-09-30'
    `)
      .bind({ etapa: etapaEmAberto })
      .one(auditEmAberto)

    const auditFechado = new DynamicModel({ qtd: 0, soma: '' })
    app
      .db()
      .newQuery(`
      SELECT COUNT(*) as qtd, CAST(COALESCE(SUM(valor), 0) AS TEXT) as soma
      FROM oportunidades
      WHERE etapa_id = {:etapa}
        AND substr(data_origem, 1, 10) >= '2026-09-01'
        AND substr(data_origem, 1, 10) <= '2026-09-30'
    `)
      .bind({ etapa: etapaFechado })
      .one(auditFechado)

    const auditPerdidoPedidos = new DynamicModel({ qtd: 0, soma: '' })
    app
      .db()
      .newQuery(`
      SELECT COUNT(*) as qtd, CAST(COALESCE(SUM(valor), 0) AS TEXT) as soma
      FROM oportunidades
      WHERE etapa_id = {:etapa} AND tipo_origem = 'bling_pedido'
        AND substr(data_origem, 1, 10) >= '2026-09-01'
        AND substr(data_origem, 1, 10) <= '2026-09-30'
    `)
      .bind({ etapa: etapaPerdido })
      .one(auditPerdidoPedidos)

    const auditPerdidoPropostas = new DynamicModel({ qtd: 0, soma: '' })
    app
      .db()
      .newQuery(`
      SELECT COUNT(*) as qtd, CAST(COALESCE(SUM(valor), 0) AS TEXT) as soma
      FROM oportunidades
      WHERE etapa_id = {:etapa} AND tipo_origem = 'bling_proposta'
        AND substr(data_origem, 1, 10) >= '2026-09-01'
        AND substr(data_origem, 1, 10) <= '2026-09-30'
    `)
      .bind({ etapa: etapaPerdido })
      .one(auditPerdidoPropostas)

    const auditPerdidoTotal = new DynamicModel({ qtd: 0, soma: '' })
    app
      .db()
      .newQuery(`
      SELECT COUNT(*) as qtd, CAST(COALESCE(SUM(valor), 0) AS TEXT) as soma
      FROM oportunidades
      WHERE etapa_id = {:etapa}
        AND substr(data_origem, 1, 10) >= '2026-09-01'
        AND substr(data_origem, 1, 10) <= '2026-09-30'
    `)
      .bind({ etapa: etapaPerdido })
      .one(auditPerdidoTotal)

    console.log(
      '[AUDITORIA 0068 SETEMBRO 2026] ' +
        JSON.stringify({
          em_aberto_bling: {
            qtd: Number(auditEmAberto.qtd),
            soma: Math.round(Number(auditEmAberto.soma) * 100) / 100,
          },
          fechado: {
            qtd: Number(auditFechado.qtd),
            soma: Math.round(Number(auditFechado.soma) * 100) / 100,
          },
          perdido_pedidos: {
            qtd: Number(auditPerdidoPedidos.qtd),
            soma: Math.round(Number(auditPerdidoPedidos.soma) * 100) / 100,
          },
          perdido_propostas: {
            qtd: Number(auditPerdidoPropostas.qtd),
            soma: Math.round(Number(auditPerdidoPropostas.soma) * 100) / 100,
          },
          perdido_total: {
            qtd: Number(auditPerdidoTotal.qtd),
            soma: Math.round(Number(auditPerdidoTotal.soma) * 100) / 100,
          },
        }),
    )
  },
  (app) => {
    // Reversão segura
  },
)
