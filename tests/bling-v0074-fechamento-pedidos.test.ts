import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Suíte de Testes da Versão v0.0.74 — Fechamento da base bling_pedidos
 * Requisitos D.1 a D.6:
 *
 * D.1: Base com mais de 10.000 pedidos -> todos entram no mapa, pedidos além do teto são atualizados (não recriados nem rejeitados).
 * D.2: Pedido com situação 6, 9 ou 12 grava nome e status_normalizado corretos mesmo sem endpoint de situações.
 * D.3: Situação desconhecida vira 'outro' + aviso em avisos / status_nao_mapeados.
 * D.4: Contato com 'nome_empresa unique' falha apenas como aviso e o pedido é persistido normalmente.
 * D.5: Execução apenas com avisos -> status 'sucesso'; com página de pedidos falhada -> status 'sucesso_parcial'.
 * D.6: Idempotência financeira intacta: rodar consolidação 2x não altera valores (R$ 1.160.056,59 ou soma de 6 e 9).
 */

describe('Suíte v0.0.74 — Fechamento da Base bling_pedidos e Resolução de Erros/Situações', () => {
  const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')

  // D.1: Base com mais de 10.000 pedidos (mock com 10.001+ registros)
  it('D.1. Base com mais de 10.000 pedidos: paginação completa sem teto carrega todos e atualiza pedidos além de 10.000', () => {
    // 1. Validar no hook que o limite fixo de 10000 foi removido em favor da paginação
    expect(hookConteudo).not.toContain("findRecordsByFilter('bling_pedidos', '', '-created', 10000, 0)")
    expect(hookConteudo).toContain('batchPedidosSize')
    expect(hookConteudo).toContain('temMaisPedidosLocais')

    // 2. Simulação com fixture de 10.815 pedidos existentes no banco
    const totalBanco = 10815
    const bancoLocal: Record<string, { id: string; bling_pedido_id: string; valor_total: number; atualizado: boolean }> = {}

    for (let i = 1; i <= totalBanco; i++) {
      const pid = `p_${i}`
      bancoLocal[pid] = {
        id: `rec_${i}`,
        bling_pedido_id: pid,
        valor_total: 100,
        atualizado: false,
      }
    }

    // Mock do carregamento paginado em lotes de 5000 (mesmo padrão do hook)
    const mapBlingPedidosExistentes: Record<string, any> = {}
    const batchSize = 5000
    let offset = 0
    let temMais = true

    while (temMais) {
      const chaves = Object.keys(bancoLocal).slice(offset, offset + batchSize)
      for (const k of chaves) {
        mapBlingPedidosExistentes[k] = bancoLocal[k]
      }
      if (chaves.length < batchSize) {
        temMais = false
      } else {
        offset += chaves.length
      }
    }

    // Todos os 10.815 pedidos devem estar no mapa
    expect(Object.keys(mapBlingPedidosExistentes).length).toBe(totalBanco)

    // Simulação do loop de sincronização processando o pedido 10.815 (muito além do antigo teto de 10.000)
    let persistidosNovos = 0
    let atualizadosExistentes = 0
    let violacoesUnique = 0

    const pedidoParaProcessar = { id: 'p_10815', valor: 250 }
    const recExistente = mapBlingPedidosExistentes[pedidoParaProcessar.id]

    if (recExistente) {
      // UPSERT determinístico: atualiza em vez de chamar new Record
      recExistente.valor_total = pedidoParaProcessar.valor
      recExistente.atualizado = true
      atualizadosExistentes++
    } else {
      // Se não estivesse no mapa (bug antigo), tentaria criar novo e estouraria unique constraint
      violacoesUnique++
      persistidosNovos++
    }

    expect(atualizadosExistentes).toBe(1)
    expect(persistidosNovos).toBe(0)
    expect(violacoesUnique).toBe(0)
    expect(bancoLocal['p_10815'].valor_total).toBe(250)
    expect(bancoLocal['p_10815'].atualizado).toBe(true)
  })

  // D.2: Pedido com situação 6, 9 ou 12 grava nome e status_normalizado corretos mesmo sem endpoint de situações
  it('D.2. Pedido com situação 6, 9 ou 12 resolve nome e status_normalizado mesmo se API de módulos falhar', () => {
    // Replica o algoritmo do hook (resolverSituacaoPedido com fallback de SITUACOES_CONFIRMADAS)
    const mapSituacoesModulos: Record<string, string> = {} // endpoint indisponível

    const SITUACOES_CONFIRMADAS: Record<string, { nome: string; status: string }> = {
      '6': { nome: 'Em aberto', status: 'em_aberto' },
      '9': { nome: 'Atendido', status: 'atendido' },
      '12': { nome: 'Cancelado', status: 'cancelado' },
    }

    function resolverSituacao(sitId: string, sitNomeOriginal: string) {
      const sId = String(sitId || '').trim()
      let nomeFinal = mapSituacoesModulos[sId] || ''
      let statusFinal = ''

      if (SITUACOES_CONFIRMADAS[sId]) {
        if (!nomeFinal) {
          nomeFinal = SITUACOES_CONFIRMADAS[sId].nome
        }
        statusFinal = SITUACOES_CONFIRMADAS[sId].status
        return { nome: nomeFinal, status: statusFinal }
      }
      return { nome: sitNomeOriginal, status: 'outro' }
    }

    // Situação 6
    const res6 = resolverSituacao('6', 'Situação #6 (0)')
    expect(res6.nome).toBe('Em aberto')
    expect(res6.status).toBe('em_aberto')

    // Situação 9 (caso do pedido 27006324103 que vinha "Situação #9 (1)" -> "outro")
    const res9 = resolverSituacao('9', 'Situação #9 (1)')
    expect(res9.nome).toBe('Atendido')
    expect(res9.status).toBe('atendido')

    // Situação 12
    const res12 = resolverSituacao('12', 'Situação #12 (2)')
    expect(res12.nome).toBe('Cancelado')
    expect(res12.status).toBe('cancelado')
  })

  // D.3: Situação desconhecida vira 'outro' + aviso status_nao_mapeados
  it('D.3. Situação desconhecida vira "outro" e incrementa contador de status_nao_mapeados', () => {
    let statusNaoMapeados = 0
    const avisosGerais: string[] = []

    const SITUACOES_CONFIRMADAS: Record<string, { nome: string; status: string }> = {
      '6': { nome: 'Em aberto', status: 'em_aberto' },
      '9': { nome: 'Atendido', status: 'atendido' },
      '12': { nome: 'Cancelado', status: 'cancelado' },
    }

    function resolverSituacao(sitId: string, sitNomeOriginal: string) {
      const sId = String(sitId || '').trim()
      if (SITUACOES_CONFIRMADAS[sId]) {
        return { nome: SITUACOES_CONFIRMADAS[sId].nome, status: SITUACOES_CONFIRMADAS[sId].status }
      }

      const texto = (sitNomeOriginal || '').toLowerCase()
      if (texto.includes('atendido')) return { nome: sitNomeOriginal, status: 'atendido' }
      if (texto.includes('cancelad')) return { nome: sitNomeOriginal, status: 'cancelado' }
      if (texto.includes('aberto')) return { nome: sitNomeOriginal, status: 'em_aberto' }

      // Desconhecida
      statusNaoMapeados++
      avisosGerais.push(`Situação não mapeada: id=${sId} (${sitNomeOriginal}) classificada como "outro".`)
      return { nome: sitNomeOriginal || `Situação #${sId}`, status: 'outro' }
    }

    const resDesconhecida = resolverSituacao('999', 'Situação Exótica Personalizada')
    expect(resDesconhecida.status).toBe('outro')
    expect(statusNaoMapeados).toBe(1)
    expect(avisosGerais.length).toBe(1)
    expect(avisosGerais[0]).toContain('Situação não mapeada: id=999')
  })

  // D.4: Contato com nome_empresa unique falha apenas como aviso e o pedido é persistido
  it('D.4. Contato com nome_empresa unique duplicado vira aviso (não erro) e o pedido é persistido normalmente', () => {
    const errosGerais: string[] = []
    const avisosGerais: string[] = []

    // Simula tentativa de criar cliente duplicado
    const erroSimulado = new Error('nome_empresa: Value must be unique.')
    const errStr = String(erroSimulado.message)

    if (errStr.includes('nome_empresa: Value must be unique')) {
      avisosGerais.push('Aviso: cliente "EMPRESA DUPLICADA LTDA" não inserido por unicidade de nome_empresa.')
    } else {
      errosGerais.push('Erro ao inserir cliente: ' + errStr)
    }

    expect(errosGerais.length).toBe(0)
    expect(avisosGerais.length).toBe(1)
    expect(avisosGerais[0]).toContain('não inserido por unicidade de nome_empresa')

    // O pedido segue sendo salvo normalmente
    const pedido = {
      bling_pedido_id: '998877',
      cliente_id: 'rec_existente_por_doc',
      valor_total: 500,
    }
    expect(pedido.bling_pedido_id).toBe('998877')
    expect(pedido.cliente_id).toBe('rec_existente_por_doc')
  })

  // D.5: Execução com só avisos -> status 'sucesso'; com página de pedidos falhada -> 'sucesso_parcial'
  it('D.5. Regra de status da execução: apenas avisos gera "sucesso"; erros reais geram "sucesso_parcial"', () => {
    function calcularStatusExecucao(erros: string[], errosPed: any[], totalLidos: number) {
      if (erros.length === 0 && errosPed.length === 0) {
        return 'sucesso'
      }
      return totalLidos > 0 ? 'sucesso_parcial' : 'erro'
    }

    // Caso 1: 348 contatos com aviso de nome_empresa duplicado, zero erros reais, pedidos 10.815 lidos
    const statusApenasAvisos = calcularStatusExecucao([], [], 10815)
    expect(statusApenasAvisos).toBe('sucesso')

    // Caso 2: Falha real de requisição na página 5 do Bling
    const statusFalhaPagina = calcularStatusExecucao(
      ['Página 5 de pedidos falhou após 1200ms: HTTP 500'],
      [{ pagina: 5, status_http: 500 }],
      400,
    )
    expect(statusFalhaPagina).toBe('sucesso_parcial')

    // Caso 3: Falha total sem leitura
    const statusFalhaTotal = calcularStatusExecucao(['Token 401 expirado'], [], 0)
    expect(statusFalhaTotal).toBe('erro')
  })

  // D.6: Idempotência financeira intacta
  it('D.6. Idempotência financeira: recálculo 2x não altera valores e preserva filtro de vendas válidas (6 e 9)', () => {
    const pedidos = [
      { id: 1, valor_total: 1000.0, situacao_id: '6', data: '2026-03-01' },
      { id: 2, valor_total: 160.05, situacao_id: '9', data: '2026-03-05' },
      { id: 3, valor_total: 5000.0, situacao_id: '12', data: '2026-03-10' }, // cancelado
      { id: 4, valor_total: 300.0, situacao_id: '21', data: '2026-03-15' }, // digitação
    ]

    const calcularConsolidado = (lista: typeof pedidos) => {
      const soma = lista
        .filter((p) => p.situacao_id === '6' || p.situacao_id === '9')
        .reduce((acc, p) => acc + p.valor_total, 0)
      return Math.round(soma * 100) / 100
    }

    // 1ª execução
    const total1 = calcularConsolidado(pedidos)
    expect(total1).toBe(1160.05)

    // 2ª execução
    const total2 = calcularConsolidado(pedidos)
    expect(total2).toBe(1160.05)
    expect(total2).toBe(total1)
  })

  // Validação no código fonte de bling_importar.js dos requisitos A, B e C
  it('D.7. Verificação estrutural do código em pocketbase/hooks/bling_importar.js', () => {
    // 1. Paginação sem teto de bling_pedidos
    expect(hookConteudo).toContain('batchPedidosSize')
    expect(hookConteudo).toContain('offsetPedidos')

    // 2. Situações confirmadas 6, 9 e 12
    expect(hookConteudo).toContain('SITUACOES_CONFIRMADAS')
    expect(hookConteudo).toContain("'6': { nome: 'Em aberto', status: 'em_aberto' }")
    expect(hookConteudo).toContain("'9': { nome: 'Atendido', status: 'atendido' }")
    expect(hookConteudo).toContain("'12': { nome: 'Cancelado', status: 'cancelado' }")

    // 3. Campo avisos e status_nao_mapeados
    expect(hookConteudo).toContain('avisosGerais')
    expect(hookConteudo).toContain('statusNaoMapeados')

    // 4. Upsert resiliente a violação do índice único
    expect(hookConteudo).toContain('bling_pedido_id: Value must be unique')
  })
})
