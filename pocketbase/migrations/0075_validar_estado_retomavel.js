/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0075: Validação controlada da criação e persistência do estado retomável
 * Executa exatamente a lógica do cron automático para criar o registro de teste,
 * valida a leitura de etapa_atual='contatos' e pagina_atual=1,
 * e limpa o registro de validação ao concluir.
 */
migrate(
  (app) => {
    const agoraIso = new Date().toISOString()
    const syncLogCol = app.findCollectionByNameOrId('bling_sync_logs')
    const novoLog = new Record(syncLogCol)

    novoLog.set('iniciado_em', agoraIso)
    novoLog.set('atualizado_em', agoraIso)
    novoLog.set('status', 'processando')
    novoLog.set('etapa_atual', 'contatos')
    novoLog.set('pagina_atual', 1)
    novoLog.set('clientes_lidos', 0)
    novoLog.set('clientes_criados', 0)
    novoLog.set('clientes_atualizados', 0)
    novoLog.set('clientes_ignorados', 0)
    novoLog.set('pedidos_lidos', 0)
    novoLog.set('pedidos_persistidos', 0)
    novoLog.set('pedidos_atualizados', 0)
    novoLog.set('pedidos_duplicados', 0)
    novoLog.set('pedidos_sem_cliente', 0)
    novoLog.set('paginas_pedidos_lidas', 0)
    novoLog.set('propostas_lidas', 0)
    novoLog.set('propostas_persistidas', 0)
    novoLog.set('propostas_atualizadas', 0)
    novoLog.set('propostas_duplicadas', 0)
    novoLog.set('propostas_sem_cliente', 0)
    novoLog.set('paginas_propostas_lidas', 0)
    novoLog.set('erros', [])
    novoLog.set('avisos', [])
    novoLog.set('duracao_ms', 0)
    novoLog.set(
      'mensagem_resumo',
      'Log de teste de validação do estado retomável da sync automática.',
    )
    app.save(novoLog)

    // Leitura e verificação estrita
    const logLido = app.findRecordById('bling_sync_logs', novoLog.id)
    const statusLido = logLido.getString('status')
    const etapaLida = logLido.getString('etapa_atual')
    const paginaLida = logLido.getInt('pagina_atual')
    const atualizadoEmLido = logLido.getString('atualizado_em')

    if (statusLido !== 'processando') {
      throw new Error(`Validação falhou: status esperado 'processando', obteve '${statusLido}'`)
    }
    if (etapaLida !== 'contatos') {
      throw new Error(`Validação falhou: etapa_atual esperada 'contatos', obteve '${etapaLida}'`)
    }
    if (paginaLida !== 1) {
      throw new Error(`Validação falhou: pagina_atual esperada 1, obteve ${paginaLida}`)
    }
    if (!atualizadoEmLido) {
      throw new Error(`Validação falhou: atualizado_em está vazio`)
    }

    console.log(
      `[VALIDACAO-0075-OK] Registro ${novoLog.id} validado com sucesso: status=${statusLido}, etapa_atual=${etapaLida}, pagina_atual=${paginaLida}, atualizado_em=${atualizadoEmLido}`,
    )

    // Limpar o registro de teste para não deixar resíduos em produção
    app.delete(novoLog)
  },
  (app) => {},
)
