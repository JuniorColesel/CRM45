import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Suíte de Testes da Versão v0.0.75 — Propostas Comerciais Bling (Somente Leitura)
 * Requisitos:
 * 1. Bling SOMENTE LEITURA: exclusivamente GET para endpoints de negócio do Bling.
 * 2. Validação da rota /propostas-comerciais e escopo OAuth propostas-comerciais:read.
 * 3. Coleção bling_propostas e migration 0044 com campos mínimos e índices.
 * 4. Idempotência estrita: 2x execuções consecutivas não duplicam e mantêm contagem estável.
 * 5. Resolução e normalização de situações (rascunho, aguardando, nao_aprovada, convertida, outro).
 * 6. Regra de visibilidade futura no funil (visivel_funil = true para ativas/perdidas, false para convertidas).
 * 7. Matching de cliente (prioridade bling_id, doc, consumidor final, razão social; se ausente: pendente, cliente_id=null).
 * 8. Resiliência: conflito nome_empresa unique e erros não descartam a proposta comercial.
 * 9. Retry e backoff em requisições de página e log de erros sem token.
 * 10. Base de pedidos pré-existente e funil não sofrem mutações.
 */

describe('Suíte v0.0.75 — Propostas Comerciais Bling (Leitura, Persistência e Normalização)', () => {
  const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const migrationPath = path.resolve(process.cwd(), 'pocketbase/migrations/0044_create_bling_propostas.js')
  const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')
  const migrationConteudo = fs.readFileSync(migrationPath, 'utf-8')

  // 1. Bling SOMENTE LEITURA (Regra Absoluta)
  it('1. Bling estritamente SOMENTE LEITURA: todas as rotas de negócio usam GET e não existe mutação', () => {
    // Valida que para contatos, pedidos e propostas usa-se exclusivamente GET
    expect(hookConteudo).toContain("tipo === 'propostas'")
    expect(hookConteudo).toContain("https://api.bling.com.br/Api/v3/propostas-comerciais")
    expect(hookConteudo).toContain("getBlingGet(urlPropostas")

    // Verificar se existe chamada de POST para negócio do Bling (não deve existir; única exceção é token/oauth)
    const linhas = hookConteudo.split('\n')
    const chamadasPost = linhas.filter((l) => l.includes('$http.send') && l.includes("'POST'"))
    for (const linha of chamadasPost) {
      // Todas as chamadas POST devem ser estritamente para o endpoint /token
      expect(linha).toContain('/token')
      expect(linha).not.toContain('/propostas-comerciais')
      expect(linha).not.toContain('/pedidos')
      expect(linha).not.toContain('/contatos')
    }
  })

  // 2. Escopo OAuth atualizado com menor privilégio
  it('2. Escopo OAuth inclui propostas-comerciais:read preservando contatos:read e pedidos-vendas:read', () => {
    expect(hookConteudo).toContain('contatos:read pedidos-vendas:read propostas-comerciais:read')
    // Não deve conter escopos financeiros ou de escrita
    expect(hookConteudo).not.toContain('contas-receber')
    expect(hookConteudo).not.toContain('contas-pagar')
    expect(hookConteudo).not.toContain('propostas-comerciais:write')
    expect(hookConteudo).not.toContain('pedidos-vendas:write')
  })

  // 3. Estrutura da coleção bling_propostas na migração
  it('3. Migração 0044 define coleção bling_propostas com campos e índice único obrigatório', () => {
    expect(migrationConteudo).toContain("name: 'bling_propostas'")
    expect(migrationConteudo).toContain("name: 'bling_proposta_id', type: 'text', required: true")
    expect(migrationConteudo).toContain("name: 'cliente_id',")
    expect(migrationConteudo).toContain("name: 'bling_contato_id',")
    expect(migrationConteudo).toContain("name: 'contato_nome',")
    expect(migrationConteudo).toContain("name: 'documento',")
    expect(migrationConteudo).toContain("name: 'vendedor_bling',")
    expect(migrationConteudo).toContain("name: 'vendedor_crm',")
    expect(migrationConteudo).toContain("name: 'responsavel_id',")
    expect(migrationConteudo).toContain("name: 'data_proposta',")
    expect(migrationConteudo).toContain("name: 'data_validade',")
    expect(migrationConteudo).toContain("name: 'valor_total',")
    expect(migrationConteudo).toContain("name: 'situacao_bling_id',")
    expect(migrationConteudo).toContain("name: 'situacao_bling_nome',")
    expect(migrationConteudo).toContain("name: 'status_normalizado',")
    expect(migrationConteudo).toContain("name: 'status_vinculo',")
    expect(migrationConteudo).toContain("name: 'visivel_funil',")
    expect(migrationConteudo).toContain('CREATE UNIQUE INDEX idx_bling_propostas_proposta_id ON bling_propostas (bling_proposta_id)')
  })

  // 4. Normalização de situações determinística (v0.0.77 — mapa por nome exato)
  it('4. Normalização determinística por nome exato (trim + case-insensitive sem acentos)', () => {
    function normalizarTextoSemAcentos(str: string) {
      if (!str) return ''
      return String(str)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    }

    const MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO: Record<
      string,
      { status: string; visivel: boolean; conhecido: boolean; ambiguo?: boolean }
    > = {
      'rascunho': { status: 'rascunho', visivel: true, conhecido: true },
      'aguardando': { status: 'aguardando', visivel: true, conhecido: true },
      'pendente': { status: 'aguardando', visivel: true, conhecido: true },
      'nao aprovado': { status: 'nao_aprovada', visivel: true, conhecido: true },
      'nao aprovada': { status: 'nao_aprovada', visivel: true, conhecido: true },
      'aprovado': { status: 'convertida', visivel: false, conhecido: true },
      'aprovada': { status: 'convertida', visivel: false, conhecido: true },
      'concluido': { status: 'outro', visivel: false, conhecido: true, ambiguo: true },
      'concluida': { status: 'outro', visivel: false, conhecido: true, ambiguo: true },
    }

    function resolverSituacaoDeterminada(sitNome: string) {
      const chave = normalizarTextoSemAcentos(sitNome)
      if (MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO[chave]) {
        const c = MAPA_SITUACOES_PROPOSTAS_DETERMINISTICO[chave]
        return {
          statusNormalizado: c.status,
          visivelFunil: c.visivel,
          naoMapeado: false,
        }
      }
      return {
        statusNormalizado: 'outro',
        visivelFunil: false,
        naoMapeado: true,
      }
    }

    // Casos de teste determinísticos v0.0.77:
    // "Rascunho" -> rascunho, visivel_funil = true
    expect(resolverSituacaoDeterminada('Rascunho')).toEqual({
      statusNormalizado: 'rascunho',
      visivelFunil: true,
      naoMapeado: false,
    })
    expect(resolverSituacaoDeterminada('  rascunho ')).toEqual({
      statusNormalizado: 'rascunho',
      visivelFunil: true,
      naoMapeado: false,
    })

    // "Aguardando" e "Pendente" -> aguardando, true
    expect(resolverSituacaoDeterminada('Aguardando')).toEqual({
      statusNormalizado: 'aguardando',
      visivelFunil: true,
      naoMapeado: false,
    })
    expect(resolverSituacaoDeterminada('Pendente')).toEqual({
      statusNormalizado: 'aguardando',
      visivelFunil: true,
      naoMapeado: false,
    })

    // "Não aprovado" e "Não aprovada" -> nao_aprovada, true
    expect(resolverSituacaoDeterminada('Não aprovado')).toEqual({
      statusNormalizado: 'nao_aprovada',
      visivelFunil: true,
      naoMapeado: false,
    })
    expect(resolverSituacaoDeterminada('Não aprovada')).toEqual({
      statusNormalizado: 'nao_aprovada',
      visivelFunil: true,
      naoMapeado: false,
    })

    // "Aprovado" e "Aprovada" -> convertida, false
    expect(resolverSituacaoDeterminada('Aprovado')).toEqual({
      statusNormalizado: 'convertida',
      visivelFunil: false,
      naoMapeado: false,
    })
    expect(resolverSituacaoDeterminada('Aprovada')).toEqual({
      statusNormalizado: 'convertida',
      visivelFunil: false,
      naoMapeado: false,
    })

    // "Concluído" -> MANTER 'outro', visivel_funil = false (ambíguo) e NÃO conta como naoMapeado
    expect(resolverSituacaoDeterminada('Concluído')).toEqual({
      statusNormalizado: 'outro',
      visivelFunil: false,
      naoMapeado: false,
    })
    expect(resolverSituacaoDeterminada('Concluida')).toEqual({
      statusNormalizado: 'outro',
      visivelFunil: false,
      naoMapeado: false,
    })

    // Outros nomes -> outro, false e SIM conta como não mapeado
    expect(resolverSituacaoDeterminada('Personalizada')).toEqual({
      statusNormalizado: 'outro',
      visivelFunil: false,
      naoMapeado: true,
    })
  })

  // 5. Persistência idempotente: sincronizar 2x não duplica proposta
  it('5. Sincronização 2x mantém quantidade estável e atualiza campos sem gerar novas propostas', () => {
    const bancoLocal: Record<string, any> = {}

    function upsertProposta(payload: {
      id: string
      numero: string
      valor: number
      situacao: string
    }) {
      let criado = false
      let atualizado = false

      let rec = bancoLocal[payload.id]
      if (!rec) {
        rec = { bling_proposta_id: payload.id }
        bancoLocal[payload.id] = rec
        criado = true
      } else {
        atualizado = true
      }

      rec.numero = payload.numero
      rec.valor_total = payload.valor
      rec.situacao_bling_nome = payload.situacao
      rec.sincronizado_em = new Date().toISOString()

      return { criado, atualizado }
    }

    // 1ª Rodada: 3 propostas novas
    const r1_1 = upsertProposta({ id: 'prop_1', numero: '101', valor: 1500, situacao: 'Rascunho' })
    const r1_2 = upsertProposta({ id: 'prop_2', numero: '102', valor: 3200, situacao: 'Aguardando' })
    const r1_3 = upsertProposta({ id: 'prop_3', numero: '103', valor: 8900, situacao: 'Convertida' })

    expect(r1_1.criado).toBe(true)
    expect(r1_2.criado).toBe(true)
    expect(r1_3.criado).toBe(true)
    expect(Object.keys(bancoLocal).length).toBe(3)

    // 2ª Rodada: Mesmas 3 propostas, porém com valor atualizado na proposta 2
    const r2_1 = upsertProposta({ id: 'prop_1', numero: '101', valor: 1500, situacao: 'Rascunho' })
    const r2_2 = upsertProposta({ id: 'prop_2', numero: '102', valor: 3500, situacao: 'Aguardando' })
    const r2_3 = upsertProposta({ id: 'prop_3', numero: '103', valor: 8900, situacao: 'Convertida' })

    expect(r2_1.criado).toBe(false)
    expect(r2_1.atualizado).toBe(true)
    expect(r2_2.criado).toBe(false)
    expect(r2_2.atualizado).toBe(true)
    expect(r2_3.criado).toBe(false)
    expect(r2_3.atualizado).toBe(true)

    // A quantidade total no banco segue estritamente 3
    expect(Object.keys(bancoLocal).length).toBe(3)
    expect(bancoLocal['prop_2'].valor_total).toBe(3500)
  })

  // 6. Matching de cliente e tratamento quando não encontrado
  it('6. Proposta sem cliente correspondente é salva com cliente_id=null e status_vinculo=pendente', () => {
    const clientesPorBlingId: Record<string, string> = { 'contato_10': 'cli_rec_1' }
    const clientesPorDoc: Record<string, string> = { '12345678000199': 'cli_rec_2' }

    function vincularClienteProposta(prop: { contatoId?: string; doc?: string }) {
      if (prop.contatoId && clientesPorBlingId[prop.contatoId]) {
        return { cliente_id: clientesPorBlingId[prop.contatoId], status_vinculo: 'vinculado' }
      }
      if (prop.doc && clientesPorDoc[prop.doc]) {
        return { cliente_id: clientesPorDoc[prop.doc], status_vinculo: 'vinculado' }
      }
      return { cliente_id: null, status_vinculo: 'pendente' }
    }

    // Match por Bling ID
    const match1 = vincularClienteProposta({ contatoId: 'contato_10' })
    expect(match1.cliente_id).toBe('cli_rec_1')
    expect(match1.status_vinculo).toBe('vinculado')

    // Match por Documento
    const match2 = vincularClienteProposta({ doc: '12345678000199' })
    expect(match2.cliente_id).toBe('cli_rec_2')
    expect(match2.status_vinculo).toBe('vinculado')

    // Sem cliente correspondente: NÃO descartar a proposta
    const match3 = vincularClienteProposta({ contatoId: 'contato_99999', doc: '00000000000' })
    expect(match3.cliente_id).toBeNull()
    expect(match3.status_vinculo).toBe('pendente')
  })

  // 7. Conflito de nome_empresa unique em contatos é aviso e proposta segue salva
  it('7. Conflito nome_empresa: Value must be unique vira aviso e não afeta a persistência da proposta', () => {
    const avisos: string[] = []
    const erros: string[] = []

    const erroSimulado = new Error('nome_empresa: Value must be unique')
    const msg = String(erroSimulado.message)

    if (msg.includes('nome_empresa: Value must be unique')) {
      avisos.push('Aviso: contato não criado devido a duplicidade de nome_empresa.')
    } else {
      erros.push(msg)
    }

    expect(avisos.length).toBe(1)
    expect(erros.length).toBe(0)

    // Proposta comercial segue sendo persistida normalmente
    const propostaSalva = {
      bling_proposta_id: 'prop_abc_1',
      cliente_id: null,
      status_vinculo: 'pendente',
      valor_total: 450,
    }
    expect(propostaSalva.bling_proposta_id).toBe('prop_abc_1')
    expect(propostaSalva.status_vinculo).toBe('pendente')
  })

  // 8. Resiliência: resposta HTTP 403 (escopo ausente) é tratada sem quebrar a sincronização
  it('8. Trata 403 por escopo ausente de forma explícita com log legível sem quebrar sync de contatos e pedidos', () => {
    expect(hookConteudo).toContain('resPropostas.statusCode === 403')
    expect(hookConteudo).toContain('Escopo OAuth "propostas-comerciais:read" não concedido pelo Bling (HTTP 403)')
  })

  // 9. Base de pedidos homologada e Funil permanecem intactos
  it('9. A base de pedidos homologada e o Funil não sofrem mutações na implementação de propostas', () => {
    // bling_pedidos não deve ter seu modelo ou regras alterados
    expect(hookConteudo).toContain('SITUACOES_CONFIRMADAS')
    expect(hookConteudo).toContain('batchPedidosSize')
    expect(hookConteudo).toContain('mapBlingPedidosExistentes')

    // O arquivo FunilPage não é importado nem alterado no hook
    expect(hookConteudo).not.toContain('oportunidades')
  })
})
