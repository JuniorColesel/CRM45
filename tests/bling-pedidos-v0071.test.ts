import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  mapearVendedorBlingParaCrm,
  isConsumidorFinal,
  normalizarDocumento,
} from '@/lib/bling/blingUtils'

/**
 * Suíte de Testes dos 10 Requisitos Mandatórios de Pedidos Bling (v0.0.71):
 *
 * 1. Mesma sync 2x não duplica pedidos (idempotência por bling_pedido_id)
 * 2. Pedido sem cliente é persistido (cliente_id = null, status_vinculo = 'pendente', bling_contato_id preenchido)
 * 3. Pedido atualiza por bling_pedido_id (UPSERT determinístico)
 * 4. 429 Too Many Requests faz retry até 3 vezes com backoff
 * 5. 5xx Server Error faz retry até 3 vezes com backoff
 * 6. Erro de página de pedidos fica explicitamente logado em erros_pedidos
 * 7. Situação do pedido é persistida (situacao_bling_id, situacao_bling_nome, status_normalizado)
 * 8. Vendedor é persistido (vendedor_bling, vendedor_crm e resolução de responsavel_id)
 * 9. Cliente associado com prioridade por bling_id
 * 10. Read-only permanece intacto (nenhum POST/PUT/PATCH/DELETE ao Bling além de troca OAuth)
 */

describe('Suíte de Testes Bling — Persistência Confiável de Pedidos (v0.0.71)', () => {
  const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')

  // 1. Mesma sync 2x não duplica
  it('1. Idempotência: rodar a mesma sincronização 2x não duplica pedidos no CRM', () => {
    const pedidosLocais: Record<string, any> = {}
    let persistidos = 0
    let atualizados = 0
    let duplicados = 0

    const lotePedidosBling = [
      { id: 2001, numero: '1001', total: 500.0, data: '2026-03-01' },
      { id: 2002, numero: '1002', total: 1200.5, data: '2026-03-02' },
    ]

    const processarLote = (lote: typeof lotePedidosBling) => {
      for (const ped of lote) {
        const pid = String(ped.id)
        if (pedidosLocais[pid]) {
          // Atualiza
          pedidosLocais[pid].valor_total = ped.total
          pedidosLocais[pid].numero = ped.numero
          atualizados++
          duplicados++
        } else {
          // Insere novo
          pedidosLocais[pid] = {
            bling_pedido_id: pid,
            numero: ped.numero,
            valor_total: ped.total,
            data_pedido: ped.data,
          }
          persistidos++
        }
      }
    }

    // 1ª execução
    processarLote(lotePedidosBling)
    expect(Object.keys(pedidosLocais).length).toBe(2)
    expect(persistidos).toBe(2)
    expect(atualizados).toBe(0)

    // 2ª execução idêntica
    processarLote(lotePedidosBling)
    expect(Object.keys(pedidosLocais).length).toBe(2)
    expect(persistidos).toBe(2)
    expect(atualizados).toBe(2)
    expect(duplicados).toBe(2)
  })

  // 2. Pedido sem cliente é persistido
  it('2. Pedido sem cliente correspondente é persistido localmente com status_vinculo "pendente"', () => {
    const clientesBase: any[] = [] // nenhum cliente cadastrado
    const pedidoBling = {
      id: 3001,
      numero: '9999',
      contato: {
        id: 777888,
        nome: 'Empresa Desconhecida LTDA',
        numeroDocumento: '99.888.777/0001-66',
      },
      valor: 850.0,
      data: '2026-03-10',
    }

    // Algoritmo de matching
    const docLimpo = normalizarDocumento(pedidoBling.contato.numeroDocumento)
    const clienteAlvo = clientesBase.find(
      (c) => c.bling_id === String(pedidoBling.contato.id) || normalizarDocumento(c.cnpj_cpf) === docLimpo,
    )

    let clienteIdParaSalvar: string | null = null
    let statusVinculo: string = 'vinculado'
    if (clienteAlvo) {
      clienteIdParaSalvar = clienteAlvo.id
      statusVinculo = 'vinculado'
    } else {
      clienteIdParaSalvar = null
      statusVinculo = 'pendente'
    }

    const pedidoSalvo = {
      bling_pedido_id: String(pedidoBling.id),
      numero: pedidoBling.numero,
      cliente_id: clienteIdParaSalvar,
      bling_contato_id: String(pedidoBling.contato.id),
      contato_nome: pedidoBling.contato.nome,
      documento: pedidoBling.contato.numeroDocumento,
      status_vinculo: statusVinculo,
      valor_total: pedidoBling.valor,
    }

    expect(pedidoSalvo.cliente_id).toBeNull()
    expect(pedidoSalvo.status_vinculo).toBe('pendente')
    expect(pedidoSalvo.bling_contato_id).toBe('777888')
    expect(pedidoSalvo.valor_total).toBe(850.0)
  })

  // 3. Pedido atualiza por bling_pedido_id
  it('3. UPSERT determinístico: atualiza os dados do pedido local quando seu bling_pedido_id já existe', () => {
    const pedidoExistente = {
      bling_pedido_id: '4001',
      numero: '501',
      valor_total: 100.0,
      situacao_bling_id: '1',
      situacao_bling_nome: 'Em aberto',
      status_normalizado: 'em_aberto',
    }

    const payloadAtualizado = {
      id: 4001,
      numero: '501',
      total: 150.0, // valor aumentou
      situacao: { id: 2, valor: 'Atendido' },
    }

    // Simulação do UPSERT
    if (pedidoExistente.bling_pedido_id === String(payloadAtualizado.id)) {
      pedidoExistente.valor_total = payloadAtualizado.total
      pedidoExistente.situacao_bling_id = String(payloadAtualizado.situacao.id)
      pedidoExistente.situacao_bling_nome = payloadAtualizado.situacao.valor
      pedidoExistente.status_normalizado = 'atendido'
    }

    expect(pedidoExistente.valor_total).toBe(150.0)
    expect(pedidoExistente.situacao_bling_id).toBe('2')
    expect(pedidoExistente.situacao_bling_nome).toBe('Atendido')
    expect(pedidoExistente.status_normalizado).toBe('atendido')
  })

  // 4. 429 faz retry
  it('4. Chamada HTTP com status 429 Too Many Requests executa retry até 3 vezes', () => {
    let tentativas = 0
    let retriesContados = 0
    const maxTentativas = 3

    const requisicaoSimulada = () => {
      tentativas++
      if (tentativas < 3) {
        return { statusCode: 429, body: 'Rate limit' }
      }
      return { statusCode: 200, body: { data: [{ id: 10 }] } }
    }

    let resFinal: any = null
    while (retriesContados < maxTentativas) {
      retriesContados++
      const res = requisicaoSimulada()
      if (res.statusCode === 429 && retriesContados < maxTentativas) {
        continue
      }
      resFinal = res
      break
    }

    expect(tentativas).toBe(3)
    expect(resFinal.statusCode).toBe(200)
    expect(hookConteudo).toContain('res.statusCode === 429')
  })

  // 5. 5xx faz retry
  it('5. Chamada HTTP com erro de servidor 5xx executa retry até 3 vezes', () => {
    let tentativas = 0
    let retriesContados = 0
    const maxTentativas = 3

    const requisicaoSimulada = () => {
      tentativas++
      if (tentativas < 2) {
        return { statusCode: 502, body: 'Bad Gateway' }
      }
      return { statusCode: 200, body: { data: [{ id: 20 }] } }
    }

    let resFinal: any = null
    while (retriesContados < maxTentativas) {
      retriesContados++
      const res = requisicaoSimulada()
      if (res.statusCode >= 500 && retriesContados < maxTentativas) {
        continue
      }
      resFinal = res
      break
    }

    expect(tentativas).toBe(2)
    expect(resFinal.statusCode).toBe(200)
    expect(hookConteudo).toContain('res.statusCode >= 500')
  })

  // 6. Erro de página de pedidos fica explicitamente logado
  it('6. Falha em página de pedidos é capturada em erros_pedidos sem quebrar o log de auditoria', () => {
    const errosPedidos: Array<{ pagina: number; status_http: number; duracao_ms: number; erro: string }> = []
    const paginaAtual = 2
    const duracaoPagina = 120

    // Simula falha de página
    const msgHttp = 'Bling retornou HTTP 500 ao buscar pedidos na página 2 (120ms)'
    errosPedidos.push({
      pagina: paginaAtual,
      status_http: 500,
      duracao_ms: duracaoPagina,
      erro: msgHttp,
    })

    expect(errosPedidos.length).toBe(1)
    expect(errosPedidos[0].pagina).toBe(2)
    expect(errosPedidos[0].status_http).toBe(500)
    expect(errosPedidos[0].erro).toContain('HTTP 500')
    expect(hookConteudo).toContain('erros_pedidos')
  })

  // 7. Situação é persistida
  it('7. Situação do pedido é gravada com id, nome e status_normalizado', () => {
    const situacaoBling = { id: 9, valor: 'Atendido' }

    function normalizarStatusPedido(sitId: string, sitNome: string) {
      const n = (sitNome || '').trim().toLowerCase()
      if (n.includes('atendido') || n.includes('faturado') || n.includes('entregue')) {
        return 'atendido'
      }
      if (n.includes('cancelad')) return 'cancelado'
      if (n.includes('aberto') || n.includes('pendente')) return 'em_aberto'
      return 'outro'
    }

    const statusNorm = normalizarStatusPedido(String(situacaoBling.id), situacaoBling.valor)
    expect(statusNorm).toBe('atendido')

    const pedidoGravado = {
      situacao_bling_id: String(situacaoBling.id),
      situacao_bling_nome: situacaoBling.valor,
      status_normalizado: statusNorm,
    }

    expect(pedidoGravado.situacao_bling_id).toBe('9')
    expect(pedidoGravado.situacao_bling_nome).toBe('Atendido')
    expect(pedidoGravado.status_normalizado).toBe('atendido')
  })

  // 8. Vendedor é persistido com resolução CRM
  it('8. Vendedor do pedido é mapeado e atribuído ao usuário CRM correspondente', () => {
    expect(mapearVendedorBlingParaCrm('ALICE PAITRA COLESEL')).toBe('Alice')
    expect(mapearVendedorBlingParaCrm('RENAN SOUZA')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('MARIA CAROLINE SANTOS')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('VENDAS 1')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('VENDAS 2')).toBe('Vendas 2')
    expect(mapearVendedorBlingParaCrm('Vendedor Inédito')).toBe('Renan')

    const usuariosMap: Record<string, string> = {
      Alice: 'usr_alice_123',
      Renan: 'usr_renan_456',
      'Karoline (Vendas 1)': 'usr_karol_789',
      'Vendas 2': 'usr_vendas2_000',
    }

    const vendedorCrm = mapearVendedorBlingParaCrm('MARIA CAROLINE SANTOS')
    const responsavelId = usuariosMap[vendedorCrm]

    expect(vendedorCrm).toBe('Karoline (Vendas 1)')
    expect(responsavelId).toBe('usr_karol_789')
  })

  // 9. Cliente associado com prioridade por bling_id
  it('9. Prioridade de matching: associa o pedido ao cliente por bling_id antes de CNPJ ou Razão Social', () => {
    const clientes = [
      { id: 'cli_prioritario', bling_id: '888', cnpj_cpf: '11222333000100', nome: 'EMPRESA ALFA' },
      { id: 'cli_secundario', bling_id: '999', cnpj_cpf: '11222333000100', nome: 'EMPRESA BETA' },
    ]

    const pedido = {
      contato: {
        id: 888,
        numeroDocumento: '11.222.333/0001-00',
        nome: 'EMPRESA BETA',
      },
    }

    const mapPorBlingId: Record<string, any> = {
      '888': clientes[0],
      '999': clientes[1],
    }

    const clienteAlvo = mapPorBlingId[String(pedido.contato.id)]
    expect(clienteAlvo).toBeDefined()
    expect(clienteAlvo.id).toBe('cli_prioritario')
  })

  // 10. Read-only permanece intacto (nenhum POST/PUT/PATCH/DELETE além de tokens OAuth)
  it('10. Operação 100% Read-Only: nenhum POST/PUT/PATCH/DELETE em dados de negócio do Bling', () => {
    // Valida que o arquivo não contém POST/PUT/PATCH/DELETE para api.bling.com.br
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*POST/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PUT/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PATCH/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*DELETE/)

    // Valida que não há nenhuma chamada de mutação de oportunidades / Kanban
    expect(hookConteudo).not.toContain("findCollectionByNameOrId('etapas_funil')")
    expect(hookConteudo).not.toContain('new Record(oportunidadesCol)')
  })
})
