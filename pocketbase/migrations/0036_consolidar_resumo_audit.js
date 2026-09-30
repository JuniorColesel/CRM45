migrate(
  (app) => {
    // Ler registros de auditoria e salvar em log_mensagem_resumo de forma compacta
    // Usar uma única query SQL para concatenar os resultados
    app
      .db()
      .newQuery(`
    UPDATE bling_sync_logs
    SET mensagem_resumo = (
      SELECT group_concat(ano || ':' || situacao_id || ':' || situacao_nome || '=' || pedidos_qtd || 'p/R$' || valor_total, ' | ')
      FROM bling_auditoria_vendas
      WHERE chave = 'por_ano_situacao'
    )
    WHERE id = (SELECT id FROM bling_sync_logs ORDER BY created DESC LIMIT 1)
  `)
      .execute()
  },
  (app) => {},
)
