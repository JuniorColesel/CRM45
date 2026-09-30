migrate(
  (app) => {
    // Migration 0062: Adicionar índices de performance para consultas por período comercial
    // Coleção: oportunidades (data_origem e data_fechamento)
    // Coleção: bling_pedidos (combinações de data_pedido com situação)
    try {
      const colOp = app.findCollectionByNameOrId('oportunidades')
      colOp.addIndex('idx_oportunidades_data_origem', false, 'data_origem DESC', '')
      colOp.addIndex('idx_oportunidades_data_fechamento', false, 'data_fechamento DESC', '')
      app.save(colOp)
    } catch (errOp) {
      console.log('Aviso ao adicionar índices em oportunidades: ' + errOp)
    }

    try {
      const colPed = app.findCollectionByNameOrId('bling_pedidos')
      colPed.addIndex(
        'idx_bling_pedidos_data_sit',
        false,
        'data_pedido DESC, situacao_bling_id',
        '',
      )
      app.save(colPed)
    } catch (errPed) {
      console.log('Aviso ao adicionar índices em bling_pedidos: ' + errPed)
    }

    try {
      const colProp = app.findCollectionByNameOrId('bling_propostas')
      colProp.addIndex(
        'idx_bling_propostas_data_norm',
        false,
        'data_proposta DESC, status_normalizado',
        '',
      )
      app.save(colProp)
    } catch (errProp) {
      console.log('Aviso ao adicionar índices em bling_propostas: ' + errProp)
    }
  },
  (app) => {
    try {
      const colOp = app.findCollectionByNameOrId('oportunidades')
      colOp.removeIndex('idx_oportunidades_data_origem')
      colOp.removeIndex('idx_oportunidades_data_fechamento')
      app.save(colOp)
    } catch (_) {}

    try {
      const colPed = app.findCollectionByNameOrId('bling_pedidos')
      colPed.removeIndex('idx_bling_pedidos_data_sit')
      app.save(colPed)
    } catch (_) {}

    try {
      const colProp = app.findCollectionByNameOrId('bling_propostas')
      colProp.removeIndex('idx_bling_propostas_data_norm')
      app.save(colProp)
    } catch (_) {}
  },
)
