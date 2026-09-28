import { describe, it, expect } from 'vitest'
import {
  normalizarChaveEmpresa,
  agruparEDeduplicarClientes,
  normalizarVendedor,
  normalizarStatusCliente,
  normalizarGrandeCliente,
  type ClienteImportItem,
} from '@/lib/clientes/clienteUtils'

describe('Normalização e Agrupamento de Clientes (Regras de Deduplicação)', () => {
  it('remove acentos, pontuações e sufixos societários comuns', () => {
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO LTDA')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO LT')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO LTD')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO S/A')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO ME')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO EIRELI')).toBe('EMPRESA EXEMPLO')
    expect(normalizarChaveEmpresa('EMPRESA EXEMPLO &amp; CIA LTDA')).toBe('EMPRESA EXEMPLO &')
  })

  it('agrupa registros similares com sufixos diferentes somando valores de compras e vendas', () => {
    const clientes: ClienteImportItem[] = [
      {
        nome_empresa: 'CERAMICA SANTO ANTONIO MELECIO LDTA',
        valor_total_compras: 800,
        valor_total_vendas: 1200,
        grande_cliente: 'nao',
        tipo_contato: 'cliente',
        vendedor: 'Renan',
        status_cliente: 'para_reativacao',
        data_primeira_compra: '2026-02-10',
        data_ultima_compra: '2026-05-15',
      },
      {
        nome_empresa: 'CERAMICA SANTO ANTONIO MELECIO LTDA',
        valor_total_compras: 200,
        valor_total_vendas: 800,
        grande_cliente: 'sim',
        tipo_contato: 'ambos',
        vendedor: 'Renan',
        status_cliente: 'ativo',
        data_primeira_compra: '2026-01-05',
        data_ultima_compra: '2026-09-20',
      },
    ]

    const agrupados = agruparEDeduplicarClientes(clientes)

    expect(agrupados.length).toBe(1)
    expect(agrupados[0].valor_total_compras).toBe(1000)
    expect(agrupados[0].valor_total_vendas).toBe(2000)
    // Se um era 'sim', grande_cliente deve ser 'sim'
    expect(agrupados[0].grande_cliente).toBe('sim')
    // Se houve reativação/ativo, status deve ser 'ativo'
    expect(agrupados[0].status_cliente).toBe('ativo')
    // Primeira compra mais antiga
    expect(agrupados[0].data_primeira_compra).toBe('2026-01-05')
    // Última compra mais recente
    expect(agrupados[0].data_ultima_compra).toBe('2026-09-20')
  })

  it('agrupa caso do requisito (terminação LT vs LTDA)', () => {
    const clientes: ClienteImportItem[] = [
      {
        nome_empresa: 'EMPRESA ALIMENTICIA BRASIL LT',
        valor_total_compras: 500,
        valor_total_vendas: 3000,
        grande_cliente: 'sim',
        tipo_contato: 'ambos',
        vendedor: 'Alice',
        status_cliente: 'ativo',
      },
      {
        nome_empresa: 'EMPRESA ALIMENTICIA BRASIL LTDA',
        valor_total_compras: 200,
        valor_total_vendas: 1500,
        grande_cliente: 'sim',
        tipo_contato: 'ambos',
        vendedor: 'Alice',
        status_cliente: 'ativo',
      },
    ]

    const agrupados = agruparEDeduplicarClientes(clientes)
    expect(agrupados.length).toBe(1)
    expect(agrupados[0].valor_total_compras).toBe(700)
    expect(agrupados[0].valor_total_vendas).toBe(4500)
    expect(agrupados[0].nome_empresa).toBe('EMPRESA ALIMENTICIA BRASIL LTDA')
  })

  it('normaliza vendedores corretamente', () => {
    expect(normalizarVendedor('Renan')).toBe('Renan')
    expect(normalizarVendedor('Alice')).toBe('Alice')
    expect(normalizarVendedor('Karoline (Vendas 1)')).toBe('Karoline (Vendas 1)')
    expect(normalizarVendedor('vendas 1')).toBe('Karoline (Vendas 1)')
    expect(normalizarVendedor('vendedor 2')).toBe('Vendas 2')
  })

  it('normaliza status_cliente corretamente', () => {
    expect(normalizarStatusCliente('ativo')).toBe('ativo')
    expect(normalizarStatusCliente('para_reativacao')).toBe('para_reativacao')
    expect(normalizarStatusCliente('reativacao')).toBe('para_reativacao')
    expect(normalizarGrandeCliente('sim')).toBe('sim')
    expect(normalizarGrandeCliente('nao')).toBe('nao')
  })

  it('gera relatório detalhado de agrupamento com nomes e linhas agrupadas', async () => {
    const { processarAgrupamentoClientes } = await import('@/lib/clientes/clienteUtils')
    const itens: ClienteImportItem[] = [
      {
        nome_empresa: 'POSTO EXEMPLO LTDA',
        valor_total_compras: 100,
        valor_total_vendas: 200,
        grande_cliente: 'nao',
        tipo_contato: 'cliente',
        vendedor: 'Renan',
        status_cliente: 'para_reativacao',
      },
      {
        nome_empresa: 'POSTO EXEMPLO LT',
        valor_total_compras: 50,
        valor_total_vendas: 80,
        grande_cliente: 'nao',
        tipo_contato: 'cliente',
        vendedor: 'Renan',
        status_cliente: 'para_reativacao',
      },
      {
        nome_empresa: 'OUTRA EMPRESA S/A',
        valor_total_compras: 300,
        valor_total_vendas: 400,
        grande_cliente: 'sim',
        tipo_contato: 'ambos',
        vendedor: 'Alice',
        status_cliente: 'ativo',
      },
    ]

    const resultado = processarAgrupamentoClientes(itens)
    expect(resultado.totalLinhasOriginais).toBe(3)
    expect(resultado.totalGruposFormados).toBe(2)
    expect(resultado.linhasAgrupadas).toBe(1)
    expect(resultado.gruposComMaisDeUmRegistro.length).toBe(1)
    expect(resultado.gruposComMaisDeUmRegistro[0].totalItens).toBe(2)
    expect(resultado.gruposComMaisDeUmRegistro[0].valorTotalVendas).toBe(280)
  })
})
