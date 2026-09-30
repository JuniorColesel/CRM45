migrate(
  (app) => {
    // 1. Limpeza da tabela temporária de auditoria
    if (app.hasTable('bling_auditoria_vendas')) {
      try {
        const col = app.findCollectionByNameOrId('bling_auditoria_vendas')
        app.delete(col)
      } catch (_) {}
    }

    // 2. Normalizar data_pedido e data_atendimento em bling_pedidos
    // Remove qualquer cauda de hora ou timestamp para formato ISO de data pura YYYY-MM-DD
    app
      .db()
      .newQuery(`
      UPDATE bling_pedidos
      SET data_pedido = substr(data_pedido, 1, 10)
      WHERE data_pedido IS NOT NULL AND data_pedido != '' AND length(data_pedido) > 10
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE bling_pedidos
      SET data_atendimento = substr(data_atendimento, 1, 10)
      WHERE data_atendimento IS NOT NULL AND data_atendimento != '' AND length(data_atendimento) > 10
    `)
      .execute()

    // 3. Normalizar data_primeira_compra e data_ultima_compra em clientes
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET data_primeira_compra = substr(data_primeira_compra, 1, 10)
      WHERE data_primeira_compra IS NOT NULL AND data_primeira_compra != '' AND length(data_primeira_compra) > 10
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET data_ultima_compra = substr(data_ultima_compra, 1, 10)
      WHERE data_ultima_compra IS NOT NULL AND data_ultima_compra != '' AND length(data_ultima_compra) > 10
    `)
      .execute()

    // 4. Garantir recálculo 100% idempotente de clientes.valor_total_vendas
    // estritamente a partir de bling_pedidos válidos (situação 6=Em aberto, 9=Atendido), vinculados
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET valor_total_vendas = 0
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET valor_total_vendas = (
        SELECT COALESCE(ROUND(SUM(bp.valor_total), 2), 0)
        FROM bling_pedidos bp
        WHERE bp.cliente_id = clientes.id
          AND bp.status_vinculo = 'vinculado'
          AND bp.situacao_bling_id IN ('6', '9')
      )
      WHERE id IN (
        SELECT DISTINCT cliente_id 
        FROM bling_pedidos 
        WHERE cliente_id IS NOT NULL AND cliente_id != ''
      )
    `)
      .execute()

    // 5. Garantir datas extremas comerciais YYYY-MM-DD no cliente
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET 
        data_primeira_compra = (
          SELECT MIN(bp.data_pedido)
          FROM bling_pedidos bp
          WHERE bp.cliente_id = clientes.id
            AND bp.status_vinculo = 'vinculado'
            AND bp.situacao_bling_id IN ('6', '9')
            AND bp.data_pedido IS NOT NULL AND bp.data_pedido != ''
        ),
        data_ultima_compra = (
          SELECT MAX(bp.data_pedido)
          FROM bling_pedidos bp
          WHERE bp.cliente_id = clientes.id
            AND bp.status_vinculo = 'vinculado'
            AND bp.situacao_bling_id IN ('6', '9')
            AND bp.data_pedido IS NOT NULL AND bp.data_pedido != ''
        )
      WHERE id IN (
        SELECT DISTINCT cliente_id 
        FROM bling_pedidos 
        WHERE cliente_id IS NOT NULL AND cliente_id != ''
          AND situacao_bling_id IN ('6', '9')
      )
    `)
      .execute()

    // 6. Recalcular status_cliente com base na data_ultima_compra (ativo se últimos 6 meses a partir de agora)
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET 
        status_cliente = CASE 
          WHEN data_ultima_compra IS NOT NULL AND data_ultima_compra != '' AND date(data_ultima_compra) >= date('now', '-6 month') THEN 'ativo'
          WHEN data_ultima_compra IS NOT NULL AND data_ultima_compra != '' THEN 'para_reativacao'
          ELSE status_cliente
        END,
        status = CASE 
          WHEN data_ultima_compra IS NOT NULL AND data_ultima_compra != '' AND date(data_ultima_compra) >= date('now', '-6 month') THEN 'ativo'
          WHEN data_ultima_compra IS NOT NULL AND data_ultima_compra != '' THEN 'rascunho'
          ELSE status
        END
      WHERE id IN (
        SELECT DISTINCT cliente_id 
        FROM bling_pedidos 
        WHERE cliente_id IS NOT NULL AND cliente_id != ''
          AND situacao_bling_id IN ('6', '9')
      )
    `)
      .execute()
  },
  (app) => {},
)
