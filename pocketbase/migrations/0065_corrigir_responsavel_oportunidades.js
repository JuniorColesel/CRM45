/**
 * Migração 0065: Correção Retroativa de Responsável nas Oportunidades Bling
 *
 * Propaga o responsavel_id de bling_pedidos e bling_propostas para a coleção 'oportunidades'
 * usando exclusivamente chave externa (bling_pedido_id e bling_proposta_id).
 *
 * Também executa auditoria e contagens oficiais para comprovação no banco de dados.
 */

migrate(
  (app) => {
    // 1. Atualizar oportunidades a partir de bling_pedidos (por bling_pedido_id)
    const sqlUpdatePedidos = `
      UPDATE oportunidades
      SET responsavel_id = (
        SELECT bp.responsavel_id
        FROM bling_pedidos bp
        WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
      )
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IS NOT NULL
        AND bling_pedido_id != ''
        AND EXISTS (
          SELECT 1 FROM bling_pedidos bp
          WHERE bp.bling_pedido_id = oportunidades.bling_pedido_id
            AND bp.responsavel_id IS NOT NULL
            AND bp.responsavel_id != ''
        )
    `
    const resPed = app.db().newQuery(sqlUpdatePedidos).execute()
    const pedAfetados = resPed && resPed.rowsAffected ? resPed.rowsAffected() : 0

    // 2. Atualizar oportunidades a partir de bling_propostas (por bling_proposta_id)
    const sqlUpdatePropostas = `
      UPDATE oportunidades
      SET responsavel_id = (
        SELECT bp.responsavel_id
        FROM bling_propostas bp
        WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
      )
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IS NOT NULL
        AND bling_proposta_id != ''
        AND EXISTS (
          SELECT 1 FROM bling_propostas bp
          WHERE bp.bling_proposta_id = oportunidades.bling_proposta_id
            AND bp.responsavel_id IS NOT NULL
            AND bp.responsavel_id != ''
        )
    `
    const resProp = app.db().newQuery(sqlUpdatePropostas).execute()
    const propAfetados = resProp && resProp.rowsAffected ? resProp.rowsAffected() : 0

    console.log(
      '[MIGRATION 0065] Responsáveis atualizados nas oportunidades: ' +
        pedAfetados +
        ' pedidos, ' +
        propAfetados +
        ' propostas.',
    )

    // 3. Auditoria e Contagens Oficiais
    try {
      // Contagem 2026 Funil Todo por status/etapa
      const rowFunilTodo = new DynamicModel({
        total: 0,
        proposta: 0,
        negociacao: 0,
        fechado: 0,
        ganho: 0,
        perdido: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN e.nome = 'Proposta' THEN 1 ELSE 0 END) as proposta,
          SUM(CASE WHEN e.nome = 'Negociação' THEN 1 ELSE 0 END) as negociacao,
          SUM(CASE WHEN e.nome = 'Fechado' THEN 1 ELSE 0 END) as fechado,
          SUM(CASE WHEN o.status = 'ganho' THEN 1 ELSE 0 END) as ganho,
          SUM(CASE WHEN o.status = 'perdido' THEN 1 ELSE 0 END) as perdido
        FROM oportunidades o
        LEFT JOIN etapas_funil e ON e.id = o.etapa_id
        WHERE substr(CASE WHEN o.data_origem != '' THEN o.data_origem ELSE o.created END, 1, 4) = '2026'
      `)
        .one(rowFunilTodo)

      // Setembro 2026 por Origem
      const rowSetOrigem = new DynamicModel({
        total: 0,
        proposta: 0,
        negociacao: 0,
        fechado: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN e.nome = 'Proposta' THEN 1 ELSE 0 END) as proposta,
          SUM(CASE WHEN e.nome = 'Negociação' THEN 1 ELSE 0 END) as negociacao,
          SUM(CASE WHEN e.nome = 'Fechado' THEN 1 ELSE 0 END) as fechado
        FROM oportunidades o
        LEFT JOIN etapas_funil e ON e.id = o.etapa_id
        WHERE (
          (o.data_origem != '' AND substr(o.data_origem, 1, 10) >= '2026-09-01' AND substr(o.data_origem, 1, 10) <= '2026-09-30')
          OR ((o.data_origem = '' OR o.data_origem IS NULL) AND substr(o.created, 1, 10) >= '2026-09-01' AND substr(o.created, 1, 10) <= '2026-09-30')
        )
      `)
        .one(rowSetOrigem)

      // Outubro 2026 por Origem
      const rowOutOrigem = new DynamicModel({
        total: 0,
        proposta: 0,
        negociacao: 0,
        fechado: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN e.nome = 'Proposta' THEN 1 ELSE 0 END) as proposta,
          SUM(CASE WHEN e.nome = 'Negociação' THEN 1 ELSE 0 END) as negociacao,
          SUM(CASE WHEN e.nome = 'Fechado' THEN 1 ELSE 0 END) as fechado
        FROM oportunidades o
        LEFT JOIN etapas_funil e ON e.id = o.etapa_id
        WHERE (
          (o.data_origem != '' AND substr(o.data_origem, 1, 10) >= '2026-10-01' AND substr(o.data_origem, 1, 10) <= '2026-10-31')
          OR ((o.data_origem = '' OR o.data_origem IS NULL) AND substr(o.created, 1, 10) >= '2026-10-01' AND substr(o.created, 1, 10) <= '2026-10-31')
        )
      `)
        .one(rowOutOrigem)

      // Setembro 2026 por Fechamento (ganhos e perdidos)
      const rowSetFechamento = new DynamicModel({
        ganhos: 0,
        perdidos: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          SUM(CASE WHEN o.status = 'ganho' THEN 1 ELSE 0 END) as ganhos,
          SUM(CASE WHEN o.status = 'perdido' THEN 1 ELSE 0 END) as perdidos
        FROM oportunidades o
        WHERE o.status != 'aberto'
          AND o.data_fechamento != ''
          AND substr(o.data_fechamento, 1, 10) >= '2026-09-01'
          AND substr(o.data_fechamento, 1, 10) <= '2026-09-30'
      `)
        .one(rowSetFechamento)

      // Outubro 2026 por Fechamento (ganhos e perdidos)
      const rowOutFechamento = new DynamicModel({
        ganhos: 0,
        perdidos: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          SUM(CASE WHEN o.status = 'ganho' THEN 1 ELSE 0 END) as ganhos,
          SUM(CASE WHEN o.status = 'perdido' THEN 1 ELSE 0 END) as perdidos
        FROM oportunidades o
        WHERE o.status != 'aberto'
          AND o.data_fechamento != ''
          AND substr(o.data_fechamento, 1, 10) >= '2026-10-01'
          AND substr(o.data_fechamento, 1, 10) <= '2026-10-31'
      `)
        .one(rowOutFechamento)

      // Auditoria de responsáveis nas oportunidades
      const rowRespOps = new DynamicModel({
        total_ops: 0,
        com_resp: 0,
        sem_resp: 0,
        total_ped: 0,
        ped_com_resp: 0,
        ped_sem_resp: 0,
      })
      app
        .db()
        .newQuery(`
        SELECT
          COUNT(*) as total_ops,
          SUM(CASE WHEN responsavel_id != '' AND responsavel_id IS NOT NULL THEN 1 ELSE 0 END) as com_resp,
          SUM(CASE WHEN responsavel_id = '' OR responsavel_id IS NULL THEN 1 ELSE 0 END) as sem_resp,
          SUM(CASE WHEN tipo_origem = 'bling_pedido' THEN 1 ELSE 0 END) as total_ped,
          SUM(CASE WHEN tipo_origem = 'bling_pedido' AND responsavel_id != '' AND responsavel_id IS NOT NULL THEN 1 ELSE 0 END) as ped_com_resp,
          SUM(CASE WHEN tipo_origem = 'bling_pedido' AND (responsavel_id = '' OR responsavel_id IS NULL) THEN 1 ELSE 0 END) as ped_sem_resp
        FROM oportunidades
      `)
        .one(rowRespOps)

      console.log(
        '[AUDITORIA 0065 BANCO REAL] FUNIL 2026: ' +
          JSON.stringify(rowFunilTodo) +
          ' | SET ORIGEM: ' +
          JSON.stringify(rowSetOrigem) +
          ' | OUT ORIGEM: ' +
          JSON.stringify(rowOutOrigem) +
          ' | SET FECH: ' +
          JSON.stringify(rowSetFechamento) +
          ' | OUT FECH: ' +
          JSON.stringify(rowOutFechamento) +
          ' | RESP OPORTUNIDADES: ' +
          JSON.stringify(rowRespOps),
      )
    } catch (errAudit) {
      console.log('[MIGRATION 0065] Erro na contagem de auditoria: ' + errAudit)
    }
  },
  (app) => {
    // Reversão
  },
)
