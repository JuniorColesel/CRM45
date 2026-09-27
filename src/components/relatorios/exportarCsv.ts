/**
 * Exporta uma matriz de dados para arquivo CSV no navegador com suporte a caracteres especiais UTF-8 (BOM).
 */
export function exportarParaCsv(
  nomeArquivo: string,
  cabecalhos: string[],
  linhas: (string | number | null | undefined)[][],
) {
  const formatarCelula = (valor: string | number | null | undefined): string => {
    if (valor === null || valor === undefined) return '""'
    const texto = String(valor).replace(/"/g, '""')
    return `"${texto}"`
  }

  const cabecalhoCsv = cabecalhos.map(formatarCelula).join(';')
  const linhasCsv = linhas.map((linha) => linha.map(formatarCelula).join(';')).join('\r\n')
  // BOM UTF-8 explícito: Uint8Array [0xEF, 0xBB, 0xBF] garante que o Excel reconheça UTF-8 sem ambiguidade
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const conteudoCsv = `${cabecalhoCsv}\r\n${linhasCsv}`

  const blob = new Blob([bom, conteudoCsv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  const nomeFinal = nomeArquivo.toLowerCase().endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  link.setAttribute('download', nomeFinal)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
