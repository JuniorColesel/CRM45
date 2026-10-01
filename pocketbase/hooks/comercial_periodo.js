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

    // 6. SÉRIE DIÁRIA DO PERÍODO SELECIONADO (Mês individual ou personalizado <= 45 dias)
    // Granularidade automática:
    // - Mês = Todos -> Gráficos mensais Jan-Dez
    // - Mês específico -> Gráfico diário 01..último dia do mês
    // - Personalizado: <= 45 dias -> diário; > 45 dias -> mensal
    let serieDiariaPeriodo = []
    const dataIniDate = new Date(dataInicioYmd + 'T00:00:00')
    const dataFimDate = new Date(dataFimYmd + 'T00:00:00')
    const diferencaDias =
      Math.round((dataFimDate.getTime() - dataIniDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const deveGerarSerieDiaria =
      (!isPersonalizado && mesParam !== 'todos' && mesParam) ||
      (isPersonalizado && diferencaDias <= 45)

    if (deveGerarSerieDiaria) {
      // Gerar todos os dias contínuos no intervalo [dataInicioYmd .. dataFimYmd]
      const mapaDias = {}
      const cur = new Date(dataIniDate)
      while (cur <= dataFimDate) {
        const y = cur.getFullYear()
        const m = String(cur.getMonth() + 1).padStart(2, '0')
        const d = String(cur.getDate()).padStart(2, '0')
        const chaveData = y + '-' + m + '-' + d
        const diaNumero = cur.getDate()
        const diaMesFormatado = d + '/' + m

        const ponto = {
          data: chaveData,
          dia: diaNumero,
          label: diaMesFormatado,
          pedidos_validos: 0,
          valor_vendas: 0,
          pedidos_cancelados: 0,
          propostas_total: 0,
          propostas_rascunho: 0,
          propostas_aguardando: 0,
          propostas_nao_aprovada: 0,
          propostas_convertida: 0,
        }
        mapaDias[chaveData] = ponto
        serieDiariaPeriodo.push(ponto)
        cur.setDate(cur.getDate() + 1)
      }

      // Agregação diária de pedidos (vendas válidas: 6 e 9; cancelados: 12)
      try {
        const rowsPedDia = arrayOf(
          new DynamicModel({
            dia_str: '',
            situacao_bling_id: '',
            qtd: 0,
            soma: '',
          }),
        )
        $app
          .db()
          .newQuery(`
            SELECT
              substr(data_pedido, 1, 10) as dia_str,
              situacao_bling_id,
              count(*) as qtd,
              CAST(COALESCE(sum(valor_total), 0) AS TEXT) as soma
            FROM bling_pedidos
            WHERE substr(data_pedido, 1, 10) >= {:ini} AND substr(data_pedido, 1, 10) <= {:fim}
            GROUP BY dia_str, situacao_bling_id
          `)
          .bind({ ini: dataInicioYmd, fim: dataFimYmd })
          .all(rowsPedDia)

        for (let pd = 0; pd < rowsPedDia.length; pd++) {
          const rowD = rowsPedDia[pd]
          const dStr = String(rowD.dia_str || '')
          const sitId = String(rowD.situacao_bling_id || '')
          const qVal = Number(rowD.qtd) || 0
          const sVal = round2(toNum(rowD.soma))

          if (mapaDias[dStr]) {
            if (sitId === '6' || sitId === '9') {
              mapaDias[dStr].pedidos_validos += qVal
              mapaDias[dStr].valor_vendas = round2(mapaDias[dStr].valor_vendas + sVal)
            } else if (sitId === '12') {
              mapaDias[dStr].pedidos_cancelados += qVal
            }
          }
        }
      } catch (errPedDia) {
        console.error('[PAINEL-COMERCIAL] Erro agregacao diaria pedidos: ' + errPedDia)
      }

      // Agregação diária de propostas
      try {
        const rowsPropDia = arrayOf(
          new DynamicModel({
            dia_str: '',
            status_normalizado: '',
            qtd: 0,
          }),
        )
        $app
          .db()
          .newQuery(`
            SELECT
              substr(data_proposta, 1, 10) as dia_str,
              status_normalizado,
              count(*) as qtd
            FROM bling_propostas
            WHERE substr(data_proposta, 1, 10) >= {:ini} AND substr(data_proposta, 1, 10) <= {:fim}
            GROUP BY dia_str, status_normalizado
          `)
          .bind({ ini: dataInicioYmd, fim: dataFimYmd })
          .all(rowsPropDia)

        for (let prD = 0; prD < rowsPropDia.length; prD++) {
          const rowPrD = rowsPropDia[prD]
          const dStr = String(rowPrD.dia_str || '')
          const stNorm = String(rowPrD.status_normalizado || '')
          const qPr = Number(rowPrD.qtd) || 0

          if (mapaDias[dStr]) {
            mapaDias[dStr].propostas_total += qPr
            if (stNorm === 'rascunho') mapaDias[dStr].propostas_rascunho += qPr
            else if (stNorm === 'aguardando') mapaDias[dStr].propostas_aguardando += qPr
            else if (stNorm === 'nao_aprovada') mapaDias[dStr].propostas_nao_aprovada += qPr
            else if (stNorm === 'convertida') mapaDias[dStr].propostas_convertida += qPr
          }
        }
      } catch (errPropDia) {
        console.error('[PAINEL-COMERCIAL] Erro agregacao diaria propostas: ' + errPropDia)
      }
    }

    // 7. SÉRIE MENSAL (Janeiro a Dezembro) QUANDO O ANO ESTIVER SELECIONADO
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
      serie_diaria_periodo: serieDiariaPeriodo,
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

// Endpoint de auditoria estruturada direta para relatório da v0.0.88
routerAdd('GET', '/backend/v1/painel/auditoria-v88', (e) => {
  try {
    const funilTotais = new DynamicModel({
      total: 0,
      ganhos: 0,
      perdidos: 0,
      abertos: 0,
      sem_data_origem: 0,
      com_data_origem: 0,
      com_responsavel: 0,
      sem_responsavel: 0,
    })
    $app
      .db()
      .newQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ganho' THEN 1 ELSE 0 END) as ganhos,
          SUM(CASE WHEN status = 'perdido' THEN 1 ELSE 0 END) as perdidos,
          SUM(CASE WHEN status = 'aberto' THEN 1 ELSE 0 END) as abertos,
          SUM(CASE WHEN data_origem = '' OR data_origem IS NULL THEN 1 ELSE 0 END) as sem_data_origem,
          SUM(CASE WHEN data_origem != '' AND data_origem IS NOT NULL THEN 1 ELSE 0 END) as com_data_origem,
          SUM(CASE WHEN responsavel_id != '' AND responsavel_id IS NOT NULL THEN 1 ELSE 0 END) as com_responsavel,
          SUM(CASE WHEN responsavel_id = '' OR responsavel_id IS NULL THEN 1 ELSE 0 END) as sem_responsavel
        FROM oportunidades
        WHERE origem = 'bling'
      `)
      .one(funilTotais)

    // Setembro 2026: Propostas elegíveis
    const propSetDoc = new DynamicModel({ total_doc: 0, vinculadas: 0, pendentes: 0 })
    $app
      .db()
      .newQuery(`
        SELECT
          COUNT(*) as total_doc,
          SUM(CASE WHEN status_vinculo = 'vinculado' AND cliente_id != '' AND cliente_id IS NOT NULL THEN 1 ELSE 0 END) as vinculadas,
          SUM(CASE WHEN status_vinculo != 'vinculado' OR cliente_id = '' OR cliente_id IS NULL THEN 1 ELSE 0 END) as pendentes
        FROM bling_propostas
        WHERE visivel_funil = 1
          AND (status_normalizado = 'rascunho' OR status_normalizado = 'aguardando' OR status_normalizado = 'nao_aprovada')
          AND substr(data_proposta, 1, 10) >= '2026-09-01'
          AND substr(data_proposta, 1, 10) <= '2026-09-30'
      `)
      .one(propSetDoc)

    const propSetOps = new DynamicModel({ total_ops: 0 })
    $app
      .db()
      .newQuery(`
        SELECT COUNT(*) as total_ops
        FROM oportunidades
        WHERE tipo_origem = 'bling_proposta'
          AND substr(data_origem, 1, 10) >= '2026-09-01'
          AND substr(data_origem, 1, 10) <= '2026-09-30'
      `)
      .one(propSetOps)

    // Setembro 2026: Pedidos elegíveis
    const pedSetDoc = new DynamicModel({ total_doc: 0, vinculados: 0, pendentes: 0 })
    $app
      .db()
      .newQuery(`
        SELECT
          COUNT(*) as total_doc,
          SUM(CASE WHEN status_vinculo = 'vinculado' AND cliente_id != '' AND cliente_id IS NOT NULL THEN 1 ELSE 0 END) as vinculados,
          SUM(CASE WHEN status_vinculo != 'vinculado' OR cliente_id = '' OR cliente_id IS NULL THEN 1 ELSE 0 END) as pendentes
        FROM bling_pedidos
        WHERE (situacao_bling_nome = 'Em aberto' OR situacao_bling_nome = 'Atendido' OR situacao_bling_nome = 'Cancelado')
          AND substr(data_pedido, 1, 10) >= '2026-09-01'
          AND substr(data_pedido, 1, 10) <= '2026-09-30'
      `)
      .one(pedSetDoc)

    const pedSetOps = new DynamicModel({ total_ops: 0 })
    $app
      .db()
      .newQuery(`
        SELECT COUNT(*) as total_ops
        FROM oportunidades
        WHERE tipo_origem = 'bling_pedido'
          AND substr(data_origem, 1, 10) >= '2026-09-01'
          AND substr(data_origem, 1, 10) <= '2026-09-30'
      `)
      .one(pedSetOps)

    // Vendas Setembro
    const dashSet = new DynamicModel({ valor_vendas: '', qtd_validos: 0 })
    $app
      .db()
      .newQuery(`
        SELECT
          CAST(COALESCE(SUM(valor_total), 0) AS TEXT) as valor_vendas,
          COUNT(*) as qtd_validos
        FROM bling_pedidos
        WHERE (situacao_bling_id = '6' OR situacao_bling_id = '9')
          AND substr(data_pedido, 1, 10) >= '2026-09-01'
          AND substr(data_pedido, 1, 10) <= '2026-09-30'
      `)
      .one(dashSet)

    // Responsável auditoria
    const respAudit = new DynamicModel({
      ped_com_resp: 0,
      ped_sem_resp: 0,
      prop_com_resp: 0,
      prop_sem_resp: 0,
      ops_com_resp: 0,
      ops_sem_resp: 0,
    })
    $app
      .db()
      .newQuery(`
        SELECT
          (SELECT COUNT(*) FROM bling_pedidos WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as ped_com_resp,
          (SELECT COUNT(*) FROM bling_pedidos WHERE responsavel_id = '' OR responsavel_id IS NULL) as ped_sem_resp,
          (SELECT COUNT(*) FROM bling_propostas WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as prop_com_resp,
          (SELECT COUNT(*) FROM bling_propostas WHERE responsavel_id = '' OR responsavel_id IS NULL) as prop_sem_resp,
          (SELECT COUNT(*) FROM oportunidades WHERE responsavel_id != '' AND responsavel_id IS NOT NULL) as ops_com_resp,
          (SELECT COUNT(*) FROM oportunidades WHERE responsavel_id = '' OR responsavel_id IS NULL) as ops_sem_resp
      `)
      .one(respAudit)

    return e.json(200, {
      ok: true,
      funilTotais: {
        total: Number(funilTotais.total),
        ganhos: Number(funilTotais.ganhos),
        perdidos: Number(funilTotais.perdidos),
        abertos: Number(funilTotais.abertos),
        sem_data_origem: Number(funilTotais.sem_data_origem),
        com_data_origem: Number(funilTotais.com_data_origem),
        com_responsavel: Number(funilTotais.com_responsavel),
        sem_responsavel: Number(funilTotais.sem_responsavel),
      },
      reconciliacaoSetembro: {
        propostasDoc: {
          total_doc: Number(propSetDoc.total_doc),
          vinculadas: Number(propSetDoc.vinculadas),
          pendentes: Number(propSetDoc.pendentes),
        },
        propostasOps: Number(propSetOps.total_ops),
        pedidosDoc: {
          total_doc: Number(pedSetDoc.total_doc),
          vinculados: Number(pedSetDoc.vinculados),
          pendentes: Number(pedSetDoc.pendentes),
        },
        pedidosOps: Number(pedSetOps.total_ops),
      },
      dashboardSetembro: {
        valor_vendas: Math.round(Number(dashSet.valor_vendas) * 100) / 100,
        qtd_validos: Number(dashSet.qtd_validos),
      },
      responsavelAudit: {
        ped_com_resp: Number(respAudit.ped_com_resp),
        ped_sem_resp: Number(respAudit.ped_sem_resp),
        prop_com_resp: Number(respAudit.prop_com_resp),
        prop_sem_resp: Number(respAudit.prop_sem_resp),
        ops_com_resp: Number(respAudit.ops_com_resp),
        ops_sem_resp: Number(respAudit.ops_sem_resp),
      },
    })
  } catch (err) {
    return e.json(500, { error: String(err.message || err) })
  }
})
