/**
 * Helper centralizado para exibição amigável do nome do vendedor no Funil.
 *
 * Mapeia aliases conhecidos da vendedora para "Caroline":
 * - "Karoline (Vendas 1)", "Karoline", "Vendas 1", "Maria Caroline", "MARIA CAROLINE SANTOS", "Carol" -> "Caroline"
 *
 * Preserva estritamente:
 * - "Alice" -> "Alice"
 * - "Renan" -> "Renan"
 * - "Vendas 2" -> "Vendas 2"
 * - "Sem vendedor" -> "Sem vendedor"
 * - Nomes desconhecidos -> preserva o nome original
 */

export function formatarNomeVendedorExibicao(nome?: string | null): string {
  if (!nome) return 'Sem vendedor'

  const n = String(nome).trim()
  if (!n) return 'Sem vendedor'

  const lower = n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  // Preservar casos explícitos conhecidos
  if (lower === 'sem vendedor' || lower === 'sem responsavel' || lower === 'sem_vendedor') {
    return 'Sem vendedor'
  }

  // Aliases que devem ser exibidos como "Caroline"
  // "Karoline (Vendas 1)", "Karoline", "Vendas 1", "Maria Caroline", "MARIA CAROLINE SANTOS", "Carol"
  if (
    lower.includes('karoline') ||
    lower.includes('caroline') ||
    lower.includes('carol') ||
    lower === 'vendas 1' ||
    lower.startsWith('vendas 1') ||
    lower === 'vendedor 1' ||
    lower.startsWith('vendedor 1')
  ) {
    return 'Caroline'
  }

  if (lower.includes('alice')) {
    return 'Alice'
  }

  if (lower.includes('renan')) {
    return 'Renan'
  }

  if (lower === 'vendas 2' || lower.startsWith('vendas 2') || lower === 'vendedor 2') {
    return 'Vendas 2'
  }

  return n
}
