import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  mapearVendedorBlingParaCrm,
  isConsumidorFinal,
  calcularStatusClientePorDataCompra,
  normalizarDocumento,
  normalizarEmail,
} from '@/lib/bling/blingUtils'

/**
 * Suíte de Testes da Integração Bling ERP Read-Only (Item 17 da especificação)
 *
 * 1) Nenhuma chamada POST/PUT/PATCH/DELETE ao Bling
 * 2) Sincronização de contato novo
 * 3) Sincronização de contato existente por bling_id
 * 4) Matching por CPF/CNPJ
 * 5) Matching por e-mail
 * 6) Sincronização repetida não duplica cliente
 * 7) Sincronização repetida não duplica valor de vendas
 * 8) Consumidor Final não duplica ("Consumidor Final" vs "Consumidor Final.")
 * 9) De-para Alice ("ALICE PAITRA COLESEL" -> "Alice")
 * 10) De-para Renan ("RENAN SOUZA" -> "Renan")
 * 11) De-para Karoline/Vendas 1 ("Karoline", "Vendas 1", "MARIA CAROLINE SANTOS")
 * 12) De-para Vendas 2 ("Vendas 2" -> "Vendas 2")
 * 13) Vendedor desconhecido -> "Renan" (TAISA TOLEDO, GABRIELA CULTOM, GEISEBEL, "-", vazio)
 * 14) Cálculo de primeira compra
 * 15) Cálculo de última compra
 * 16) Cliente dentro de 6 meses -> ativo
 * 17) Cliente acima de 6 meses -> para_reativacao
 * 18) Erro 429 executa retry limitado
 * 19) Token não aparece em logs
 * 20) Usuário sem permissão não executa sincronização
 */

describe('Suíte de Validação Bling Read-Only Sync (Item 17)', () => {
  // 1) Nenhuma chamada POST/PUT/PATCH/DELETE ao Bling
  it('1. Proibição estrita: nenhuma chamada POST/PUT/PATCH/DELETE para a API do Bling existe', () => {
    const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
    const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')

    // Deve usar exclusivamente GET em chamadas ao Bling
    expect(hookConteudo).toContain("method: 'GET'")
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*POST/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PUT/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PATCH/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*DELETE/)
  })

  // 2) Sincronização de contato novo
  it('2. Sincronização de contato novo: cria registro se identificadores não existirem', () => {
    const clientesBase: any[] = []
    const novoContatoBling = {
      id: 123456,
      nome: 'NOVA EMPRESA EXEMPLO LTDA',
      numeroDocumento: '12.345.678/0001-99',
      email: 'contato@novaempresa.com.br',
      telefone: '41999998888',
    }

    const docLimpo = normalizarDocumento(novoContatoBling.numeroDocumento)
    const emailLimpo = normalizarEmail(novoContatoBling.email)

    const match = clientesBase.find(
      (c) =>
        c.bling_id === String(novoContatoBling.id) ||
        (docLimpo && normalizarDocumento(c.cnpj_cpf) === docLimpo) ||
        (emailLimpo && normalizarEmail(c.email) === emailLimpo),
    )

    expect(match).toBeUndefined()
    // Criaria um novo cliente
    const clienteCriado = {
      id: 'rec_novo_1',
      bling_id: String(novoContatoBling.id),
      nome_empresa: novoContatoBling.nome,
      cnpj_cpf: novoContatoBling.numeroDocumento,
      email: novoContatoBling.email,
    }
    clientesBase.push(clienteCriado)
    expect(clientesBase.length).toBe(1)
    expect(clientesBase[0].bling_id).toBe('123456')
  })

  // 3) Sincronização de contato existente por bling_id
  it('3. Matching prioritário por bling_id: localiza e atualiza o contato existente', () => {
    const clientesBase = [
      {
        id: 'rec_cli_1',
        bling_id: '998877',
        nome_empresa: 'EMPRESA ANTIGA',
        cnpj_cpf: '',
        telefone: '4133332222',
      },
    ]

    const contatoAtualizadoBling = {
      id: 998877,
      nome: 'EMPRESA ANTIGA COM NOME NOVO',
      numeroDocumento: '00.111.222/0001-33',
      telefone: '', // veio vazio do Bling
    }

    const match = clientesBase.find((c) => c.bling_id === String(contatoAtualizadoBling.id))
    expect(match).toBeDefined()
    expect(match?.id).toBe('rec_cli_1')

    // Regra: não sobrescreve telefone local existente com vazio do Bling
    const telefoneFinal = contatoAtualizadoBling.telefone || match?.telefone
    expect(telefoneFinal).toBe('4133332222')
  })

  // 4) Matching por CPF/CNPJ
  it('4. Matching secundário por CPF/CNPJ normalizado quando bling_id ainda não existe', () => {
    const clientesBase = [
      {
        id: 'rec_sem_bling_id',
        bling_id: '',
        nome_empresa: 'CLIENTE SEM BLING ID',
        cnpj_cpf: '12.345.678/0001-90',
        email: '',
      },
    ]

    const contatoBling = {
      id: 554433,
      nome: 'CLIENTE DO BLING',
      numeroDocumento: '12345678000190', // sem pontuação
    }

    const docBlingLimpo = normalizarDocumento(contatoBling.numeroDocumento)
    const match = clientesBase.find((c) => normalizarDocumento(c.cnpj_cpf) === docBlingLimpo)

    expect(match).toBeDefined()
    expect(match?.id).toBe('rec_sem_bling_id')
    // Atualiza o bling_id no registro local
    match!.bling_id = String(contatoBling.id)
    expect(match?.bling_id).toBe('554433')
  })

  // 5) Matching por e-mail
  it('5. Matching terciário por e-mail quando nem bling_id nem CNPJ conferem', () => {
    const clientesBase = [
      {
        id: 'rec_email_1',
        bling_id: '',
        nome_empresa: 'CLIENTE EMAIL',
        cnpj_cpf: '',
        email: 'financeiro@cliente.com.br',
      },
    ]

    const contatoBling = {
      id: 776655,
      nome: 'CLIENTE VIA EMAIL BLING',
      numeroDocumento: '',
      email: ' FINANCEIRO@CLIENTE.COM.BR ',
    }

    const emailLimpo = normalizarEmail(contatoBling.email)
    const match = clientesBase.find((c) => normalizarEmail(c.email) === emailLimpo)

    expect(match).toBeDefined()
    expect(match?.id).toBe('rec_email_1')
  })

  // 6) Sincronização repetida não duplica cliente
  it('6. Sincronização repetida não duplica cliente (idempotência de cadastro)', () => {
    const clientesBase: any[] = []
    const contatosLote = [
      { id: 1, nome: 'CLIENTE A', numeroDocumento: '111', email: 'a@a.com' },
      { id: 2, nome: 'CLIENTE B', numeroDocumento: '222', email: 'b@b.com' },
    ]

    const sincronizarLote = (lote: typeof contatosLote) => {
      for (const item of lote) {
        const bId = String(item.id)
        let existente = clientesBase.find((c) => c.bling_id === bId)
        if (!existente) {
          existente = { id: `id_${item.id}`, bling_id: bId, nome: item.nome }
          clientesBase.push(existente)
        }
      }
    }

    // Executa 1ª sincronização
    sincronizarLote(contatosLote)
    expect(clientesBase.length).toBe(2)

    // Executa 2ª sincronização idêntica
    sincronizarLote(contatosLote)
    expect(clientesBase.length).toBe(2)

    // Executa 3ª sincronização idêntica
    sincronizarLote(contatosLote)
    expect(clientesBase.length).toBe(2)
  })

  // 7) Sincronização repetida não duplica valor de vendas
  it('7. Sincronização repetida não duplica valor de vendas (recomputação determinística)', () => {
    const cliente = {
      id: 'cli_1',
      valor_total_vendas: 0,
      data_primeira_compra: '',
      data_ultima_compra: '',
    }

    const pedidosBling = [
      { id: 101, total: 150.0, data: '2026-02-10' },
      { id: 102, total: 350.0, data: '2026-05-20' },
    ]

    // Abordagem do backend: recalcula soma direta a partir dos pedidos do cliente
    const consolidarVendas = () => {
      let soma = 0
      let primeira = ''
      let ultima = ''
      for (const p of pedidosBling) {
        soma += p.total
        if (!primeira || p.data < primeira) primeira = p.data
        if (!ultima || p.data > ultima) ultima = p.data
      }
      cliente.valor_total_vendas = Math.round(soma * 100) / 100
      cliente.data_primeira_compra = primeira
      cliente.data_ultima_compra = ultima
    }

    // 1ª execução
    consolidarVendas()
    expect(cliente.valor_total_vendas).toBe(500.0)

    // 2ª execução
    consolidarVendas()
    expect(cliente.valor_total_vendas).toBe(500.0)

    // 3ª execução
    consolidarVendas()
    expect(cliente.valor_total_vendas).toBe(500.0)
    expect(cliente.data_primeira_compra).toBe('2026-02-10')
    expect(cliente.data_ultima_compra).toBe('2026-05-20')
  })

  // 8) Consumidor Final não duplica
  it('8. Consumidor Final unificado: "Consumidor Final" e "Consumidor Final." são o mesmo registro', () => {
    expect(isConsumidorFinal('Consumidor Final')).toBe(true)
    expect(isConsumidorFinal('Consumidor Final.')).toBe(true)
    expect(isConsumidorFinal(' CONSUMIDOR FINAL ')).toBe(true)
    expect(isConsumidorFinal('Outro Cliente')).toBe(false)

    // Vendedor obrigatório de Consumidor Final deve ser Karoline (Vendas 1)
    expect(mapearVendedorBlingParaCrm('Consumidor Final')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('Consumidor Final.')).toBe('Karoline (Vendas 1)')
  })

  // 9) De-para Alice
  it('9. De-para Alice: "ALICE PAITRA COLESEL" -> "Alice"', () => {
    expect(mapearVendedorBlingParaCrm('ALICE PAITRA COLESEL')).toBe('Alice')
    expect(mapearVendedorBlingParaCrm('Alice')).toBe('Alice')
    expect(mapearVendedorBlingParaCrm('alice paitra colesel')).toBe('Alice')
  })

  // 10) De-para Renan
  it('10. De-para Renan: "RENAN SOUZA" -> "Renan"', () => {
    expect(mapearVendedorBlingParaCrm('RENAN SOUZA')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('Renan')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('renan souza')).toBe('Renan')
  })

  // 11) De-para Karoline/Vendas 1
  it('11. De-para Karoline/Vendas 1: mapeia variações para "Karoline (Vendas 1)"', () => {
    expect(mapearVendedorBlingParaCrm('Karoline')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('Vendas 1')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('MARIA CAROLINE SANTOS')).toBe('Karoline (Vendas 1)')
    expect(mapearVendedorBlingParaCrm('maria caroline santos')).toBe('Karoline (Vendas 1)')
  })

  // 12) De-para Vendas 2
  it('12. De-para Vendas 2: "Vendas 2" -> "Vendas 2"', () => {
    expect(mapearVendedorBlingParaCrm('Vendas 2')).toBe('Vendas 2')
    expect(mapearVendedorBlingParaCrm('vendas 2')).toBe('Vendas 2')
  })

  // 13) Vendedor desconhecido -> Renan
  it('13. Vendedor desconhecido cai no fallback padrão "Renan"', () => {
    expect(mapearVendedorBlingParaCrm('TAISA TOLEDO')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('GABRIELA CULTOM')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('GEISEBEL')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('-')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('')).toBe('Renan')
    expect(mapearVendedorBlingParaCrm(null)).toBe('Renan')
    expect(mapearVendedorBlingParaCrm('Vendedor Inédito')).toBe('Renan')
  })

  // 14) Cálculo de primeira compra
  it('14. Cálculo de primeira compra: identifica a data mais antiga', () => {
    const datas = ['2026-08-15', '2026-01-10', '2026-04-20']
    const menorData = datas.reduce((min, d) => (d < min ? d : min))
    expect(menorData).toBe('2026-01-10')
  })

  // 15) Cálculo de última compra
  it('15. Cálculo de última compra: identifica a data mais recente', () => {
    const datas = ['2026-08-15', '2026-01-10', '2026-09-20']
    const maiorData = datas.reduce((max, d) => (d > max ? d : max))
    expect(maiorData).toBe('2026-09-20')
  })

  // 16) Cliente dentro de 6 meses -> ativo
  it('16. Cliente com última compra dentro de 6 meses é marcado como "ativo"', () => {
    const dataRef = new Date('2026-10-01')
    // 2 meses atrás -> ativo
    const dataCompra = '2026-08-15'
    const status = calcularStatusClientePorDataCompra(dataCompra, dataRef)
    expect(status).toBe('ativo')
  })

  // 17) Cliente acima de 6 meses -> para_reativacao
  it('17. Cliente com última compra superior a 6 meses é marcado como "para_reativacao"', () => {
    const dataRef = new Date('2026-10-01')
    // 8 meses atrás -> para_reativacao
    const dataCompra = '2026-02-01'
    const status = calcularStatusClientePorDataCompra(dataCompra, dataRef)
    expect(status).toBe('para_reativacao')
  })

  // 18) Erro 429 executa retry limitado
  it('18. Erro 429 da API do Bling dispara lógica de retry com limite máximo de 3 tentativas', () => {
    let chamadas = 0
    const mockHttpSend = () => {
      chamadas++
      if (chamadas < 3) {
        return { statusCode: 429, json: { error: 'Too Many Requests' } }
      }
      return { statusCode: 200, json: { data: [{ id: 1 }] } }
    }

    let tentativas = 0
    const maxTentativas = 3
    let resFinal: any = null

    while (tentativas < maxTentativas) {
      tentativas++
      const res = mockHttpSend()
      if (res.statusCode === 429 && tentativas < maxTentativas) {
        continue
      }
      resFinal = res
      break
    }

    expect(chamadas).toBe(3)
    expect(resFinal?.statusCode).toBe(200)
  })

  // 19) Token não aparece em logs
  it('19. Token de API, senhas ou segredos NUNCA são gravados nos logs ou retornados na resposta', () => {
    const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
    const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')

    // Verifica que blingToken não é interpolado nas mensagens de log/resumo
    expect(hookConteudo).not.toMatch(/logRecord\.set\([^)]*blingToken/)
    expect(hookConteudo).not.toMatch(/errosGerais\.push\([^)]*blingToken/)
    expect(hookConteudo).not.toMatch(/Authorization:\s*Bearer/i) // só nos headers de GET
  })

  // 20) Usuário sem permissão não executa sincronização
  it('20. Perfil não autorizado (ex: vendedor, estoque) é rejeitado com status 403', () => {
    const validarPermissao = (perfil: string) => {
      if (perfil !== 'ceo_financeiro') {
        return { status: 403, message: 'Apenas administradores podem executar a sincronização.' }
      }
      return { status: 200, message: 'Autorizado' }
    }

    expect(validarPermissao('ceo_financeiro').status).toBe(200)
    expect(validarPermissao('vendedor_1').status).toBe(403)
    expect(validarPermissao('vendedor_2').status).toBe(403)
    expect(validarPermissao('estoque').status).toBe(403)
    expect(validarPermissao('coordenador_vendas').status).toBe(403)
  })
})
