migrate(
  (app) => {
    const logs = app.findRecordsByFilter('bling_sync_logs', "status = 'sucesso'", '-created', 10, 0)
    const resultado = []
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i]
      resultado.push({
        id: l.id,
        etapa_atual: l.getString('etapa_atual'),
        pagina_atual: l.getInt('pagina_atual'),
        status: l.getString('status'),
        propostas_lidas: l.getInt('propostas_lidas'),
        propostas_persistidas: l.getInt('propostas_persistidas'),
        propostas_atualizadas: l.getInt('propostas_atualizadas'),
        mensagem_resumo: l.getString('mensagem_resumo'),
        atualizado_em: l.getString('atualizado_em'),
      })
    }
    const countOportunidades = app.countRecords('oportunidades')
    console.log('[EVIDENCIA-MIGRATION] Total de oportunidades no banco:', countOportunidades)
    console.log(
      '[EVIDENCIA-MIGRATION] Ultimos logs de sincronizacao:',
      JSON.stringify(resultado, null, 2),
    )
  },
  (app) => {},
)
