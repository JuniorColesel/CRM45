/**
 * Migração 0031: Limpeza de estado OAuth Bling
 *
 * Objetivo: Esvaziar registros órfãos da coleção `bling_oauth_states` (states expirados/não concluídos)
 * e garantir que `bling_connections` permaneça vazio para permitir uma nova autorização limpa.
 *
 * RESTRIÇÕES:
 * - NÃO deleta clientes, bling_id, sync logs, ou qualquer outro dado.
 * - NÃO toca em nada relacionado a R2/backup.
 * - Idempotente e segura.
 */
migrate(
  (app) => {
    // 1. Limpar bling_oauth_states
    try {
      if (app.hasTable('bling_oauth_states')) {
        const colStates = app.findCollectionByNameOrId('bling_oauth_states')
        app.truncateCollection(colStates)
      }
    } catch (errStates) {
      // Fallback via SQL caso truncate falhe
      app.db().newQuery('DELETE FROM bling_oauth_states').execute()
    }

    // 2. Garantir bling_connections vazio
    try {
      if (app.hasTable('bling_connections')) {
        const colConn = app.findCollectionByNameOrId('bling_connections')
        app.truncateCollection(colConn)
      }
    } catch (errConn) {
      // Fallback via SQL caso truncate falhe
      app.db().newQuery('DELETE FROM bling_connections').execute()
    }
  },
  (app) => {
    // Reversão de limpeza de registros transitórios/temporários de OAuth é no-op
  },
)
