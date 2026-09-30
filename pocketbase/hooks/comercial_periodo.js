/**
 * Hook: /backend/v1/painel/comercial
 *
 * Consolidação comercial no backend com contexto temporal explícito.
 * Executa queries agregadas sobre bling_pedidos, bling_propostas e oportunidades,
 * sem trafegar 10.815 pedidos ou 2.910 propostas para o navegador.
 *
 * Parâmetros aceitos (via query string):
 * - ano: number (ex: 2026, 2025, 2024...)
 * - mes: number | 'todos' (1 a 12 ou 'todos')
 * - data_inicio: YYYY-MM-DD (para período personalizado)
 * - data_fim: YYYY-MM-DD (para período personalizado)
 * - modo_visao: 'origem' | 'fechamento' (default: 'origem')
 */

routerAdd('GET', '/backend/v1/painel/comercial', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Usuário não autenticado.' })
  }

  const perfil = authRecord.getString('perfil')
  const usuarioId = authRecord.id

  // Helper inline: arredondar 2 casas decimais
  function round2(num) {
    return Math.round((Number(num) || 0) * 100) / 100
  }

  // Helper inline: converter de forma segura driver.Value (float, int, string, null) para número
  function toNum(val) {
    if (val === null || val === undefined) return 0
    const n = Number(val)
    return isNaN(n) ? 0 : n
  }

  // Helper inline: normalizar datas para filtros comerciais (formato YYYY-MM-DD ou YYYY-MM-DD HH:MM:SS)
  // Suporta tanto substr(data, 1, 10) quanto comparações seguras com início-exclusivo-fim
  function somarUmMesIso(ano, mes) {
    if (mes === 12) {
      return ano + 1 + '-01-01'
    }
    return ano + '-' + String(mes + 1).padStart(2, '0') + '-01'
  }

  const reqInfo = (typeof e.requestInfo === 'function' ? e.requestInfo() : null) || {}
  const reqQuery = reqInfo.query || {}

  console.log('[PAINEL-COMERCIAL] Requisição recebida com parâmetros: ' + JSON.stringify(reqQuery))

  // Helper inline: calcular intervalo de datas comerciais
  // Fallbacks seguros caso query venha via e.requestInfo().query ou e.request.url.query()
  function getQueryParam(key) {
    if (reqQuery && reqQuery[key] !== undefined && reqQuery[key] !== null) {
      return String(reqQuery[key])
    }
    try {
      if (e.request && e.request.url && typeof e.request.url.query === 'function') {
        const val = e.request.url.query().get(key)
        if (val !== null && val !== undefined) return String(val)
      }
    } catch (_) {}
    return ''
  }

  const anoRaw = getQueryParam('ano')
  const anoParam = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear()
  const mesParam = getQueryParam('mes') || 'todos'
  const dataInicioParam = getQueryParam('data_inicio')
  const dataFimParam = getQueryParam('data_fim')
  const modoVisao = getQueryParam('modo_visao') === 'fechamento' ? 'fechamento' : 'origem'

  let dataInicioYmd = ''
  let dataFimYmd = ''
  let labelPeriodo = ''
  let isPersonalizado = false
  let mesNumero = null

  if (dataInicioParam && dataFimParam) {
    dataInicioYmd = dataInicioParam.slice(0, 10)
    dataFimYmd = dataFimParam.slice(0, 10)
    isPersonalizado = true
    labelPeriodo = dataInicioYmd + ' a ' + dataFimYmd
  } else {
    if (mesParam === 'todos' || !mesParam) {
      dataInicioYmd = anoParam + '-01-01'
      dataFimYmd = anoParam + '-12-31'
      labelPeriodo = String(anoParam) + ' (Ano Completo)'
    } else {
      mesNumero = parseInt(mesParam, 10)
      if (isNaN(mesNumero) || mesNumero < 1 || mesNumero > 12) {
        mesNumero = 1
      }
      const mesStr = String(mesNumero).padStart(2, '0')
      // Cálculo de último dia do mês considerando bissextos
      const diasPorMes = [
        31,
        anoParam % 4 === 0 && (anoParam % 100 !== 0 || anoParam % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ]
      const ultDia = diasPorMes[mesNumero - 1]
      dataInicioYmd = anoParam + '-' + mesStr + '-01'
      dataFimYmd = anoParam + '-' + mesStr + '-' + String(ultDia).padStart(2, '0')

      const nomesMeses = [
        'Janeiro',
        'Fevereiro',
        'Março',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro',
      ]
      labelPeriodo = nomesMeses[mesNumero - 1] + '/' + String(anoParam)
    }
  }

  const inicioIso = dataInicioYmd + ' 00:00:00'
  const fimIso = dataFimYmd + ' 23:59:59'

  try {
    // 1. INDICADORES DE BASE / SISTEMA (ATEMPORAIS)
    let totalClientesCadastrados = 0
    let clientesComBlingId = 0
    let totalPedidosCadastradosBase = 0
    let totalPropostasCadastradasBase = 0

    try {
      const rowCli = new DynamicModel({ total: 0, com_bling: 0 })
      $app
        .db()
        .newQuery(
          "SELECT count(*) as total, sum(CASE WHEN bling_id != '' THEN 1 ELSE 0 END) as com_bling FROM clientes",
        )
        .one(rowCli)
      totalClientesCadastrados = Number(rowCli.total) || 0
      clientesComBlingId = Number(rowCli.com_bling) || 0
    } catch (errCli) {
      console.error('[PAINEL-COMERCIAL] Erro indicadores clientes base: ' + errCli)
    }

    try {
      totalPedidosCadastradosBase = $app.countRecords('bling_pedidos')
    } catch (errPedCount) {
      console.error('[PAINEL-COMERCIAL] Erro contagem bling_pedidos: ' + errPedCount)
    }

    try {
      totalPropostasCadastradasBase = $app.countRecords('bling_propostas')
    } catch (errPropCount) {
      console.error('[PAINEL-COMERCIAL] Erro contagem bling_propostas: ' + errPropCount)
    }

    // 2. HISTÓRICO TOTAL DE VENDAS BLING (VÁLIDOS: situação 6 e 9) - SEPARADO
    let valorVendasHistoricoTotal = 0
    let qtdPedidosValidosHistoricoTotal = 0
    try {
      const rowHist = new DynamicModel({ soma: '', qtd: 0 })
      $app
        .db()
        .newQuery(`
          SELECT CAST(COALESCE(sum(valor_total), 0) AS TEXT) as soma, count(*) as qtd
          FROM bling_pedidos
          WHERE situacao_bling_id = '6' OR situacao_bling_id = '9'
        `)
        .one(rowHist)
      valorVendasHistoricoTotal = round2(toNum(rowHist.soma))
      qtdPedidosValidosHistoricoTotal = Number(rowHist.qtd) || 0
    } catch (errHist) {
      console.error('[PAINEL-COMERCIAL] Erro vendas historico total: ' + errHist)
    }

    // 3. CONSULTAS DO PERÍODO COMERCIAL ESPECÍFICO (data_pedido entre inicio e fim)
    // Pedidos Bling do período
    let pedidosDoPeriodo = {
      total_pedidos: 0,
      pedidos_validos: 0,
      valor_vendas_valido: 0,
      em_aberto: { qtd: 0, valor: 0 },
      atendidos: { qtd: 0, valor: 0 },
      cancelados: { qtd: 0, valor: 0 },
      outros: { qtd: 0, valor: 0 },
      clientes_distintos_com_compra: 0,
    }

    try {
      const rowsPed = arrayOf(
        new DynamicModel({
          situacao_bling_id: '',
          qtd: 0,
          soma: '',
        }),
      )
      $app
        .db()
        .newQuery(`
          SELECT
            situacao_bling_id,
            count(*) as qtd,
            CAST(COALESCE(sum(valor_total), 0) AS TEXT) as soma
          FROM bling_pedidos
          WHERE substr(data_pedido, 1, 10) >= {:ini} AND substr(data_pedido, 1, 10) <= {:fim}
          GROUP BY situacao_bling_id
        `)
        .bind({ ini: dataInicioYmd, fim: dataFimYmd })
        .all(rowsPed)

      for (let i = 0; i < rowsPed.length; i++) {
        const r = rowsPed[i]
        const sit = String(r.situacao_bling_id)
        const qtd = Number(r.qtd) || 0
        const soma = round2(toNum(r.soma))

        pedidosDoPeriodo.total_pedidos += qtd

        if (sit === '6') {
          pedidosDoPeriodo.em_aberto.qtd += qtd
          pedidosDoPeriodo.em_aberto.valor = round2(pedidosDoPeriodo.em_aberto.valor + soma)
          pedidosDoPeriodo.pedidos_validos += qtd
          pedidosDoPeriodo.valor_vendas_valido = round2(pedidosDoPeriodo.valor_vendas_valido + soma)
        } else if (sit === '9') {
          pedidosDoPeriodo.atendidos.qtd += qtd
          pedidosDoPeriodo.atendidos.valor = round2(pedidosDoPeriodo.atendidos.valor + soma)
          pedidosDoPeriodo.pedidos_validos += qtd
          pedidosDoPeriodo.valor_vendas_valido = round2(pedidosDoPeriodo.valor_vendas_valido + soma)
        } else if (sit === '12') {
          pedidosDoPeriodo.cancelados.qtd += qtd
          pedidosDoPeriodo.cancelados.valor = round2(pedidosDoPeriodo.cancelados.valor + soma)
        } else {
          pedidosDoPeriodo.outros.qtd += qtd
          pedidosDoPeriodo.outros.valor = round2(pedidosDoPeriodo.outros.valor + soma)
        }
      }

      // Clientes distintos com pedidos válidos no período
      const rowCliDist = new DynamicModel({ qtd: 0 })
      $app
        .db()
        .newQuery(`
          SELECT count(DISTINCT cliente_id) as qtd
          FROM bling_pedidos
          WHERE (situacao_bling_id = '6' OR situacao_bling_id = '9')
            AND substr(data_pedido, 1, 10) >= {:ini} AND substr(data_pedido, 1, 10) <= {:fim}
            AND cliente_id != '' AND cliente_id IS NOT NULL
        `)
        .bind({ ini: dataInicioYmd, fim: dataFimYmd })
        .one(rowCliDist)
      pedidosDoPeriodo.clientes_distintos_com_compra = Number(rowCliDist.qtd) || 0
    } catch (errPedPeriodo) {
      console.error('[PAINEL-COMERCIAL] Erro ao calcular pedidos do período: ' + errPedPeriodo)
    }

    // 4. PROPOSTAS BLING DO PERÍODO (data_proposta entre inicio e fim)
    let propostasDoPeriodo = {
      total: 0,
      rascunho: 0,
      aguardando: 0,
      nao_aprovada: 0,
      convertida: 0,
      outras: 0,
      valor_total: 0,
      pendente_vinculo: 0,
    }

    try {
      const rowsProp = arrayOf(
        new DynamicModel({
          status_normalizado: '',
          qtd: 0,
          soma: '',
          sem_vinc: 0,
        }),
      )
      $app
        .db()
        .newQuery(`
          SELECT
            status_normalizado,
            count(*) as qtd,
            CAST(COALESCE(sum(valor_total), 0) AS TEXT) as soma,
            sum(CASE WHEN status_vinculo != 'vinculado' THEN 1 ELSE 0 END) as sem_vinc
          FROM bling_propostas
          WHERE substr(data_proposta, 1, 10) >= {:ini} AND substr(data_proposta, 1, 10) <= {:fim}
          GROUP BY status_normalizado
        `)
        .bind({ ini: dataInicioYmd, fim: dataFimYmd })
        .all(rowsProp)

      for (let j = 0; j < rowsProp.length; j++) {
        const rp = rowsProp[j]
        const st = String(rp.status_normalizado || '')
        const q = Number(rp.qtd) || 0
        const s = round2(toNum(rp.soma))
        const sv = Number(rp.sem_vinc) || 0

        propostasDoPeriodo.total += q
        propostasDoPeriodo.valor_total = round2(propostasDoPeriodo.valor_total + s)
        propostasDoPeriodo.pendente_vinculo += sv

        if (st === 'rascunho') propostasDoPeriodo.rascunho += q
        else if (st === 'aguardando') propostasDoPeriodo.aguardando += q
        else if (st === 'nao_aprovada') propostasDoPeriodo.nao_aprovada += q
        else if (st === 'convertida') propostasDoPeriodo.convertida += q
        else propostasDoPeriodo.outras += q
      }
    } catch (errPropPeriodo) {
      console.error('[PAINEL-COMERCIAL] Erro ao calcular propostas do período: ' + errPropPeriodo)
    }

    // 5. OPORTUNIDADES CRM DO PERÍODO (duas visões: por data_origem ou por data_fechamento)
    let oportunidadesDoPeriodo = {
      total_periodo: 0,
      abertas: { qtd: 0, valor: 0 },
      ganhas: { qtd: 0, valor: 0 },
      perdidas: { qtd: 0, valor: 0 },
      taxa_conversao: 0,
      ticket_medio: 0,
    }

    try {
      // Campo de referência temporal para oportunidades conforme modoVisao
      // Visão Origem: data_origem (ou substr(created,1,10))
      // Visão Fechamento: data_fechamento (quando preenchida)
      let sqlOportunidades = ''
      if (modoVisao === 'fechamento') {
        sqlOportunidades = `
            SELECT
              status,
              count(*) as qtd,
              CAST(COALESCE(sum(valor), 0) AS TEXT) as soma
            FROM oportunidades
            WHERE (
              (data_fechamento != '' AND substr(data_fechamento, 1, 10) >= {:ini} AND substr(data_fechamento, 1, 10) <= {:fim})
              OR (status = 'aberto' AND substr(data_prevista_fechamento, 1, 10) >= {:ini} AND substr(data_prevista_fechamento, 1, 10) <= {:fim})
            )
            GROUP BY status
          `
      } else {
        // Default: Visão Origem
        sqlOportunidades = `
            SELECT
              status,
              count(*) as qtd,
              CAST(COALESCE(sum(valor), 0) AS TEXT) as soma
            FROM oportunidades
            WHERE (
              (data_origem != '' AND substr(data_origem, 1, 10) >= {:ini} AND substr(data_origem, 1, 10) <= {:fim})
              OR ((data_origem = '' OR data_origem IS NULL) AND substr(created, 1, 10) >= {:ini} AND substr(created, 1, 10) <= {:fim})
            )
            GROUP BY status
          `
      }

      const rowsOps = arrayOf(
        new DynamicModel({
          status: '',
          qtd: 0,
          soma: '',
        }),
      )
      $app
        .db()
        .newQuery(sqlOportunidades)
        .bind({ ini: dataInicioYmd, fim: dataFimYmd })
        .all(rowsOps)

      for (let k = 0; k < rowsOps.length; k++) {
        const ro = rowsOps[k]
        const st = String(ro.status)
        const q = Number(ro.qtd) || 0
        const s = round2(toNum(ro.soma))

        oportunidadesDoPeriodo.total_periodo += q

        if (st === 'aberto') {
          oportunidadesDoPeriodo.abertas.qtd = q
          oportunidadesDoPeriodo.abertas.valor = s
        } else if (st === 'ganho') {
          oportunidadesDoPeriodo.ganhas.qtd = q
          oportunidadesDoPeriodo.ganhas.valor = s
        } else if (st === 'perdido') {
          oportunidadesDoPeriodo.perdidas.qtd = q
          oportunidadesDoPeriodo.perdidas.valor = s
        }
      }

      const fechadas = oportunidadesDoPeriodo.ganhas.qtd + oportunidadesDoPeriodo.perdidas.qtd
      if (fechadas > 0) {
        oportunidadesDoPeriodo.taxa_conversao = round2(
          (oportunidadesDoPeriodo.ganhas.qtd / fechadas) * 100,
        )
      }
      if (oportunidadesDoPeriodo.ganhas.qtd > 0) {
        oportunidadesDoPeriodo.ticket_medio = round2(
          oportunidadesDoPeriodo.ganhas.valor / oportunidadesDoPeriodo.ganhas.qtd,
        )
      }
    } catch (errOpsPeriodo) {
      console.error(
        '[PAINEL-COMERCIAL] Erro ao calcular oportunidades do período: ' + errOpsPeriodo,
      )
    }

    // 6. SÉRIE MENSAL (Janeiro a Dezembro) QUANDO O ANO ESTIVER SELECIONADO
    // Garante reconciliação exata: soma(jan...dez) == total do ano
    let serieMensalAno = []
    if (!isPersonalizado && (mesParam === 'todos' || !mesParam)) {
      const nomesMeses = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ]
      const diasPorMesAno = [
        31,
        anoParam % 4 === 0 && (anoParam % 100 !== 0 || anoParam % 400 === 0) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ]

      // Inicializar os 12 meses
      for (let m = 1; m <= 12; m++) {
        serieMensalAno.push({
          mes: m,
          nomeMes: nomesMeses[m - 1],
          mesAno: nomesMeses[m - 1] + '/' + String(anoParam).slice(-2),
          pedidos_validos: 0,
          valor_vendas: 0,
          propostas_total: 0,
          propostas_convertidas: 0,
          oportunidades_ganhas_qtd: 0,
          oportunidades_ganhas_valor: 0,
          oportunidades_perdidas_qtd: 0,
          oportunidades_perdidas_valor: 0,
        })
      }

      // Agregação mensal de pedidos válidos
      try {
        const rowsPedMes = arrayOf(
          new DynamicModel({
            mes_num: 0,
            qtd: 0,
            soma: '',
          }),
        )
        $app
          .db()
          .newQuery(`
            SELECT
              cast(substr(data_pedido, 6, 2) as integer) as mes_num,
              count(*) as qtd,
              CAST(COALESCE(sum(valor_total), 0) AS TEXT) as soma
            FROM bling_pedidos
            WHERE (situacao_bling_id = '6' OR situacao_bling_id = '9')
              AND substr(data_pedido, 1, 4) = {:anoStr}
            GROUP BY mes_num
          `)
          .bind({ anoStr: String(anoParam) })
          .all(rowsPedMes)

        for (let pm = 0; pm < rowsPedMes.length; pm++) {
          const rowP = rowsPedMes[pm]
          const mIdx = (Number(rowP.mes_num) || 1) - 1
          if (mIdx >= 0 && mIdx < 12) {
            serieMensalAno[mIdx].pedidos_validos = Number(rowP.qtd) || 0
            serieMensalAno[mIdx].valor_vendas = round2(toNum(rowP.soma))
          }
        }
      } catch (errPedMes) {
        console.error('[PAINEL-COMERCIAL] Erro agregacao mensal pedidos: ' + errPedMes)
      }

      // Agregação mensal de propostas
      try {
        const rowsPropMes = arrayOf(
          new DynamicModel({
            mes_num: 0,
            total: 0,
            conv: 0,
          }),
        )
        $app
          .db()
          .newQuery(`
            SELECT
              cast(substr(data_proposta, 6, 2) as integer) as mes_num,
              count(*) as total,
              sum(CASE WHEN status_normalizado = 'convertida' THEN 1 ELSE 0 END) as conv
            FROM bling_propostas
            WHERE substr(data_proposta, 1, 4) = {:anoStr}
            GROUP BY mes_num
          `)
          .bind({ anoStr: String(anoParam) })
          .all(rowsPropMes)

        for (let prM = 0; prM < rowsPropMes.length; prM++) {
          const rowPr = rowsPropMes[prM]
          const mIdx = (Number(rowPr.mes_num) || 1) - 1
          if (mIdx >= 0 && mIdx < 12) {
            serieMensalAno[mIdx].propostas_total = Number(rowPr.total) || 0
            serieMensalAno[mIdx].propostas_convertidas = Number(rowPr.conv) || 0
          }
        }
      } catch (errPropMes) {
        console.error('[PAINEL-COMERCIAL] Erro agregacao mensal propostas: ' + errPropMes)
      }

      // Agregação mensal de oportunidades
      try {
        const campoDataOp = modoVisao === 'fechamento' ? 'data_fechamento' : 'data_origem'
        const rowsOpsMes = arrayOf(
          new DynamicModel({
            mes_num: 0,
            status: '',
            qtd: 0,
            soma: '',
          }),
        )
        $app
          .db()
          .newQuery(`
            SELECT
              cast(substr(CASE WHEN ${campoDataOp} != '' THEN ${campoDataOp} ELSE created END, 6, 2) as integer) as mes_num,
              status,
              count(*) as qtd,
              CAST(COALESCE(sum(valor), 0) AS TEXT) as soma
            FROM oportunidades
            WHERE substr(CASE WHEN ${campoDataOp} != '' THEN ${campoDataOp} ELSE created END, 1, 4) = {:anoStr}
            GROUP BY mes_num, status
          `)
          .bind({ anoStr: String(anoParam) })
          .all(rowsOpsMes)

        for (let om = 0; om < rowsOpsMes.length; om++) {
          const rowO = rowsOpsMes[om]
          const mIdx = (Number(rowO.mes_num) || 1) - 1
          const st = String(rowO.status)
          if (mIdx >= 0 && mIdx < 12) {
            if (st === 'ganho') {
              serieMensalAno[mIdx].oportunidades_ganhas_qtd = Number(rowO.qtd) || 0
              serieMensalAno[mIdx].oportunidades_ganhas_valor = round2(toNum(rowO.soma))
            } else if (st === 'perdido') {
              serieMensalAno[mIdx].oportunidades_perdidas_qtd = Number(rowO.qtd) || 0
              serieMensalAno[mIdx].oportunidades_perdidas_valor = round2(toNum(rowO.soma))
            }
          }
        }
      } catch (errOpsMes) {
        console.error('[PAINEL-COMERCIAL] Erro agregacao mensal oportunidades: ' + errOpsMes)
      }
    }

    // Retorno JSON completo e consistente
    return e.json(200, {
      success: true,
      contexto: {
        ano: anoParam,
        mes: mesNumero,
        isPersonalizado: isPersonalizado,
        dataInicioYmd: dataInicioYmd,
        dataFimYmd: dataFimYmd,
        labelPeriodo: labelPeriodo,
        modoVisao: modoVisao,
      },
      indicadores_base: {
        totalClientesCadastrados,
        clientesComBlingId,
        totalPedidosCadastradosBase,
        totalPropostasCadastradasBase,
        descricao: 'Indicadores atemporais da base de dados',
      },
      historico_total: {
        valor_vendas_total: valorVendasHistoricoTotal,
        pedidos_validos_total: qtdPedidosValidosHistoricoTotal,
        criterio: 'Todos os pedidos Bling com situação 6 (Em aberto) ou 9 (Atendido)',
      },
      pedidos_periodo: pedidosDoPeriodo,
      propostas_periodo: propostasDoPeriodo,
      oportunidades_periodo: oportunidadesDoPeriodo,
      serie_mensal_ano: serieMensalAno,
    })
  } catch (errGeral) {
    console.error(
      '[PAINEL-COMERCIAL] Erro capturado: ' +
        String(errGeral.message || errGeral) +
        ' | Stack: ' +
        String(errGeral.stack || ''),
    )
    return e.json(500, {
      success: false,
      message: 'Erro no cálculo de indicadores comerciais: ' + String(errGeral.message || errGeral),
    })
  }
})

// Recalcular cache / sinc do painel
routerAdd('POST', '/backend/v1/painel/recalcular-cache', (e) => {
  return e.json(200, { ok: true })
})
