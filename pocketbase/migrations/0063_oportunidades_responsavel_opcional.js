/**
 * Migração 0063: Ajuste de obrigatoriedade do campo responsavel_id na coleção 'oportunidades'
 *
 * Oportunidades sincronizadas do Bling podem não ter vendedor associado no Bling ERP.
 * Tornar responsavel_id opcional (required: false) para permitir persistência de oportunidades
 * sem vendedor no Bling, mantendo integridade com as regras de negócio do CRM Colesel 45.
 */

migrate(
  (app) => {
    const opCol = app.findCollectionByNameOrId('oportunidades')
    const respField = opCol.fields.getByName('responsavel_id')
    if (respField) {
      respField.required = false
      app.save(opCol)
    }
  },
  (app) => {
    try {
      const opCol = app.findCollectionByNameOrId('oportunidades')
      const respField = opCol.fields.getByName('responsavel_id')
      if (respField) {
        respField.required = true
        app.save(opCol)
      }
    } catch (_) {}
  },
)
