/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0074: Adicionar campos de estado retomável à coleção bling_sync_logs
 *
 * Campos adicionados:
 * - etapa_atual (text): contatos | pedidos | propostas | funil | concluido
 * - pagina_atual (number): página atual de busca na API do Bling
 * - atualizado_em (date): carimbo de data/hora do último progresso
 *
 * Registros históricos mantêm valores vazios/default sem quebrar integridade.
 */
migrate(
  (app) => {
    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      let alterouLog = false

      if (!syncLogCol.fields.getByName('etapa_atual')) {
        syncLogCol.fields.add(new TextField({ name: 'etapa_atual', required: false }))
        alterouLog = true
      }

      if (!syncLogCol.fields.getByName('pagina_atual')) {
        syncLogCol.fields.add(new NumberField({ name: 'pagina_atual', required: false }))
        alterouLog = true
      }

      if (!syncLogCol.fields.getByName('atualizado_em')) {
        syncLogCol.fields.add(new DateField({ name: 'atualizado_em', required: false }))
        alterouLog = true
      }

      if (alterouLog) {
        app.save(syncLogCol)
      }

      // Preenchimento seguro dos registros legados para manter consistência sem corromper histórico
      app
        .db()
        .newQuery(
          `UPDATE bling_sync_logs 
           SET etapa_atual = COALESCE(etapa_atual, ''),
               pagina_atual = COALESCE(pagina_atual, 0),
               atualizado_em = COALESCE(atualizado_em, updated, created)
           WHERE etapa_atual IS NULL OR pagina_atual IS NULL OR atualizado_em IS NULL`,
        )
        .execute()
    } catch (err) {
      console.error('[MIGRATION-0074] Erro ao evoluir bling_sync_logs:', err)
      throw err
    }
  },
  (app) => {
    try {
      const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
      const campos = ['etapa_atual', 'pagina_atual', 'atualizado_em']
      for (let i = 0; i < campos.length; i++) {
        try {
          syncLogCol.fields.removeByName(campos[i])
        } catch (_) {}
      }
      app.save(syncLogCol)
    } catch (_) {}
  },
)
