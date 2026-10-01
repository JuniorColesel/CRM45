/**
 * Endpoint de agregação completa do Funil Comercial
 * Rota: GET /backend/v1/funil/metricas
 *
 * Retorna contadores e subtotais (valor e quantidade) de CADA etapa sobre TODAS
 * as oportunidades elegíveis do filtro, além dos totais globais e resumo.
 * NUNCA calculado no frontend a partir dos cards visíveis paginados.
 */

routerAdd(
  'GET',
  '/backend/v1/funil/metricas',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const info = e.requestInfo()
    const query = info.query || {}

    const modoVisao = query.modo_visao === 'fechamento' ? 'fechamento' : 'origem'
    const dataInicio = (query.data_inicio || '').trim() // YYYY-MM-DD
    const dataFim = (query.data_fim || '').trim() // YYYY-MM-DD
    const vendedorId = (query.vendedor_id || 'todos').trim()
    const origem = (query.origem || 'todas').trim() // todas | crm | bling
    const tipoOrigem = (query.tipo_origem || 'todos').trim() // todos | crm | bling_proposta | bling_pedido
    const status = (query.status || 'todos').trim() // todos | aberto | ganho | perdido

    // Construção segura da cláusula WHERE via SQL com parâmetros nomeados
    const condicoes = ['1=1']
    const params = {}

    // 1. Filtro de status
    if (status !== 'todos') {
      condicoes.push('o.status = {:status}')
      params.status = status
    }

    // 2. Filtro de vendedor
    // vendedor pode ser filtrado por:
    // - 'sem_vendedor': o.vendedor IS NULL OR o.vendedor = ''
    // - id de usuario: o.vendedor = :vendedorId OR o.responsavel_id = :vendedorId
    if (vendedorId !== 'todos') {
      if (vendedorId === 'sem_vendedor' || vendedorId === 'sem_responsavel') {
        condicoes.push(
          "(o.vendedor = '' OR o.vendedor IS NULL) AND (o.responsavel_id = '' OR o.responsavel_id IS NULL)",
        )
      } else {
        condicoes.push(
          "(o.vendedor = {:vendedorId} OR ( (o.vendedor = '' OR o.vendedor IS NULL) AND o.responsavel_id = {:vendedorId} ))",
        )
        params.vendedorId = vendedorId
      }
    }

    // 3. Filtro por origem (crm | bling)
    if (origem !== 'todas') {
      if (origem === 'crm') {
        condicoes.push("(o.origem = '' OR o.origem IS NULL OR o.origem = 'crm')")
      } else {
        condicoes.push("o.origem = 'bling'")
      }
    }

    // 4. Filtro por tipo_origem
    if (tipoOrigem !== 'todos') {
      if (tipoOrigem === 'crm') {
        condicoes.push("(o.tipo_origem = '' OR o.tipo_origem IS NULL OR o.tipo_origem = 'crm')")
      } else {
        condicoes.push('o.tipo_origem = {:tipoOrigem}')
        params.tipoOrigem = tipoOrigem
      }
    }

    // 5. Filtro de Período (modo Origem vs modo Fechamento)
    if (dataInicio && dataFim) {
      params.dataInicio = dataInicio
      params.dataFim = dataFim
      const iniIso = dataInicio + ' 00:00:00'
      const fimIso = dataFim + ' 23:59:59'
      params.iniIso = iniIso
      params.fimIso = fimIso

      if (modoVisao === 'fechamento') {
        // MODO FECHAMENTO:
        // - registros com status != 'aberto' (ganho/perdido) usam data_fechamento
        // - registros em aberto usam data_prevista_fechamento
        condicoes.push(`
          (
            (o.status != 'aberto' AND (
              (substr(o.data_fechamento, 1, 10) >= {:dataInicio} AND substr(o.data_fechamento, 1, 10) <= {:dataFim})
              OR (o.data_fechamento >= {:iniIso} AND o.data_fechamento <= {:fimIso})
            ))
            OR
            (o.status = 'aberto' AND (
              (substr(o.data_prevista_fechamento, 1, 10) >= {:dataInicio} AND substr(o.data_prevista_fechamento, 1, 10) <= {:dataFim})
              OR (o.data_prevista_fechamento >= {:iniIso} AND o.data_prevista_fechamento <= {:fimIso})
            ))
          )
        `)
      } else {
        // MODO ORIGEM:
        // Filtra estritamente por data_origem (ou created como fallback se data_origem for vazia)
        condicoes.push(`
          (
            (o.data_origem != '' AND o.data_origem IS NOT NULL AND substr(o.data_origem, 1, 10) >= {:dataInicio} AND substr(o.data_origem, 1, 10) <= {:dataFim})
            OR
            ((o.data_origem = '' OR o.data_origem IS NULL) AND o.created >= {:iniIso} AND o.created <= {:fimIso})
          )
        `)
      }
    }

    const whereClause = condicoes.join(' AND ')

    try {
      // 1. Carregar lista de etapas ordenadas
      const etapasList = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 50, 0)
      const etapasResultado = []
      const mapaEtapas = {}

      for (let i = 0; i < etapasList.length; i++) {
        const et = etapasList[i]
        const itemEt = {
          etapa_id: et.id,
          nome: et.getString('nome'),
          ordem: et.getInt('ordem'),
          cor: et.getString('cor') || '#2563EB',
          quantidade: 0,
          valor_total: 0,
        }
        etapasResultado.push(itemEt)
        mapaEtapas[et.id] = itemEt
      }

      // 2. Consulta de agregação por etapa no banco
      const sqlAgregacaoEtapas = `
        SELECT
          o.etapa_id,
          COUNT(o.id) as qtd,
          ROUND(COALESCE(SUM(o.valor), 0), 2) as total_valor
        FROM oportunidades o
        WHERE ${whereClause}
        GROUP BY o.etapa_id
      `

      const rowsEtapas = $app.db().newQuery(sqlAgregacaoEtapas).bind(params).all()

      let totalRegistros = 0
      let totalValorGlobal = 0

      for (let r = 0; r < rowsEtapas.length; r++) {
        const row = rowsEtapas[r]
        const etapaId = row.etapa_id
        const qtd = Number(row.qtd || 0)
        const valor = Number(row.total_valor || 0)

        totalRegistros += qtd
        totalValorGlobal += valor

        if (mapaEtapas[etapaId]) {
          mapaEtapas[etapaId].quantidade = qtd
          mapaEtapas[etapaId].valor_total = Math.round(valor * 100) / 100
        }
      }

      // 3. Resumo por status (aberto, ganho, perdido)
      const sqlResumoStatus = `
        SELECT
          o.status,
          COUNT(o.id) as qtd,
          ROUND(COALESCE(SUM(o.valor), 0), 2) as total_valor
        FROM oportunidades o
        WHERE ${whereClause}
        GROUP BY o.status
      `

      const rowsStatus = $app.db().newQuery(sqlResumoStatus).bind(params).all()

      let abertasQtd = 0
      let abertasValor = 0
      let ganhasQtd = 0
      let ganhasValor = 0
      let perdidasQtd = 0
      let perdidasValor = 0

      for (let s = 0; s < rowsStatus.length; s++) {
        const sRow = rowsStatus[s]
        const st = String(sRow.status || '').toLowerCase()
        const qtd = Number(sRow.qtd || 0)
        const val = Number(sRow.total_valor || 0)

        if (st === 'aberto') {
          abertasQtd = qtd
          abertasValor = val
        } else if (st === 'ganho') {
          ganhasQtd = qtd
          ganhasValor = val
        } else if (st === 'perdido') {
          perdidasQtd = qtd
          perdidasValor = val
        }
      }

      const finalizadasQtd = ganhasQtd + perdidasQtd
      const taxaConversao = finalizadasQtd > 0 ? (ganhasQtd / finalizadasQtd) * 100 : 0
      const ticketMedio = ganhasQtd > 0 ? ganhasValor / ganhasQtd : 0

      // 4. Subdivisão por tipo_origem (pedidos vs propostas vs crm)
      const sqlTipoOrigem = `
        SELECT
          CASE
            WHEN o.tipo_origem = 'bling_pedido' THEN 'bling_pedido'
            WHEN o.tipo_origem = 'bling_proposta' THEN 'bling_proposta'
            ELSE 'crm'
          END as tipo,
          COUNT(o.id) as qtd,
          ROUND(COALESCE(SUM(o.valor), 0), 2) as total_valor
        FROM oportunidades o
        WHERE ${whereClause}
        GROUP BY tipo
      `

      const rowsTipo = $app.db().newQuery(sqlTipoOrigem).bind(params).all()
      const subtotaisTipo = {
        bling_pedido: { quantidade: 0, valor: 0 },
        bling_proposta: { quantidade: 0, valor: 0 },
        crm: { quantidade: 0, valor: 0 },
      }

      for (let t = 0; t < rowsTipo.length; t++) {
        const tRow = rowsTipo[t]
        const tp = String(tRow.tipo || 'crm')
        if (subtotaisTipo[tp]) {
          subtotaisTipo[tp].quantidade = Number(tRow.qtd || 0)
          subtotaisTipo[tp].valor = Math.round(Number(tRow.total_valor || 0) * 100) / 100
        }
      }

      return e.json(200, {
        success: true,
        modo_visao: modoVisao,
        periodo: {
          data_inicio: dataInicio,
          data_fim: dataFim,
        },
        filtros_aplicados: {
          vendedor_id: vendedorId,
          origem: origem,
          tipo_origem: tipoOrigem,
          status: status,
        },
        totais: {
          total_registros: totalRegistros,
          total_valor: Math.round(totalValorGlobal * 100) / 100,
        },
        resumo: {
          total_abertas: abertasQtd,
          valor_pipeline: Math.round(abertasValor * 100) / 100,
          total_ganhas: ganhasQtd,
          valor_ganhas: Math.round(ganhasValor * 100) / 100,
          total_perdidas: perdidasQtd,
          valor_perdidas: Math.round(perdidasValor * 100) / 100,
          taxa_conversao: Math.round(taxaConversao * 100) / 100,
          ticket_medio: Math.round(ticketMedio * 100) / 100,
        },
        etapas: etapasResultado,
        por_tipo_origem: subtotaisTipo,
      })
    } catch (err) {
      console.error('[FUNIL-METRICAS] Erro ao agregar funil:', err)
      return e.json(500, {
        success: false,
        message: 'Erro ao calcular métricas do funil: ' + String(err.message || err),
      })
    }
  },
  $apis.requireAuth(),
)
