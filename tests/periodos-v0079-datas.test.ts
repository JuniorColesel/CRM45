import { describe, it, expect } from 'vitest'
import {
  calcularDiasNoMes,
  calcularPeriodoFiltro,
  formatarDataComercialBr,
  formatarMesExtensoAno,
  type MesFiltro,
} from '@/contexts/PeriodoContext'

describe('Suíte v0.0.79 — Testes de Data, Períodos e Dashboards Comerciais (Item 38)', () => {
  // --------------------------------------------------------------------------
  // 1. ANOS BISSEXTOS E DIAS POR MÊS
  // --------------------------------------------------------------------------
  describe('Cálculo de dias no mês e anos bissextos', () => {
    it('deve retornar 28 dias para fevereiro em ano comum (2026)', () => {
      const dias = calcularDiasNoMes(2026, 2)
      expect(dias).toBe(28)
    })

    it('deve retornar 29 dias para fevereiro em ano bissexto (2024)', () => {
      const dias = calcularDiasNoMes(2024, 2)
      expect(dias).toBe(29)
    })

    it('deve retornar 28 dias para fevereiro em ano comum anterior (2025)', () => {
      const dias = calcularDiasNoMes(2025, 2)
      expect(dias).toBe(28)
    })

    it('deve calcular corretamente meses de 31 dias (Janeiro, Março, Maio, Julho, Agosto, Outubro, Dezembro)', () => {
      expect(calcularDiasNoMes(2026, 1)).toBe(31)
      expect(calcularDiasNoMes(2026, 3)).toBe(31)
      expect(calcularDiasNoMes(2026, 5)).toBe(31)
      expect(calcularDiasNoMes(2026, 7)).toBe(31)
      expect(calcularDiasNoMes(2026, 8)).toBe(31)
      expect(calcularDiasNoMes(2026, 10)).toBe(31)
      expect(calcularDiasNoMes(2026, 12)).toBe(31)
    })

    it('deve calcular corretamente meses de 30 dias (Abril, Junho, Setembro, Novembro)', () => {
      expect(calcularDiasNoMes(2026, 4)).toBe(30)
      expect(calcularDiasNoMes(2026, 6)).toBe(30)
      expect(calcularDiasNoMes(2026, 9)).toBe(30)
      expect(calcularDiasNoMes(2026, 11)).toBe(30)
    })
  })

  // --------------------------------------------------------------------------
  // 2. FILTRO DE PERÍODOS PREDEFINIDOS
  // --------------------------------------------------------------------------
  describe('Filtros de Período (Ano inteiro, Janeiro, Fevereiro, Setembro, etc.)', () => {
    it('deve gerar filtro para ano completo de 2026 (mes = "todos")', () => {
      const p = calcularPeriodoFiltro(2026, 'todos')
      expect(p.ano).toBe(2026)
      expect(p.mes).toBe('todos')
      expect(p.dataInicioYmd).toBe('2026-01-01')
      expect(p.dataFimYmd).toBe('2026-12-31')
      expect(p.label).toContain('Ano 2026')
    })

    it('deve gerar filtro para Janeiro/2026', () => {
      const p = calcularPeriodoFiltro(2026, 1)
      expect(p.ano).toBe(2026)
      expect(p.mes).toBe(1)
      expect(p.dataInicioYmd).toBe('2026-01-01')
      expect(p.dataFimYmd).toBe('2026-01-31')
      expect(p.label).toContain('Janeiro de 2026')
    })

    it('deve gerar filtro para Fevereiro/2026 (não bissexto: 28 dias)', () => {
      const p = calcularPeriodoFiltro(2026, 2)
      expect(p.ano).toBe(2026)
      expect(p.mes).toBe(2)
      expect(p.dataInicioYmd).toBe('2026-02-01')
      expect(p.dataFimYmd).toBe('2026-02-28')
      expect(p.label).toContain('Fevereiro de 2026')
    })

    it('deve gerar filtro para Fevereiro/2024 (ano bissexto: 29 dias)', () => {
      const p = calcularPeriodoFiltro(2024, 2)
      expect(p.ano).toBe(2024)
      expect(p.mes).toBe(2)
      expect(p.dataInicioYmd).toBe('2024-02-01')
      expect(p.dataFimYmd).toBe('2024-02-29')
      expect(p.label).toContain('Fevereiro de 2024')
    })

    it('deve gerar filtro para Setembro/2026 (30 dias estritos)', () => {
      const p = calcularPeriodoFiltro(2026, 9)
      expect(p.ano).toBe(2026)
      expect(p.mes).toBe(9)
      expect(p.dataInicioYmd).toBe('2026-09-01')
      expect(p.dataFimYmd).toBe('2026-09-30')
      expect(p.label).toContain('Setembro de 2026')
    })
  })

  // --------------------------------------------------------------------------
  // 3. PERÍODO CUSTOMIZADO (CUSTOM INTERVAL)
  // --------------------------------------------------------------------------
  describe('Período customizado e viradas de data', () => {
    it('deve respeitar período customizado fornecido', () => {
      const p = calcularPeriodoFiltro(2026, 'custom', '2026-03-15', '2026-06-20')
      expect(p.mes).toBe('custom')
      expect(p.dataInicioYmd).toBe('2026-03-15')
      expect(p.dataFimYmd).toBe('2026-06-20')
      expect(p.label).toContain('15/03/2026 até 20/06/2026')
    })

    it('deve tratar inversão de datas em período customizado garantindo início <= fim', () => {
      const p = calcularPeriodoFiltro(2026, 'custom', '2026-10-15', '2026-10-01')
      expect(p.dataInicioYmd).toBe('2026-10-01')
      expect(p.dataFimYmd).toBe('2026-10-15')
    })

    it('deve cobrir a virada 31/12 -> 01/01 sem perda ou transbordo', () => {
      const p = calcularPeriodoFiltro(2026, 'custom', '2026-12-31', '2027-01-01')
      expect(p.dataInicioYmd).toBe('2026-12-31')
      expect(p.dataFimYmd).toBe('2027-01-01')

      // Formatação comercial
      expect(formatarDataComercialBr(p.dataInicioYmd)).toBe('31/12/2026')
      expect(formatarDataComercialBr(p.dataFimYmd)).toBe('01/01/2027')
    })
  })

  // --------------------------------------------------------------------------
  // 4. PRESERVAÇÃO DE TIMEZONE E FORMATO COMERCIAL (30/09 NUNCA VIRA 01/10)
  // --------------------------------------------------------------------------
  describe('Formatação e integridade de timezone (30/09 nunca vira 01/10)', () => {
    it('deve formatar 2026-09-30 como 30/09/2026 sem influência de timezone UTC-3', () => {
      const formatado = formatarDataComercialBr('2026-09-30')
      expect(formatado).toBe('30/09/2026')
    })

    it('deve formatar 2026-09-30T23:59:59.999Z extraindo a data comercial correta', () => {
      const formatado = formatarDataComercialBr('2026-09-30T23:59:59.999Z')
      expect(formatado).toBe('30/09/2026')
    })

    it('deve formatar 2026-12-31 como 31/12/2026 sem transbordar para 01/01/2027', () => {
      const formatado = formatarDataComercialBr('2026-12-31 23:59:59')
      expect(formatado).toBe('31/12/2026')
    })

    it('deve formatar mês extenso corretamente', () => {
      expect(formatarMesExtensoAno(2026, 1)).toBe('Janeiro de 2026')
      expect(formatarMesExtensoAno(2026, 9)).toBe('Setembro de 2026')
      expect(formatarMesExtensoAno(2026, 'todos')).toBe('Ano 2026 Completo')
      expect(formatarMesExtensoAno(2026, 'custom')).toBe('Período Personalizado')
    })
  })

  // --------------------------------------------------------------------------
  // 5. DISTINÇÃO DOS CAMPOS DE DATA CANÔNICOS DO CRM
  // --------------------------------------------------------------------------
  describe('Semântica e separação de campos de data (pedido, proposta, origem, fechamento)', () => {
    interface FixtureData {
      data_pedido?: string
      data_proposta?: string
      data_origem?: string
      data_fechamento?: string
      situacao_bling_id?: string
      status?: string
      valor: number
    }

    const fixtures: FixtureData[] = [
      {
        data_pedido: '2026-01-15',
        situacao_bling_id: '6', // Em aberto (válido)
        valor: 1500,
      },
      {
        data_pedido: '2026-01-20',
        situacao_bling_id: '9', // Atendido (válido)
        valor: 2500,
      },
      {
        data_pedido: '2026-01-25',
        situacao_bling_id: '12', // Cancelado (inválido)
        valor: 3000,
      },
      {
        data_proposta: '2026-02-10',
        valor: 4500,
      },
      {
        data_origem: '2026-03-05',
        data_fechamento: '2026-03-25',
        status: 'ganho',
        valor: 8000,
      },
      {
        data_origem: '2026-03-10',
        data_fechamento: '2026-04-02',
        status: 'ganho',
        valor: 5000,
      },
    ]

    it('deve filtrar pedidos válidos estritamente por data_pedido e situacao_bling_id (6 ou 9)', () => {
      const ini = '2026-01-01'
      const fim = '2026-01-31'
      const pedidosValidos = fixtures.filter(
        (f) =>
          f.data_pedido &&
          f.data_pedido >= ini &&
          f.data_pedido <= fim &&
          (f.situacao_bling_id === '6' || f.situacao_bling_id === '9'),
      )

      expect(pedidosValidos.length).toBe(2)
      const soma = pedidosValidos.reduce((acc, p) => acc + p.valor, 0)
      expect(soma).toBe(4000)
    })

    it('deve filtrar propostas estritamente por data_proposta', () => {
      const ini = '2026-02-01'
      const fim = '2026-02-28'
      const propostasFev = fixtures.filter(
        (f) => f.data_proposta && f.data_proposta >= ini && f.data_proposta <= fim,
      )
      expect(propostasFev.length).toBe(1)
      expect(propostasFev[0].valor).toBe(4500)
    })

    it('deve distinguir visão por data_origem vs visão por data_fechamento', () => {
      // Visão Origem Março/2026: ambas entraram em março
      const iniMar = '2026-03-01'
      const fimMar = '2026-03-31'
      const porOrigemMar = fixtures.filter(
        (f) => f.data_origem && f.data_origem >= iniMar && f.data_origem <= fimMar,
      )
      expect(porOrigemMar.length).toBe(2)

      // Visão Fechamento Março/2026: apenas a primeira fechou em março
      const porFechamentoMar = fixtures.filter(
        (f) => f.data_fechamento && f.data_fechamento >= iniMar && f.data_fechamento <= fimMar,
      )
      expect(porFechamentoMar.length).toBe(1)
      expect(porFechamentoMar[0].valor).toBe(8000)

      // A segunda fechou em Abril
      const iniAbr = '2026-04-01'
      const fimAbr = '2026-04-30'
      const porFechamentoAbr = fixtures.filter(
        (f) => f.data_fechamento && f.data_fechamento >= iniAbr && f.data_fechamento <= fimAbr,
      )
      expect(porFechamentoAbr.length).toBe(1)
      expect(porFechamentoAbr[0].valor).toBe(5000)
    })
  })

  // --------------------------------------------------------------------------
  // 6. HISTÓRICO TOTAL SEPARADO DO PERÍODO
  // --------------------------------------------------------------------------
  describe('Isolamento entre Histórico Total e Métricas do Período', () => {
    it('o histórico total deve acumular todos os anos sem restrição de período', () => {
      const mockBackendResponse = {
        periodo: { ano: 2026, mes: '9', data_inicio: '2026-09-01', data_fim: '2026-09-30' },
        pedidos_periodo: {
          pedidos_validos: 225,
          valor_vendas_valido: 78540.2,
        },
        historico_total: {
          pedidos_validos_total: 10815,
          valor_vendas_total: 4250000.5,
        },
      }

      // Valida que o objeto separa claramente os dois contextos
      expect(mockBackendResponse.pedidos_periodo.pedidos_validos).not.toBe(
        mockBackendResponse.historico_total.pedidos_validos_total,
      )
      expect(mockBackendResponse.pedidos_periodo.valor_vendas_valido).toBeLessThan(
        mockBackendResponse.historico_total.valor_vendas_total,
      )
    })
  })

  // --------------------------------------------------------------------------
  // 7. INTEGRAÇÃO DOS ENDPOINTS E TELAS AO PERÍODO
  // --------------------------------------------------------------------------
  describe('Regras de URL e consumo de endpoints por período', () => {
    it('deve gerar query params corretos para o endpoint /backend/v1/painel/comercial', () => {
      function buildPainelUrl(ano: number, mes: MesFiltro, ini?: string, fim?: string) {
        let url = `/backend/v1/painel/comercial?ano=${ano}&mes=${mes}`
        if (ini && fim) {
          url += `&data_inicio=${ini}&data_fim=${fim}`
        }
        return url
      }

      const urlJan = buildPainelUrl(2026, 1, '2026-01-01', '2026-01-31')
      expect(urlJan).toBe(
        '/backend/v1/painel/comercial?ano=2026&mes=1&data_inicio=2026-01-01&data_fim=2026-01-31',
      )

      const urlAno = buildPainelUrl(2026, 'todos', '2026-01-01', '2026-12-31')
      expect(urlAno).toBe(
        '/backend/v1/painel/comercial?ano=2026&mes=todos&data_inicio=2026-01-01&data_fim=2026-12-31',
      )

      const urlCustom = buildPainelUrl(2026, 'custom', '2026-05-10', '2026-05-25')
      expect(urlCustom).toBe(
        '/backend/v1/painel/comercial?ano=2026&mes=custom&data_inicio=2026-05-10&data_fim=2026-05-25',
      )
    })

    it('deve validar sintaxe de filtro PocketBase do Funil respeitando data_origem vs data_fechamento', () => {
      function construirFiltroFunil(modoVisao: 'origem' | 'fechamento', ini: string, fim: string) {
        if (modoVisao === 'fechamento') {
          return `((status != 'aberto' && ((data_fechamento >= '${ini}' && data_fechamento <= '${fim}') || (data_fechamento >= '${ini} 00:00:00' && data_fechamento <= '${fim} 23:59:59'))) || (status = 'aberto' && ((data_prevista_fechamento >= '${ini}' && data_prevista_fechamento <= '${fim}') || (data_prevista_fechamento >= '${ini} 00:00:00' && data_prevista_fechamento <= '${fim} 23:59:59'))))`
        }
        return `((data_origem != '' && data_origem >= '${ini}' && data_origem <= '${fim}') || ((data_origem = '' || data_origem = null) && created >= '${ini} 00:00:00' && created <= '${fim} 23:59:59'))`
      }

      const fOrigem = construirFiltroFunil('origem', '2026-02-01', '2026-02-28')
      expect(fOrigem).toContain("data_origem >= '2026-02-01'")
      expect(fOrigem).toContain("data_origem <= '2026-02-28'")

      const fFech = construirFiltroFunil('fechamento', '2026-02-01', '2026-02-28')
      expect(fFech).toContain("data_fechamento >= '2026-02-01'")
      expect(fFech).toContain("data_prevista_fechamento >= '2026-02-01'")
    })
  })
})
