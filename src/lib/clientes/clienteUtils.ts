/**
 * Utilitários para normalização, deduplicação e agrupamento de clientes.
 * Regra do usuário:
 * "usar nome_empresa como chave de deduplicação; se houver nomes muito parecidos,
 *  agrupar como um único registro somando os valores".
 * Agrupamento de nomes muito parecidos que diferem apenas por sufixos societários
 * (ex.: terminações "LT", "LTDA", "ME", "EPP", "S/A", "EIRELI", etc. — tratar como um único registro somando os valores numéricos).
 */

export interface ClienteImportItem {
  nome_empresa: string
  nome_contato?: string
  cnpj_cpf?: string
  telefone?: string
  email?: string
  cidade?: string
  estado?: string
  data_ultima_compra?: string
  data_primeira_compra?: string
  valor_total_compras: number
  valor_total_vendas: number
  grande_cliente: 'sim' | 'nao'
  tipo_contato: 'cliente' | 'fornecedor' | 'ambos'
  vendedor: 'Alice' | 'Renan' | 'Karoline (Vendas 1)' | 'Vendas 2'
  status_cliente: 'ativo' | 'para_reativacao'
}

export interface AgrupamentoResultado {
  clientes: ClienteImportItem[]
  totalLinhasOriginais: number
  totalGruposFormados: number
  linhasAgrupadas: number
  gruposComMaisDeUmRegistro: Array<{
    chave: string
    nomeFinal: string
    totalItens: number
    nomesOriginais: string[]
    valorTotalVendas: number
    valorTotalCompras: number
  }>
}

/**
 * Normaliza o nome da empresa para detecção de duplicatas e sufixos societários.
 * Converte para maiúsculas, remove pontuações, normaliza espaços,
 * decodifica entidades comuns (como &amp;) e remove sufixos empresariais/societários
 * como LTDA, LTD, LT, EIRELI, ME, EPP, SA, S/A, CIA, SS, etc.
 */
export function normalizarChaveEmpresa(nome: string): string {
  if (!nome) return ''

  let n = nome
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .trim()

  // Remove caracteres pontuais comuns que não alteram a identidade
  n = n.replace(/[.,\-/\\#()[\]]/g, ' ')

  // Lista de sufixos societários comuns no Brasil para remover
  // Ex: "LTDA", "LTD", "LT", "LDTA", "EIRELI", "EPP", "ME", "S/A", "S.A", "S A", "SA", "CIA", "SOCIEDADE ANONIMA", "SS", "EPP"
  // Remove repetidamente do final enquanto houver combinações como "LTDA - ME", "LTDA EPP", "S/A", etc.
  const regexSufixosFim =
    /\b(LTDA|LTD|LT|LDTA|EIRELI|EPP|ME|SA|S\s*A|SOCIEDADE\s*ANONIMA|CIA|COMPANHIA|SS|S\s*\/\s*S|MICROEMPRESA)\b\s*$/i

  let mudou = true
  while (mudou) {
    const anterior = n
    n = n.replace(regexSufixosFim, '').trim()
    mudou = n !== anterior
  }

  // Remove espaços múltiplos e apara
  return n.replace(/\s+/g, ' ').trim()
}

/**
 * Escolhe a data mais recente entre duas strings YYYY-MM-DD
 */
function escolherDataMaisRecente(d1?: string, d2?: string): string | undefined {
  if (!d1 && !d2) return undefined
  if (!d1) return d2
  if (!d2) return d1
  return d1 > d2 ? d1 : d2
}

/**
 * Escolhe a data mais antiga (primeira compra) entre duas strings YYYY-MM-DD
 */
function escolherDataMaisAntiga(d1?: string, d2?: string): string | undefined {
  if (!d1 && !d2) return undefined
  if (!d1) return d2
  if (!d2) return d1
  return d1 < d2 ? d1 : d2
}

/**
 * Normaliza o valor de vendedor para um dos 4 aceitos
 */
export function normalizarVendedor(
  vendedorStr?: string,
): 'Alice' | 'Renan' | 'Karoline (Vendas 1)' | 'Vendas 2' {
  if (!vendedorStr) return 'Alice'
  const v = vendedorStr.trim().toLowerCase()
  if (v.includes('karoline') || v.includes('vendas 1') || v.includes('vendedor 1')) {
    return 'Karoline (Vendas 1)'
  }
  if (v.includes('vendas 2') || v.includes('vendedor 2')) {
    return 'Vendas 2'
  }
  if (v.includes('renan')) {
    return 'Renan'
  }
  if (v.includes('alice')) {
    return 'Alice'
  }
  return 'Alice'
}

/**
 * Normaliza o status do cliente: se fizer nova compra ou se for ativo, 'ativo'; senão 'para_reativacao'
 */
export function normalizarStatusCliente(statusStr?: string): 'ativo' | 'para_reativacao' {
  if (!statusStr) return 'ativo'
  const s = statusStr.trim().toLowerCase()
  if (s.includes('reativ') || s === 'para_reativacao') {
    return 'para_reativacao'
  }
  return 'ativo'
}

/**
 * Normaliza grande_cliente: 'sim' | 'nao'
 */
export function normalizarGrandeCliente(val?: unknown): 'sim' | 'nao' {
  if (!val) return 'nao'
  if (typeof val === 'boolean') return val ? 'sim' : 'nao'
  const s = String(val).trim().toLowerCase()
  if (s === 'sim' || s === 'true' || s === '1' || s === 's') return 'sim'
  return 'nao'
}

/**
 * Normaliza tipo_contato: 'cliente' | 'fornecedor' | 'ambos'
 */
export function normalizarTipoContato(val?: string): 'cliente' | 'fornecedor' | 'ambos' {
  if (!val) return 'cliente'
  const s = val.trim().toLowerCase()
  if (s.includes('ambos')) return 'ambos'
  if (s.includes('fornec')) return 'fornecedor'
  return 'cliente'
}

/**
 * Agrupa registros de clientes com base na normalização do nome_empresa (deduplicação e sufixos societários).
 * Soma valor_total_compras e valor_total_vendas.
 * Combina datas (última compra = mais recente, primeira compra = mais antiga).
 * Mantém dados de contato mais completos (ex.: telefone, email, cnpj_cpf).
 */
export function agruparEDeduplicarClientes(itens: ClienteImportItem[]): ClienteImportItem[] {
  return processarAgrupamentoClientes(itens).clientes
}

export function processarAgrupamentoClientes(itens: ClienteImportItem[]): AgrupamentoResultado {
  const mapa = new Map<string, { cliente: ClienteImportItem; nomesOriginais: string[] }>()

  for (const item of itens) {
    const nomeLimpo = (item.nome_empresa || item.nome_contato || '').trim()
    if (!nomeLimpo) continue

    const chaveNormalizada = normalizarChaveEmpresa(nomeLimpo)
    if (!chaveNormalizada) continue

    if (!mapa.has(chaveNormalizada)) {
      mapa.set(chaveNormalizada, {
        cliente: {
          ...item,
          nome_empresa: item.nome_empresa || item.nome_contato || '',
          valor_total_compras: Number(item.valor_total_compras) || 0,
          valor_total_vendas: Number(item.valor_total_vendas) || 0,
        },
        nomesOriginais: [nomeLimpo],
      })
    } else {
      const entrada = mapa.get(chaveNormalizada)!
      const existente = entrada.cliente

      // Se um dos registros for mais completo no nome (ex: termina em LTDA em vez de apenas LT), prefere o mais completo
      const nomePreferido =
        (item.nome_empresa || '').length > existente.nome_empresa.length
          ? item.nome_empresa
          : existente.nome_empresa

      // Soma de valores financeiros
      const novoTotalCompras =
        (Number(existente.valor_total_compras) || 0) + (Number(item.valor_total_compras) || 0)
      const novoTotalVendas =
        (Number(existente.valor_total_vendas) || 0) + (Number(item.valor_total_vendas) || 0)

      // Datas
      const ultimaCompra = escolherDataMaisRecente(
        existente.data_ultima_compra,
        item.data_ultima_compra,
      )
      const primeiraCompra = escolherDataMaisAntiga(
        existente.data_primeira_compra,
        item.data_primeira_compra,
      )

      // Se qualquer um for grande_cliente = 'sim', o agrupado passa a ser 'sim'
      const grande =
        existente.grande_cliente === 'sim' || item.grande_cliente === 'sim' ? 'sim' : 'nao'

      // Status: se qualquer linha do grupo for 'ativo', o status consolidado é 'ativo'
      const statusFinal =
        existente.status_cliente === 'ativo' || item.status_cliente === 'ativo'
          ? 'ativo'
          : 'para_reativacao'

      // Preenche campos faltantes
      const cnpjFinal = existente.cnpj_cpf || item.cnpj_cpf || ''
      const telFinal = existente.telefone || item.telefone || ''
      const emailFinal = existente.email || item.email || ''
      const cidadeFinal = existente.cidade || item.cidade || ''
      const estadoFinal = existente.estado || item.estado || ''
      const contatoFinal = existente.nome_contato || item.nome_contato || ''
      const vendedorFinal = existente.vendedor || item.vendedor

      entrada.cliente = {
        ...existente,
        nome_empresa: nomePreferido,
        nome_contato: contatoFinal,
        cnpj_cpf: cnpjFinal,
        telefone: telFinal,
        email: emailFinal,
        cidade: cidadeFinal,
        estado: estadoFinal,
        vendedor: vendedorFinal,
        valor_total_compras: Number(novoTotalCompras.toFixed(2)),
        valor_total_vendas: Number(novoTotalVendas.toFixed(2)),
        data_ultima_compra: ultimaCompra,
        data_primeira_compra: primeiraCompra,
        grande_cliente: grande,
        status_cliente: statusFinal,
      }

      if (!entrada.nomesOriginais.includes(nomeLimpo)) {
        entrada.nomesOriginais.push(nomeLimpo)
      }
    }
  }

  const clientes: ClienteImportItem[] = []
  const gruposComMaisDeUmRegistro: AgrupamentoResultado['gruposComMaisDeUmRegistro'] = []
  let linhasAgrupadas = 0

  for (const [chave, entrada] of mapa.entries()) {
    clientes.push(entrada.cliente)
    if (entrada.nomesOriginais.length > 1) {
      linhasAgrupadas += entrada.nomesOriginais.length - 1
      gruposComMaisDeUmRegistro.push({
        chave,
        nomeFinal: entrada.cliente.nome_empresa,
        totalItens: entrada.nomesOriginais.length,
        nomesOriginais: entrada.nomesOriginais,
        valorTotalVendas: entrada.cliente.valor_total_vendas,
        valorTotalCompras: entrada.cliente.valor_total_compras,
      })
    }
  }

  return {
    clientes,
    totalLinhasOriginais: itens.length,
    totalGruposFormados: clientes.length,
    linhasAgrupadas,
    gruposComMaisDeUmRegistro,
  }
}
