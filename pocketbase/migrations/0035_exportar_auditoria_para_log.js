migrate(
  (app) => {
    // Atualizar a mensagem de resumo do log mais recente usando UPDATE com SQL
    // Primeiro gerar resumo formatado
    app
      .db()
      .newQuery(`
    UPDATE bling_sync_logs
    SET mensagem_resumo = (
      SELECT 'AUDIT|Total=' || sum(valor_total) || '|Qtd=' || sum(pedidos_qtd)
      FROM bling_auditoria_vendas
      WHERE chave = 'total_geral'
    )
    WHERE id = (SELECT id FROM bling_sync_logs ORDER BY created DESC LIMIT 1)
  `)
      .execute()
  },
  (app) => {},
)
