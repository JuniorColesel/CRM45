/**
 * Utilitários de parsing de CSV/TXT e normalização de dados para importação
 * CRM Colesel 45
 */

export interface ParsedCSVRow {
  [key: string]: string
}

/**
 * Detecta delimitador (, ou ;) analisando a primeira linha
 */
export function detectarDelimitador(primeiraLinha: string): string {
  const virgulas = (primeiraLinha.match(/,/g) || []).length
  const pontoEVirgula = (primeiraLinha.match(/;/g) || []).length
  const tabs = (primeiraLinha.match(/\t/g) || []).length

  if (tabs > virgulas && tabs > pontoEVirgula) return '\t'
  if (pontoEVirgula >= virgulas) return ';'
  return ','
}

/**
 * Faz o parse de texto CSV respeitando aspas duplas e quebras de linha
 */
export function parseCSV(texto: string): {
  headers: string[]
  rows: ParsedCSVRow[]
  rawRows: string[][]
} {
  const limpo = texto.replace(/^\uFEFF/, '').trim() // Remove BOM UTF-8
  if (!limpo) {
    return { headers: [], rows: [], rawRows: [] }
  }

  // Identificar linhas respeitando possíveis aspas duplas
  const linhas: string[] = []
  let buffer = ''
  let dentroDeAspas = false

  for (let i = 0; i < limpo.length; i++) {
    const char = limpo[i]
    const prox = limpo[i + 1]

    if (char === '"') {
      if (dentroDeAspas && prox === '"') {
        buffer += '"'
        i++ // pula a segunda aspas
      } else {
        dentroDeAspas = !dentroDeAspas
      }
    } else if ((char === '\n' || char === '\r') && !dentroDeAspas) {
      if (char === '\r' && prox === '\n') {
        i++
      }
      if (buffer.trim().length > 0) {
        linhas.push(buffer)
      }
      buffer = ''
    } else {
      buffer += char
    }
  }

  if (buffer.trim().length > 0) {
    linhas.push(buffer)
  }

  if (linhas.length === 0) {
    return { headers: [], rows: [], rawRows: [] }
  }

  const delimitador = detectarDelimitador(linhas[0])

  const separarCampos = (linha: string): string[] => {
    const campos: string[] = []
    let campoBuffer = ''
    let emAspas = false

    for (let i = 0; i < linha.length; i++) {
      const c = linha[i]
      const next = linha[i + 1]

      if (c === '"') {
        if (emAspas && next === '"') {
          campoBuffer += '"'
          i++
        } else {
          emAspas = !emAspas
        }
      } else if (c === delimitador && !emAspas) {
        campos.push(campoBuffer.trim())
        campoBuffer = ''
      } else {
        campoBuffer += c
      }
    }
    campos.push(campoBuffer.trim())
    return campos
  }

  // Headers normalizados (minúsculos, sem acentos, sem espaços estranhos)
  const cabecalhoOriginal = separarCampos(linhas[0])
  const headers = cabecalhoOriginal.map((h) => normalizarNomeColuna(h))

  const rows: ParsedCSVRow[] = []
  const rawRows: string[][] = []

  for (let i = 1; i < linhas.length; i++) {
    const campos = separarCampos(linhas[i])
    // Se a linha for vazia ou tiver todos campos vazios, ignorar
    if (campos.every((c) => !c)) continue

    rawRows.push(campos)
    const rowObj: ParsedCSVRow = {}
    headers.forEach((h, idx) => {
      rowObj[h] = campos[idx] ?? ''
    })
    rows.push(rowObj)
  }

  return { headers, rows, rawRows }
}

/**
 * Normaliza o cabeçalho para coincidir com as chaves esperadas:
 * nome_contato, nome_empresa, telefone, cidade, email, cnpj_cpf, data_ultima_compra, grande_cliente, valor, cliente, data_compra
 */
export function normalizarNomeColuna(coluna: string): string {
  const norm = coluna
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  // Mapeamentos comuns
  if (norm === 'nome' || norm === 'contato' || norm === 'nome_do_contato') return 'nome_contato'
  if (norm === 'empresa' || norm === 'razao_social' || norm === 'nome_fantasia')
    return 'nome_empresa'
  if (norm === 'fone' || norm === 'celular' || norm === 'whatsapp') return 'telefone'
  if (norm === 'municipio') return 'cidade'
  if (norm === 'e_mail' || norm === 'correio_eletronico') return 'email'
  if (norm === 'cnpj' || norm === 'cpf' || norm === 'documento' || norm === 'cnpjcpf')
    return 'cnpj_cpf'
  if (norm === 'ultima_compra' || norm === 'data_da_ultima_compra') return 'data_ultima_compra'
  if (norm === 'vip' || norm === 'grande_cliente_sim_nao') return 'grande_cliente'
  if (norm === 'data' || norm === 'data_de_compra' || norm === 'datacompra') return 'data_compra'
  if (norm === 'preco' || norm === 'valor_compra' || norm === 'total') return 'valor'
  if (norm === 'identificador' || norm === 'id_cliente' || norm === 'cliente_doc') return 'cliente'

  return norm
}

/**
 * Normaliza datas para o padrão YYYY-MM-DD
 * Aceita:
 * - YYYY-MM-DD
 * - DD/MM/YYYY
 * - DD-MM-YYYY
 * - ISO string
 */
export function normalizarData(dataStr?: string | null): string | null {
  if (!dataStr || !dataStr.trim()) return null
  const limpa = dataStr.trim()

  // Se já for YYYY-MM-DD
  const matchIso = limpa.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (matchIso) {
    const ano = matchIso[1]
    const mes = matchIso[2].padStart(2, '0')
    const dia = matchIso[3].padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  const matchBr = limpa.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (matchBr) {
    const dia = matchBr[1].padStart(2, '0')
    const mes = matchBr[2].padStart(2, '0')
    const ano = matchBr[3]
    return `${ano}-${mes}-${dia}`
  }

  // Tenta parsing nativo Date se não bateu regex
  const d = new Date(limpa)
  if (!isNaN(d.getTime())) {
    return d.toISOString().substring(0, 10)
  }

  return null
}

/**
 * Normaliza booleano (grande_cliente: sim/nao, true/false, 1/0, s/n)
 */
export function normalizarBooleano(valor?: string | null): boolean {
  if (!valor) return false
  const v = valor.trim().toLowerCase()
  return ['sim', 's', 'true', 'verdadeiro', '1', 'yes', 'y'].includes(v)
}

/**
 * Normaliza número decimal de compra: aceita "1.500,50", "1500.50", "1500,50", "R$ 1.500,00"
 */
export function normalizarValorDecimal(valorStr?: string | null): number {
  if (!valorStr) return 0
  let limpo = valorStr.replace(/[^\d.,-]/g, '').trim()
  if (!limpo) return 0

  // Se contiver tanto ponto quanto vírgula (ex: 1.250,50 ou 1,250.50)
  if (limpo.includes('.') && limpo.includes(',')) {
    if (limpo.lastIndexOf(',') > limpo.lastIndexOf('.')) {
      // Formato brasileiro: 1.250,50
      limpo = limpo.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato americano: 1,250.50
      limpo = limpo.replace(/,/g, '')
    }
  } else if (limpo.includes(',')) {
    // Apenas vírgula: 1500,50
    limpo = limpo.replace(',', '.')
  }

  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

/**
 * Compara duas datas em formato YYYY-MM-DD (ou ISO) e retorna a mais recente
 */
export function dataMaisRecente(data1?: string | null, data2?: string | null): string | null {
  const d1 = normalizarData(data1)
  const d2 = normalizarData(data2)

  if (!d1 && !d2) return null
  if (!d1) return d2
  if (!d2) return d1

  return d1 >= d2 ? d1 : d2
}
