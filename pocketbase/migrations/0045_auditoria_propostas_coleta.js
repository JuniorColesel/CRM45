migrate(
  (app) => {
    // Coletar dados usando app.findRecordsByFilter
    const limitBatch = 1000
    let offset = 0
    let temMais = true

    let totalPropostas = 0
    const mapaIds = {}
    let duplicados = 0

    let visivelTrue = 0
    let visivelFalse = 0

    let vinculados = 0
    let pendentes = 0
    let semCliente = 0

    let comSitId = 0
    let comContatoNome = 0
    let comDocumento = 0
    let comVendedorBling = 0

    const distSituacoes = {}
    const distStatus = {}
    const distVendedor = {}
    const amostrasPorSituacao = {
      Rascunho: [],
      Aguardando: [],
      'Não aprovado': [],
      Concluído: [],
      outro: [],
    }
    const pendentesDet = []

    while (temMais) {
      const lote = app.findRecordsByFilter('bling_propostas', '', 'id', limitBatch, offset)
      if (!lote || lote.length === 0) {
        break
      }

      for (let i = 0; i < lote.length; i++) {
        const rec = lote[i]
        totalPropostas++

        const pId = rec.getString('bling_proposta_id')
        if (mapaIds[pId]) {
          duplicados++
        } else {
          mapaIds[pId] = true
        }

        const visivel = rec.getBool('visivel_funil')
        if (visivel) visivelTrue++
        else visivelFalse++

        const stVinc = rec.getString('status_vinculo')
        if (stVinc === 'vinculado') vinculados++
        else if (stVinc === 'pendente') pendentes++
        else if (stVinc === 'sem_cliente') semCliente++

        const sitId = rec.getString('situacao_bling_id')
        const sitNome = rec.getString('situacao_bling_nome')
        const stNorm = rec.getString('status_normalizado')
        const cNome = rec.getString('contato_nome')
        const doc = rec.getString('documento')
        const vBling = rec.getString('vendedor_bling')
        const vCrm = rec.getString('vendedor_crm')
        const respId = rec.getString('responsavel_id')

        if (sitId) comSitId++
        if (cNome) comContatoNome++
        if (doc) comDocumento++
        if (vBling) comVendedorBling++

        // Chave da situacao
        const chaveSit =
          (sitId || '(vazio)') +
          '||' +
          (sitNome || '(vazio)') +
          '||' +
          stNorm +
          '||' +
          (visivel ? 'true' : 'false')
        distSituacoes[chaveSit] = (distSituacoes[chaveSit] || 0) + 1

        // Chave status normalizado
        distStatus[stNorm] = (distStatus[stNorm] || 0) + 1

        // Chave vendedor
        const chaveVend =
          (vBling || '(vazio)') + '||' + (vCrm || '(vazio)') + '||' + (respId || '(vazio)')
        distVendedor[chaveVend] = (distVendedor[chaveVend] || 0) + 1

        // Amostras (até 3 de cada)
        if (amostrasPorSituacao[sitNome] && amostrasPorSituacao[sitNome].length < 3) {
          amostrasPorSituacao[sitNome].push({
            bling_proposta_id: pId,
            numero: rec.getString('numero'),
            data_proposta: rec.getString('data_proposta'),
            valor_total: rec.getFloat('valor_total'),
            situacao_bling_id: sitId,
            situacao_bling_nome: sitNome,
            status_normalizado: stNorm,
            visivel_funil: visivel,
            vendedor_bling: vBling,
            vendedor_crm: vCrm,
            responsavel_id: respId,
            status_vinculo: stVinc,
            cliente_id: rec.getString('cliente_id'),
          })
        }

        if (stNorm === 'outro' && amostrasPorSituacao['outro'].length < 3) {
          amostrasPorSituacao['outro'].push({
            bling_proposta_id: pId,
            numero: rec.getString('numero'),
            data_proposta: rec.getString('data_proposta'),
            valor_total: rec.getFloat('valor_total'),
            situacao_bling_nome: sitNome,
            status_normalizado: stNorm,
            visivel_funil: visivel,
          })
        }

        // Pendentes
        if (stVinc === 'pendente' || !rec.getString('cliente_id')) {
          pendentesDet.push({
            bling_proposta_id: pId,
            numero: rec.getString('numero'),
            bling_contato_id: rec.getString('bling_contato_id'),
            contato_nome: cNome,
            documento: doc,
            valor_total: rec.getFloat('valor_total'),
            situacao_bling_nome: sitNome,
            status_normalizado: stNorm,
            visivel_funil: visivel,
          })
        }
      }

      if (lote.length < limitBatch) {
        temMais = false
      } else {
        offset += lote.length
      }
    }

    // Verificar se os contatos pendentes existem em clientes
    const contatosChecagem = []
    for (let p = 0; p < pendentesDet.length; p++) {
      const cId = pendentesDet[p].bling_contato_id
      let cliEncontrado = null
      try {
        const cliLote = app.findRecordsByFilter('clientes', 'bling_id = "' + cId + '"', '', 1, 0)
        if (cliLote && cliLote.length > 0) {
          cliEncontrado = {
            id: cliLote[0].id,
            nome_empresa: cliLote[0].getString('nome_empresa'),
          }
        }
      } catch (_) {}

      contatosChecagem.push({
        proposta_id: pendentesDet[p].bling_proposta_id,
        numero: pendentesDet[p].numero,
        bling_contato_id: cId,
        cliente_encontrado_por_bling_id: cliEncontrado ? cliEncontrado.id : null,
        cliente_nome: cliEncontrado ? cliEncontrado.nome_empresa : null,
      })
    }

    // 9. Análise dos avisos do log mais recente
    let categorizacaoAvisos = {
      total_avisos_array: 0,
      unicidade_nome_empresa: 0,
      situacao_proposta_nao_mapeada: 0,
      outros_avisos: 0,
      amostras_outros: [],
    }
    let logStatusNaoMapeados = 0

    try {
      const logsRecentes = app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
      if (logsRecentes && logsRecentes.length > 0) {
        const lRec = logsRecentes[0]
        logStatusNaoMapeados = lRec.getInt('status_nao_mapeados')
        const rawAvisos = lRec.get('avisos')
        let arrAvisos = []
        if (Array.isArray(rawAvisos)) {
          arrAvisos = rawAvisos
        } else if (typeof rawAvisos === 'string') {
          try {
            arrAvisos = JSON.parse(rawAvisos)
          } catch (_) {}
        }

        categorizacaoAvisos.total_avisos_array = arrAvisos.length
        for (let a = 0; a < arrAvisos.length; a++) {
          const itemAv = String(arrAvisos[a])
          if (
            itemAv.indexOf('unicidade de nome_empresa') !== -1 ||
            itemAv.indexOf('Value must be unique') !== -1
          ) {
            categorizacaoAvisos.unicidade_nome_empresa++
          } else if (itemAv.indexOf('Situação de proposta não mapeada') !== -1) {
            categorizacaoAvisos.situacao_proposta_nao_mapeada++
          } else {
            categorizacaoAvisos.outros_avisos++
            if (categorizacaoAvisos.amostras_outros.length < 5) {
              categorizacaoAvisos.amostras_outros.push(itemAv)
            }
          }
        }
      }
    } catch (_) {}

    const resultadoAuditoria = {
      totais: {
        total: totalPropostas,
        total_distintos: Object.keys(mapaIds).length,
        duplicados: duplicados,
        visivel_true: visivelTrue,
        visivel_false: visivelFalse,
        vinculados: vinculados,
        pendentes: pendentes,
        sem_cliente: semCliente,
        com_sit_id: comSitId,
        com_contato_nome: comContatoNome,
        com_documento: comDocumento,
        com_vendedor_bling: comVendedorBling,
      },
      dist_situacoes: distSituacoes,
      dist_status: distStatus,
      dist_vendedor: distVendedor,
      pendentes_det: pendentesDet,
      pendentes_checagem_contatos: contatosChecagem,
      amostras: amostrasPorSituacao,
      categorizacao_avisos: categorizacaoAvisos,
      log_status_nao_mapeados: logStatusNaoMapeados,
    }

    // Gravar no backup_logs com tipo 'manual' para lermos
    try {
      const colBack = app.findCollectionByNameOrId('backup_logs')
      const recAudit = new Record(colBack)
      recAudit.set('tipo', 'manual')
      recAudit.set('resultado', 'sucesso')
      recAudit.set('detalhes', JSON.stringify(resultadoAuditoria))
      recAudit.set('duracao_ms', 0)
      app.save(recAudit)
    } catch (errBkp) {
      console.log('Erro ao salvar audit em backup_logs: ' + errBkp)
    }
  },
  (app) => {},
)
