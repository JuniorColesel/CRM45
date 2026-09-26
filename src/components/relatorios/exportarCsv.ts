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
  const conteudoCsv = `\uFEFF${cabecalhoCsv}\r\n${linhasCsv}`

  const blob = new Blob([conteudoCsv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${nomeArquivo}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
