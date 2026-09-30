migrate(
  (app) => {
    // 0051: Auditoria Idempotente de bling_propostas e restauração do mensagem_resumo do log 168wiasaf5wfg9i
    const limitBatch = 5000
    let offset = 0
    let temMais = true

    let total = 0
    const mapaIds = {}
    let duplicados = 0
    let comSituacaoId = 0
    let visivelTrue = 0
    let visivelFalse = 0

    const distSituacoes = {}
    const distStatusNormalizado = {}
    const distVendedor = {}
    const pendentesDet = []
    const amostras = {}

    while (temMais) {
      const lote = app.findRecordsByFilter('bling_propostas', '', 'id', limitBatch, offset)
      if (!lote || lote.length === 0) {
        break
      }

      for (let i = 0; i < lote.length; i++) {
        const rec = lote[i]
        total++

        const pId = rec.getString('bling_proposta_id')
        if (mapaIds[pId]) {
          duplicados++
        } else {
          mapaIds[pId] = true
        }

        const sitId = rec.getString('situacao_bling_id')
        if (sitId) comSituacaoId++

        const visivel = rec.getBool('visivel_funil')
        if (visivel) visivelTrue++
        else visivelFalse++

        const sitNome = rec.getString('situacao_bling_nome') || '(vazio)'
        const stNorm = rec.getString('status_normalizado') || '(vazio)'
        const vBling = rec.getString('vendedor_bling') || '(vazio)'
        const vCrm = rec.getString('vendedor_crm') || '(vazio)'
        const respId = rec.getString('responsavel_id') || '(vazio)'
        const stVinc = rec.getString('status_vinculo')

        // Chave dist_situacoes: situacao_bling_id|situacao_bling_nome|status_normalizado|visivel_funil
        const chaveSit =
          (sitId || '') + '|' + sitNome + '|' + stNorm + '|' + (visivel ? 'true' : 'false')
        distSituacoes[chaveSit] = (distSituacoes[chaveSit] || 0) + 1

        // Chave dist_status_normalizado
        distStatusNormalizado[stNorm] = (distStatusNormalizado[stNorm] || 0) + 1

        // Chave dist_vendedor: vendedor_bling|vendedor_crm|responsavel_id
        const chaveVend = vBling + '|' + vCrm + '|' + respId
        distVendedor[chaveVend] = (distVendedor[chaveVend] || 0) + 1

        // Amostras: até 3 registros de cada situacao_bling_nome distinta
        if (!amostras[sitNome]) {
          amostras[sitNome] = []
        }
        if (amostras[sitNome].length < 3) {
          amostras[sitNome].push({
            bling_proposta_id: pId,
            numero: rec.getString('numero'),
            bling_contato_id: rec.getString('bling_contato_id'),
            contato_nome: rec.getString('contato_nome'),
            documento: rec.getString('documento'),
            situacao_bling_nome: sitNome,
            status_normalizado: stNorm,
            valor_total: rec.getFloat('valor_total'),
            cliente_id: rec.getString('cliente_id'),
            data_proposta: rec.getString('data_proposta'),
          })
        }

        // Pendentes: status_vinculo='pendente' (ou sem cliente)
        if (stVinc === 'pendente') {
          pendentesDet.push({
            bling_proposta_id: pId,
            numero: rec.getString('numero'),
            bling_contato_id: rec.getString('bling_contato_id'),
            contato_nome: rec.getString('contato_nome'),
            documento: rec.getString('documento'),
            situacao_bling_nome: sitNome,
            status_normalizado: stNorm,
            valor_total: rec.getFloat('valor_total'),
            cliente_id: rec.getString('cliente_id'),
          })
        }
      }

      if (lote.length < limitBatch) {
        temMais = false
      } else {
        offset += lote.length
      }
    }

    const auditObjeto = {
      totais: {
        total: total,
        total_distintos: Object.keys(mapaIds).length,
        duplicados: duplicados,
        com_situacao_id: comSituacaoId,
        visivel_funil_true: visivelTrue,
        visivel_funil_false: visivelFalse,
      },
      dist_situacoes: distSituacoes,
      dist_status_normalizado: distStatusNormalizado,
      dist_vendedor: distVendedor,
      pendentes_det: pendentesDet,
      amostras: amostras,
    }

    // Persistir o objeto no campo erros_propostas do log mais recente
    // e restaurar mensagem_resumo do log 168wiasaf5wfg9i
    try {
      const logs = app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
      if (logs && logs.length > 0) {
        const logRecente = logs[0]
        logRecente.set('erros_propostas', auditObjeto)
        app.save(logRecente)
      }
    } catch (eLog) {
      console.log('Erro ao salvar audit em erros_propostas: ' + eLog)
    }

    // Restauração pontual do log 168wiasaf5wfg9i
    try {
      const logDanificado = app.findFirstRecordByData('bling_sync_logs', 'id', '168wiasaf5wfg9i')
      if (logDanificado) {
        logDanificado.set(
          'mensagem_resumo',
          'Concluído em 66s: 1432 contatos lidos (0 novos, 3 atualizados), 10815 pedidos lidos (0 persistidos, 10815 atualizados, 3 pendentes vínculo), 2910 propostas lidas (0 persistidas, 2910 atualizadas, 10 pendentes vínculo). Avisos: 2348.',
        )
        app.save(logDanificado)
      }
    } catch (eDano) {
      console.log('Erro ao restaurar mensagem_resumo do log 168wiasaf5wfg9i: ' + eDano)
    }
  },
  (app) => {},
)
