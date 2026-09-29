import type { VendedorCliente, StatusCliente } from '@/types/clientes'

/**
 * DE-PARA centralizado de vendedor Bling -> CRM Colesel 45.
 * Regra prescrita (Item 9 e 10):
 * - "ALICE PAITRA COLESEL" -> "Alice"
 * - "RENAN SOUZA" -> "Renan"
 * - "Karoline" -> "Karoline (Vendas 1)"
 * - "Vendas 1" -> "Karoline (Vendas 1)"
 * - "MARIA CAROLINE SANTOS" -> "Karoline (Vendas 1)"
 * - "Vendas 2" -> "Vendas 2"
 * - "Consumidor Final" -> "Karoline (Vendas 1)"
 * - "Consumidor Final." -> "Karoline (Vendas 1)"
 * - Qualquer OUTRO vendedor (TAISA TOLEDO, GABRIELA CULTOM, GEISEBEL, "-", vazio,
 *   qualquer nome não reconhecido) -> "Renan".
 */
export function mapearVendedorBlingParaCrm(vendedorBling?: string | null): VendedorCliente {
  if (!vendedorBling) {
    return 'Renan'
  }

  const v = vendedorBling
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()

  // 1. Alice
  if (v === 'ALICE PAITRA COLESEL' || v === 'ALICE' || v.startsWith('ALICE PAITRA')) {
    return 'Alice'
  }

  // 2. Renan Souza
  if (v === 'RENAN SOUZA' || v === 'RENAN') {
    return 'Renan'
  }

  // 3. Karoline (Vendas 1)
  // "Karoline", "Vendas 1", "MARIA CAROLINE SANTOS", "Consumidor Final", "Consumidor Final."
  if (
    v === 'KAROLINE' ||
    v === 'VENDAS 1' ||
    v === 'MARIA CAROLINE SANTOS' ||
    v === 'CONSUMIDOR FINAL' ||
    v === 'CONSUMIDOR FINAL.' ||
    v.startsWith('KAROLINE ') ||
    v.startsWith('MARIA CAROLINE')
  ) {
    return 'Karoline (Vendas 1)'
  }

  // 4. Vendas 2
  if (v === 'VENDAS 2') {
    return 'Vendas 2'
  }

  // 5. Qualquer outro vendedor (TAISA TOLEDO, GABRIELA CULTOM, GEISEBEL, "-", etc.) -> Renan
  return 'Renan'
}

/**
 * Normaliza o nome da empresa identificando se se trata de Consumidor Final.
 * Item 10: "Consumidor Final" e "Consumidor Final." são o MESMO registro lógico.
 */
export function isConsumidorFinal(nomeEmpresa?: string | null): boolean {
  if (!nomeEmpresa) return false
  const n = nomeEmpresa.trim().toLowerCase()
  return n === 'consumidor final' || n === 'consumidor final.'
}

/**
 * Normaliza o status do cliente com base na data da última compra.
 * Item 8:
 * - Data de referência = data atual (ou passada como parâmetro)
 * - Cliente ATIVO: data_ultima_compra dentro dos últimos 6 meses.
 * - Cliente PARA_REATIVACAO: data_ultima_compra superior a 6 meses.
 * - Registro sem data de compra: mantém status existente ou retorna undefined se nada alterado.
 */
export function calcularStatusClientePorDataCompra(
  dataUltimaCompra?: string | null,
  dataReferencia: Date = new Date(),
  statusAtual?: StatusCliente | null,
): StatusCliente | undefined {
  if (!dataUltimaCompra) {
    return statusAtual || undefined
  }

  const dCompra = new Date(dataUltimaCompra)
  if (isNaN(dCompra.getTime())) {
    return statusAtual || undefined
  }

  // 6 meses atrás
  const limite6Meses = new Date(dataReferencia)
  limite6Meses.setMonth(limite6Meses.getMonth() - 6)

  if (dCompra >= limite6Meses) {
    return 'ativo'
  } else {
    return 'para_reativacao'
  }
}

/**
 * Normaliza documento CNPJ / CPF: apenas dígitos ou caracteres alfanuméricos limpos
 */
export function normalizarDocumento(doc?: string | null): string {
  if (!doc) return ''
  return String(doc).replace(/[^\w]/g, '').trim().toLowerCase()
}

/**
 * Normaliza e-mail
 */
export function normalizarEmail(email?: string | null): string {
  if (!email) return ''
  return String(email).trim().toLowerCase()
}
