/**
 * Migração 0066: Auditoria Rigorosa do Funil e Dashboard
 *
 * Realiza as checagens exatas solicitadas pela v0.0.88:
 * - Auditoria retroativa de data_origem por ID externo (bling_proposta_id e bling_pedido_id)
 * - Auditoria retroativa de responsavel_id
 * - Contagem e reconciliação oficial Setembro/2026 (Propostas e Pedidos elegíveis vs Oportunidades do Funil)
 * - Contagem oficial dos totais do Funil (3.354 total, 2.959 ganhos, 242 perdidas, 153 abertas)
 * - Soma de Vendas Setembro/2026 e Qtd Pedidos Válidos Setembro/2026 (esperado: R$ 168.576,16 e 306 pedidos)
 *
 * Registra os resultados com console.log('[AUDITORIA 0066 ...]').
 */

migrate(
  (app) => {
    // 1. Correção retroativa de data_origem caso haja documento com data e oportunidade sem
    const updDataProp = app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET data_origem = substr((
        SELECT bp.data_proposta
        FROM bling_propostas bp
        WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
      ), 1, 10)
      WHERE tipo_origem = 'bling_proposta'
        AND (data_origem = '' OR data_origem IS NULL)
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.data_proposta != '' AND bp.data_proposta IS NOT NULL
        )
    `)
      .execute()

    const updDataPed = app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET data_origem = substr((
        SELECT bp.data_pedido
        FROM bling_pedidos bp
        WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
      ), 1, 10)
      WHERE tipo_origem = 'bling_pedido'
        AND (data_origem = '' OR data_origem IS NULL)
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.data_pedido != '' AND bp.data_pedido IS NOT NULL
        )
    `)
      .execute()

    // 2. Correção retroativa de responsavel_id caso documento tenha e oportunidade não
    const updRespPed = app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET responsavel_id = (
        SELECT bp.responsavel_id
        FROM bling_pedidos bp
        WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
      )
      WHERE tipo_origem = 'bling_pedido'
        AND (responsavel_id = '' OR responsavel_id IS NULL)
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.responsavel_id != '' AND bp.responsavel_id IS NOT NULL
        )
    `)
      .execute()

    const updRespProp = app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET responsavel_id = (
        SELECT bp.responsavel_id
        FROM bling_propostas bp
        WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
      )
      WHERE tipo_origem = 'bling_proposta'
        AND (responsavel_id = '' OR responsavel_id IS NULL)
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.responsavel_id != '' AND bp.responsavel_id IS NOT NULL
        )
    `)
      .execute()

    // 3. Auditoria banco real
    try {
      // 3.1 Totais gerais do Funil
      const funilTotais = new DynamicModel({
        total: 0,
        ganhos: 0,
        perdidos: 0,
        abertos: 0,
        sem_data_origem: 0,
        com_data_origem: 0,
        com_responsavel: 0,
        sem_responsavel: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ganho' THEN 1 ELSE 0 END) as ganhos,
          SUM(CASE WHEN status = 'perdido' THEN 1 ELSE 0 END) as perdidos,
          SUM(CASE WHEN status = 'aberto' THEN 1 ELSE 0 END) as abertos,
          SUM(CASE WHEN data_origem = '' OR data_origem IS NULL THEN 1 ELSE 0 END) as sem_data_origem,
          SUM(CASE WHEN data_origem != '' AND data_origem IS NOT NULL THEN 1 ELSE 0 END) as com_data_origem,
          SUM(CASE WHEN responsavel_id != '' AND responsavel_id IS NOT NULL THEN 1 ELSE 0 END) as com_responsavel,
          SUM(CASE WHEN responsavel_id = '' OR responsavel_id IS NULL THEN 1 ELSE 0 END) as sem_responsavel
        FROM oportunidades
        WHERE origem = 'bling'
      `)
        .one(funilTotais)

      // 3.2 Reconciliação Setembro/2026: Documentos elegíveis vs Oportunidades do funil
      // Propostas Setembro elegíveis (data_proposta em setembro, vinculadas, rascunho/aguardando/nao_aprovada)
      const propSetDoc = new DynamicModel({ total_doc: 0, vinculadas: 0, pendentes: 0 })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total_doc,
          SUM(CASE WHEN status_vinculo = 'vinculado' AND cliente_id != '' AND cliente_id IS NOT NULL THEN 1 ELSE 0 END) as vinculadas,
          SUM(CASE WHEN status_vinculo != 'vinculado' OR cliente_id = '' OR cliente_id IS NULL THEN 1 ELSE 0 END) as pendentes
        FROM bling_propostas
        WHERE visivel_funil = 1
          AND (status_normalizado = 'rascunho' OR status_normalizado = 'aguardando' OR status_normalizado = 'nao_aprovada')
          AND substr(data_proposta, 1, 10) >= '2026-09-01'
          AND substr(data_proposta, 1, 10) <= '2026-09-30'
      `)
        .one(propSetDoc)

      // Oportunidades de proposta em Setembro (por data_origem)
      const propSetOps = new DynamicModel({ total_ops: 0 })
      app
        .db()
        .newQuery(`
        SELECT COUNT(*) as total_ops
        FROM oportunidades
        WHERE tipo_origem = 'bling_proposta'
          AND substr(data_origem, 1, 10) >= '2026-09-01'
          AND substr(data_origem, 1, 10) <= '2026-09-30'
      `)
        .one(propSetOps)

      // Pedidos Setembro elegíveis (data_pedido em setembro, Em aberto / Atendido / Cancelado)
      const pedSetDoc = new DynamicModel({ total_doc: 0, vinculados: 0, pendentes: 0 })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total_doc,
          SUM(CASE WHEN status_vinculo = 'vinculado' AND cliente_id != '' AND cliente_id IS NOT NULL THEN 1 ELSE 0 END) as vinculados,
          SUM(CASE WHEN status_vinculo != 'vinculado' OR cliente_id = '' OR cliente_id IS NULL THEN 1 ELSE 0 END) as pendentes
        FROM bling_pedidos
        WHERE (situacao_bling_nome = 'Em aberto' OR situacao_bling_nome = 'Atendido' OR situacao_bling_nome = 'Cancelado')
          AND substr(data_pedido, 1, 10) >= '2026-09-01'
          AND substr(data_pedido, 1, 10) <= '2026-09-30'
      `)
        .one(pedSetDoc)

      // Oportunidades de pedido em Setembro (por data_origem)
      const pedSetOps = new DynamicModel({ total_ops: 0 })
      app
        .db()
        .newQuery(`
        SELECT COUNT(*) as total_ops
        FROM oportunidades
        WHERE tipo_origem = 'bling_pedido'
          AND substr(data_origem, 1, 10) >= '2026-09-01'
          AND substr(data_origem, 1, 10) <= '2026-09-30'
      `)
        .one(pedSetOps)

      // 3.3 Dashboard Setembro/2026: Vendas Válidas e Qtd Pedidos Válidos
      const dashSet = new DynamicModel({ valor_vendas: '', qtd_validos: 0, total_pedidos: 0 })
      app
        .db()
        .newQuery(`
        SELECT
          CAST(COALESCE(SUM(valor_total), 0) AS TEXT) as valor_vendas,
          COUNT(*) as qtd_validos
        FROM bling_pedidos
        WHERE (situacao_bling_id = '6' OR situacao_bling_id = '9')
          AND substr(data_pedido, 1, 10) >= '2026-09-01'
          AND substr(data_pedido, 1, 10) <= '2026-09-30'
      `)
        .one(dashSet)

      // 3.4 Contagem por responsável nos pedidos do Bling e nas oportunidades
      const respAudit = new DynamicModel({
        ped_com_resp: 0,
        ped_sem_resp: 0,
        prop_com_resp: 0,
        prop_sem_resp: 0,
        ops_com_resp: 0,
        ops_sem_resp: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          (SELECT COUNT(*) FROM bling_pedidos WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as ped_com_resp,
          (SELECT COUNT(*) FROM bling_pedidos WHERE responsavel_id = '' OR responsavel_id IS NULL) as ped_sem_resp,
          (SELECT COUNT(*) FROM bling_propostas WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as prop_com_resp,
          (SELECT COUNT(*) FROM bling_propostas WHERE responsavel_id = '' OR responsavel_id IS NULL) as prop_sem_resp,
          (SELECT COUNT(*) FROM oportunidades WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as ops_com_resp,
          (SELECT COUNT(*) FROM oportunidades WHERE responsavel_id = '' OR responsavel_id IS NULL) as ops_sem_resp
      `)
        .one(respAudit)

      // Log estruturado no console
      console.log(
        '[AUDITORIA 0066 RESULTADOS] ' +
          JSON.stringify({
            funilTotais,
            reconciliacaoSetembro: {
              propostasDoc: propSetDoc,
              propostasOps: propSetOps,
              pedidosDoc: pedSetDoc,
              pedidosOps: pedSetOps,
            },
            dashboardSetembro: dashSet,
            responsavelAudit: respAudit,
          }),
      )
    } catch (errAudit) {
      console.log('[MIGRATION 0066 ERRO AUDITORIA] ' + String(errAudit.message || errAudit))
    }
  },
  (app) => {
    // Reversão
  },
)
