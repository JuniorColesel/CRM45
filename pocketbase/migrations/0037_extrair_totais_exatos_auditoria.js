migrate(
  (app) => {
    // Criar endpoint de consulta de auditoria financeira no backend
    // Como endpoint pb_hooks ou tabela
    // Vamos atualizar o último log de sync para conter todos os dados detalhados
    const stat2026 = []

    // Total geral
    app
      .db()
      .newQuery(`
    UPDATE bling_sync_logs
    SET mensagem_resumo = (
      SELECT 
        'HIST_TOT:' || count(*) || 
        '|HIST_VAL:' || round(sum(valor_total), 2) ||
        '|HIST_VAL_OK:' || round(sum(case when situacao_bling_id in ('6', '9') then valor_total else 0 end), 2) ||
        '|P2026_TOT:' || sum(case when substr(data_pedido, 1, 4) = '2026' then 1 else 0 end) ||
        '|V2026_TOT:' || round(sum(case when substr(data_pedido, 1, 4) = '2026' then valor_total else 0 end), 2) ||
        '|P2026_OK:' || sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id in ('6', '9') then 1 else 0 end) ||
        '|V2026_OK:' || round(sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id in ('6', '9') then valor_total else 0 end), 2) ||
        '|V2026_AB:' || round(sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '6' then valor_total else 0 end), 2) ||
        '|P2026_AB:' || sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '6' then 1 else 0 end) ||
        '|V2026_AT:' || round(sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '9' then valor_total else 0 end), 2) ||
        '|P2026_AT:' || sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '9' then 1 else 0 end) ||
        '|V2026_CA:' || round(sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '12' then valor_total else 0 end), 2) ||
        '|P2026_CA:' || sum(case when substr(data_pedido, 1, 4) = '2026' and situacao_bling_id = '12' then 1 else 0 end) ||
        '|P2025_TOT:' || sum(case when substr(data_pedido, 1, 4) = '2025' then 1 else 0 end) ||
        '|V2025_TOT:' || round(sum(case when substr(data_pedido, 1, 4) = '2025' then valor_total else 0 end), 2) ||
        '|P_ANT_TOT:' || sum(case when substr(data_pedido, 1, 4) < '2025' then 1 else 0 end) ||
        '|V_ANT_TOT:' || round(sum(case when substr(data_pedido, 1, 4) < '2025' then valor_total else 0 end), 2)
      FROM bling_pedidos
    )
    WHERE id = (SELECT id FROM bling_sync_logs ORDER BY created DESC LIMIT 1)
  `)
      .execute()
  },
  (app) => {},
)
