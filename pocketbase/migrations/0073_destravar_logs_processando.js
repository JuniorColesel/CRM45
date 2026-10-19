/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Limpar logs em estado "processando" órfãos de tentativas anteriores que sofreram timeout/rate limit
    try {
      const records = app.findRecordsByFilter(
        'bling_sync_logs',
        "status = 'processando'",
        '-created',
        100,
        0,
      )
      for (let i = 0; i < records.length; i++) {
        const r = records[i]
        r.set('status', 'erro')
        r.set(
          'mensagem_resumo',
          'Sincronização interrompida (destravada pelo sistema após rate limit 429).',
        )
        r.set('finalizado_em', new Date().toISOString())
        app.save(r)
      }
    } catch (_) {}
  },
  (app) => {},
)
