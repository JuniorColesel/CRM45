/**
 * metasCalculos.ts
 * Lógica pura de cálculo para Metas Comerciais Colesel 45.
 * - Cálculo de percentual individual (valor_individual / meta_geral * 100)
 * - Recálculo automático de percentuais mantendo valores individuais
 * - Redistribuição proporcional do valor de participante removido entre os restantes
 * - Soma de participantes e validação de diferença em tempo real
 */

export interface ParticipanteCalculo {
  id?: string
  usuario_id: string
  nome?: string
  valor_individual: number
  percentual: number
}

/**
 * Arredonda um número para 2 casas decimais (financeiro pt-BR).
 */
export function arredondar2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * Calcula o percentual individual: (valor_individual / meta_geral) * 100.
 * Retorna 0 se meta_geral <= 0. Arredondado para 2 casas decimais.
 */
export function calcularPercentual(valorIndividual: number, metaGeral: number): number {
  if (!metaGeral || metaGeral <= 0) return 0
  if (!valorIndividual || valorIndividual <= 0) return 0
  const pct = (valorIndividual / metaGeral) * 100
  return arredondar2(pct)
}

/**
 * Recalcula percentuais de uma lista de participantes com base em uma nova meta geral.
 * Os valores individuais NÃO mudam, apenas os percentuais.
 */
export function recalcularPercentuais<T extends { valor_individual: number; percentual?: number }>(
  participantes: T[],
  metaGeral: number,
): T[] {
  return participantes.map((p) => ({
    ...p,
    percentual: calcularPercentual(p.valor_individual, metaGeral),
  }))
}

/**
 * Soma o total de valores individuais dos participantes.
 */
export function somarValoresIndividuais(
  participantes: Array<{ valor_individual: number }>,
): number {
  const total = participantes.reduce((acc, p) => acc + (Number(p.valor_individual) || 0), 0)
  return arredondar2(total)
}

/**
 * Calcula a diferença entre a meta geral e a soma dos participantes.
 * Retorna { soma, diferenca, bate: boolean }.
 * tolerância de 0.01 para evitar problemas de ponto flutuante.
 */
export function validarSomaMeta(
  metaGeral: number,
  participantes: Array<{ valor_individual: number }>,
): {
  soma: number
  diferenca: number
  bate: boolean
} {
  const soma = somarValoresIndividuais(participantes)
  const meta = Number(metaGeral) || 0
  const diferenca = arredondar2(meta - soma)
  const bate = Math.abs(diferenca) < 0.01

  return { soma, diferenca, bate }
}

/**
 * Redistribuição proporcional quando um participante é removido:
 * - O valor individual do removido é redistribuído proporcionalmente entre os participantes restantes,
 *   mantendo a proporção existente entre eles.
 * - Se remover o último participante (nenhum restante): retorna array vazio.
 * - Se a soma dos valores individuais dos restantes for zero (ex: todos estavam com 0):
 *   o valor do removido é distribuído igualmente entre os restantes.
 * - Os percentuais são recalculados com base na meta geral.
 * - Ajuste de centavos: a soma dos novos valores individuais é ajustada no participante de maior valor
 *   para fechar exatamente o valor total que havia antes da remoção (ou a meta_geral se a soma batia).
 *
 * Exemplo do usuário:
 * Meta 125.000, Renan 70.000 (56%), V1 35.000 (28%), V2 20.000 (16%).
 * Remove V2:
 * Soma dos restantes = 70k + 35k = 105k.
 * Renan absorve: 70k + 20k * (70 / 105) = 70k + 13.333,33 = 83.333,33
 * V1 absorve: 35k + 20k * (35 / 105) = 35k + 6.666,67 = 41.666,67
 * Total restante = 125.000,00.
 */
export function redistribuirAoRemover<
  T extends { usuario_id: string; valor_individual: number; percentual?: number },
>(participantes: T[], usuarioIdRemovido: string, metaGeral: number): T[] {
  const restantes = participantes.filter((p) => p.usuario_id !== usuarioIdRemovido)
  const removido = participantes.find((p) => p.usuario_id === usuarioIdRemovido)

  if (!removido) return participantes.map((p) => ({ ...p }))
  if (restantes.length === 0) return []

  const valorParaDistribuir = Number(removido.valor_individual) || 0
  if (valorParaDistribuir <= 0) {
    // Sem valor a redistribuir, apenas recalcula percentuais
    return recalcularPercentuais(restantes, metaGeral)
  }

  const somaRestantes = restantes.reduce((acc, p) => acc + (Number(p.valor_individual) || 0), 0)

  let novos: T[]
  if (somaRestantes <= 0) {
    // Distribuir igualmente se todos os restantes estavam com 0
    const parcela = valorParaDistribuir / restantes.length
    novos = restantes.map((p) => ({
      ...p,
      valor_individual: arredondar2(parcela),
    }))
  } else {
    novos = restantes.map((p) => {
      const peso = (Number(p.valor_individual) || 0) / somaRestantes
      const adicional = valorParaDistribuir * peso
      const novoValor = arredondar2((Number(p.valor_individual) || 0) + adicional)
      return {
        ...p,
        valor_individual: novoValor,
      }
    })
  }

  // Ajuste fino de centavos para garantir que a soma dos restantes feche exatamente
  // a soma esperada (soma anterior dos restantes + valor do removido)
  const somaEsperada = arredondar2(somaRestantes + valorParaDistribuir)
  const somaAtual = somarValoresIndividuais(novos)
  const difCentavos = arredondar2(somaEsperada - somaAtual)

  if (Math.abs(difCentavos) > 0 && Math.abs(difCentavos) < 1 && novos.length > 0) {
    // Aplica no participante com maior valor individual
    let maxIdx = 0
    let maxVal = novos[0].valor_individual
    for (let i = 1; i < novos.length; i++) {
      if (novos[i].valor_individual > maxVal) {
        maxVal = novos[i].valor_individual
        maxIdx = i
      }
    }
    novos[maxIdx] = {
      ...novos[maxIdx],
      valor_individual: arredondar2(novos[maxIdx].valor_individual + difCentavos),
    }
  }

  // Recalcula percentuais com a nova meta geral
  return recalcularPercentuais(novos, metaGeral)
}
