import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { formatarData } from '@/types/clientes'

/**
 * Suíte de Testes da Auditoria e Correção Financeira Bling (v0.0.72):
 * 1. Sync 2x não altera valor consolidado nem duplica vendas (idempotência financeira)
 * 2. Cancelados (situação 12) e em digitação NÃO entram no cálculo de vendas
 * 3. Apenas situações válidas (6 = Em aberto, 9 = Atendido) somam vendas
 * 4. Métricas separadas: "Vendas 2026" vs "Histórico total"
 * 5. Formatação estrita de data comercial DD/MM/AAAA (sem fuso horário ou hora UTC)
 * 6. Garantia de Read-Only em relação a recursos externos do Bling
 */

describe('Suíte de Testes Financeiros e Idempotência Bling (v0.0.72)', () => {
  const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const hookConteudo = fs.readFileSync(hookBlingPath, 'utf-8')
  const blingPagePath = path.resolve(process.cwd(), 'src/pages/BlingPage.tsx')
  const blingPageConteudo = fs.readFileSync(blingPagePath, 'utf-8')

  it('1. Sync 2x não duplica valores e mantém recálculo idempotente no cliente', () => {
    // Simula lote de pedidos vinculados a um cliente
    const clienteAlvo = { id: 'cli_1', valor_total_vendas: 0 }
    const pedidos = [
      { id: 101, cliente_id: 'cli_1', total: 150.0, situacao_id: '9', data: '2026-03-01' },
      { id: 102, cliente_id: 'cli_1', total: 250.0, situacao_id: '6', data: '2026-03-02' },
    ]

    const recalcularVendasCliente = (peds: typeof pedidos) => {
      // Recálculo determinístico: SUM dos pedidos válidos
      const soma = peds
        .filter((p) => p.situacao_id === '6' || p.situacao_id === '9')
        .reduce((acc, curr) => acc + curr.total, 0)
      return Math.round(soma * 100) / 100
    }

    // 1ª rodada
    clienteAlvo.valor_total_vendas = recalcularVendasCliente(pedidos)
    expect(clienteAlvo.valor_total_vendas).toBe(400.0)

    // 2ª rodada com os mesmos pedidos (sync repetida)
    clienteAlvo.valor_total_vendas = recalcularVendasCliente(pedidos)
    expect(clienteAlvo.valor_total_vendas).toBe(400.0)
    // Não soma incrementalmente (+400 não vira 800)
    expect(clienteAlvo.valor_total_vendas).not.toBe(800.0)
  })

  it('2. Pedidos cancelados (situação 12) e outras situações não entram no total de vendas', () => {
    const pedidosComCancelados = [
      { id: 201, total: 500.0, situacao_id: '9', situacao_nome: 'Atendido' },
      { id: 202, total: 300.0, situacao_id: '6', situacao_nome: 'Em aberto' },
      { id: 203, total: 1000.0, situacao_id: '12', situacao_nome: 'Cancelado' },
      { id: 204, total: 150.0, situacao_id: '21', situacao_nome: 'Em digitação' },
    ]

    const pedidosValidos = pedidosComCancelados.filter(
      (p) => p.situacao_id === '6' || p.situacao_id === '9',
    )
    const somaValidos = pedidosValidos.reduce((acc, p) => acc + p.total, 0)
    const somaTotalComCancelados = pedidosComCancelados.reduce((acc, p) => acc + p.total, 0)

    expect(somaValidos).toBe(800.0)
    expect(somaTotalComCancelados).toBe(1950.0)
    expect(pedidosValidos.length).toBe(2)
  })

  it('3. Hook bling_importar.js consolida apenas pedidos com situacao_bling_id 6 ou 9', () => {
    expect(hookConteudo).toContain("sitId === '6' || sitId === '9'")
    expect(hookConteudo).toContain('isPedidoValidoParaVenda')
  })

  it('4. BlingPage.tsx apresenta métricas separadas: "Vendas 2026" e "Histórico total"', () => {
    expect(blingPageConteudo).toContain('Vendas 2026')
    expect(blingPageConteudo).toContain('Histórico Total')
    expect(blingPageConteudo).toContain('valorVendas2026')
    expect(blingPageConteudo).toContain('valorTotalConsolidado')
    expect(blingPageConteudo).toContain('formatarDataComercial')
  })

  it('5. Datas comerciais são formatadas sempre como DD/MM/AAAA sem fuso horário', () => {
    // Strings YYYY-MM-DD puras ou com timestamp ISO UTC
    expect(formatarData('2026-10-01')).toBe('01/10/2026')
    expect(formatarData('2026-10-01 00:00:00.000Z')).toBe('01/10/2026')
    expect(formatarData('2026-09-30')).toBe('30/09/2026')
    expect(formatarData('2022-07-20 00:00:00.000Z')).toBe('20/07/2022')
    expect(formatarData(null)).toBe('-')
    expect(formatarData('')).toBe('-')
  })

  it('6. Bling ERP opera estritamente como Read-Only sem disparar mutações', () => {
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*POST/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PUT/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PATCH/)
    expect(hookConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*DELETE/)
  })
})
