migrate(
  (app) => {
    // Definir o último log bem-sucedido com etapa_atual = 'pedidos' e pagina_atual = 1
    // para preparar a Execução 1 do cron automático retomável
    const logCol = app.findCollectionByNameOrId('bling_sync_logs')
    const novoLogEstado = new Record(logCol)
    const agora = new Date().toISOString()
    novoLogEstado.set('status', 'sucesso')
    novoLogEstado.set('etapa_atual', 'pedidos')
    novoLogEstado.set('pagina_atual', 1)
    novoLogEstado.set('iniciado_em', agora)
    novoLogEstado.set('finalizado_em', agora)
    novoLogEstado.set('atualizado_em', agora)
    novoLogEstado.set(
      'mensagem_resumo',
      'Preparação para Tarefa 3A: etapa inicial de pedidos na página 1.',
    )
    app.save(novoLogEstado)
  },
  () => {},
)
