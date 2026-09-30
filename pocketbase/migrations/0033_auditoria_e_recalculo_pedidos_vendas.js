migrate(
  (app) => {
    // 1. Diagnóstico e recálculo idempotente
    // Atualizar nomes das situações do Bling em bling_pedidos:
    // id 6 => "Em aberto", status_normalizado = "em_aberto"
    // id 9 => "Atendido", status_normalizado = "atendido"
    // id 12 => "Cancelado", status_normalizado = "cancelado"
    // id 15 => "Em andamento", status_normalizado = "em_andamento"
    // id 21 => "Em digitação", status_normalizado = "em_digitacao"

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Em aberto',
        status_normalizado = 'em_aberto'
    WHERE situacao_bling_id = '6'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Atendido',
        status_normalizado = 'atendido'
    WHERE situacao_bling_id = '9'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Cancelado',
        status_normalizado = 'cancelado'
    WHERE situacao_bling_id = '12'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Em andamento',
        status_normalizado = 'em_andamento'
    WHERE situacao_bling_id = '15'
  `)
      .execute()

    app
      .db()
      .newQuery(`
    UPDATE bling_pedidos
    SET situacao_bling_nome = 'Em digitação',
        status_normalizado = 'em_digitacao'
    WHERE situacao_bling_id = '21'
  `)
      .execute()

    // 2. Recalcular clientes.valor_total_vendas:
    // Regra do usuário: Vendas válidas = 'Em aberto' (sit 6) ou 'Atendido' (sit 9).
    // Cancelados (sit 12) e demais NÃO entram em vendas.
    // Somente pedidos vinculados (status_vinculo = 'vinculado' e cliente_id IS NOT NULL).

    // Primeiro, zerar valor_total_vendas de todos os clientes
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET valor_total_vendas = 0
  `)
      .execute()

    // Em seguida, aplicar a soma exata dos pedidos válidos
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

    // Atualizar data_primeira_compra e data_ultima_compra a partir de pedidos válidos
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

    // Recalcular status_cliente (ativo se data_ultima_compra nos últimos 6 meses, senão para_reativacao)
    app
      .db()
      .newQuery(`
    UPDATE clientes
    SET 
      status_cliente = CASE 
        WHEN data_ultima_compra IS NOT NULL AND date(data_ultima_compra) >= date('now', '-6 month') THEN 'ativo'
        WHEN data_ultima_compra IS NOT NULL THEN 'para_reativacao'
        ELSE status_cliente
      END,
      status = CASE 
        WHEN data_ultima_compra IS NOT NULL AND date(data_ultima_compra) >= date('now', '-6 month') THEN 'ativo'
        WHEN data_ultima_compra IS NOT NULL THEN 'rascunho'
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
  (app) => {
    // Reversão
  },
)
