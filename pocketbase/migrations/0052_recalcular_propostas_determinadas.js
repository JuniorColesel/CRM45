migrate(
  (app) => {
    // 0052: Recalcular status_normalizado e visivel_funil em bling_propostas
    // aplicando o novo de-para determinístico sem tocar em situacao_bling_id/situacao_bling_nome
    // nem tocar em bling_pedidos!

    function normalizarTextoSemAcentos(str) {
      if (!str) return ''
      return String(str)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    }

    const MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO = {
      rascunho: { status: 'rascunho', visivel: true },
      aguardando: { status: 'aguardando', visivel: true },
      pendente: { status: 'aguardando', visivel: true },
      'nao aprovado': { status: 'nao_aprovada', visivel: true },
      'nao aprovada': { status: 'nao_aprovada', visivel: true },
      aprovado: { status: 'convertida', visivel: false },
      aprovada: { status: 'convertida', visivel: false },
      concluido: { status: 'outro', visivel: false },
      concluida: { status: 'outro', visivel: false },
    }

    const limitBatch = 5000
    let offset = 0
    let temMais = true

    while (temMais) {
      const lote = app.findRecordsByFilter('bling_propostas', '', 'id', limitBatch, offset)
      if (!lote || lote.length === 0) {
        break
      }

      for (let i = 0; i < lote.length; i++) {
        const rec = lote[i]
        const sitNome = rec.getString('situacao_bling_nome') || ''
        const chave = normalizarTextoSemAcentos(sitNome)

        let statusFinal = 'outro'
        let visivelFinal = false

        if (MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO[chave]) {
          statusFinal = MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO[chave].status
          visivelFinal = MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO[chave].visivel
        }

        let alterou = false
        if (rec.getString('status_normalizado') !== statusFinal) {
          rec.set('status_normalizado', statusFinal)
          alterou = true
        }
        if (rec.getBool('visivel_funil') !== visivelFinal) {
          rec.set('visivel_funil', visivelFinal)
          alterou = true
        }

        // Se contato_nome ou documento estiverem vazios e houver cliente vinculado, preencher retroativamente
        const cliId = rec.getString('cliente_id')
        if (cliId && (!rec.getString('contato_nome') || !rec.getString('documento'))) {
          try {
            const cli = app.findFirstRecordByData('clientes', 'id', cliId)
            if (cli) {
              if (!rec.getString('contato_nome')) {
                const cNome = cli.getString('nome_contato') || cli.getString('nome_empresa')
                if (cNome) {
                  rec.set('contato_nome', cNome)
                  alterou = true
                }
              }
              if (!rec.getString('documento')) {
                const doc = cli.getString('cnpj_cpf')
                if (doc) {
                  rec.set('documento', doc)
                  alterou = true
                }
              }
            }
          } catch (_) {}
        }

        if (alterou) {
          app.save(rec)
        }
      }

      if (lote.length < limitBatch) {
        temMais = false
      } else {
        offset += lote.length
      }
    }
  },
  (app) => {},
)
