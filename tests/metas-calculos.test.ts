import { describe, it, expect } from 'vitest'
import {
  calcularPercentual,
  recalcularPercentuais,
  somarValoresIndividuais,
  validarSomaMeta,
  redistribuirAoRemover,
} from '@/lib/metas/metasCalculos'

describe('Lógica de Metas Comerciais (Cálculos e Redistribuição)', () => {
  describe('calcularPercentual', () => {
    it('calcula percentual correto e arredonda para 2 casas', () => {
      expect(calcularPercentual(70000, 125000)).toBe(56)
      expect(calcularPercentual(35000, 125000)).toBe(28)
      expect(calcularPercentual(20000, 125000)).toBe(16)
    })

    it('retorna 0 quando meta geral for 0 ou negativa', () => {
      expect(calcularPercentual(5000, 0)).toBe(0)
      expect(calcularPercentual(5000, -100)).toBe(0)
    })

    it('retorna 0 quando valor individual for 0 ou negativo', () => {
      expect(calcularPercentual(0, 100000)).toBe(0)
      expect(calcularPercentual(-50, 100000)).toBe(0)
    })
  })

  describe('recalcularPercentuais', () => {
    it('recalcula percentuais mantendo valores individuais inalterados', () => {
      const participantes = [
        { usuario_id: 'u1', valor_individual: 70000, percentual: 56 },
        { usuario_id: 'u2', valor_individual: 35000, percentual: 28 },
      ]

      // Se a meta geral sobe para 200.000:
      // 70k / 200k = 35%
      // 35k / 200k = 17.5%
      const resultado = recalcularPercentuais(participantes, 200000)

      expect(resultado[0].valor_individual).toBe(70000)
      expect(resultado[0].percentual).toBe(35)

      expect(resultado[1].valor_individual).toBe(35000)
      expect(resultado[1].percentual).toBe(17.5)
    })
  })

  describe('validarSomaMeta e somarValoresIndividuais', () => {
    it('valida quando a soma bate 100% com a meta geral', () => {
      const parts = [
        { valor_individual: 70000 },
        { valor_individual: 35000 },
        { valor_individual: 20000 },
      ]

      const val = validarSomaMeta(125000, parts)
      expect(val.soma).toBe(125000)
      expect(val.diferenca).toBe(0)
      expect(val.bate).toBe(true)
    })

    it('detecta diferença positiva (soma menor que a meta geral)', () => {
      const parts = [{ valor_individual: 70000 }, { valor_individual: 35000 }]

      const val = validarSomaMeta(125000, parts)
      expect(val.soma).toBe(105000)
      expect(val.diferenca).toBe(20000)
      expect(val.bate).toBe(false)
    })

    it('detecta diferença negativa (soma maior que a meta geral)', () => {
      const parts = [{ valor_individual: 80000 }, { valor_individual: 60000 }]

      const val = validarSomaMeta(125000, parts)
      expect(val.soma).toBe(140000)
      expect(val.diferenca).toBe(-15000)
      expect(val.bate).toBe(false)
    })
  })

  describe('redistribuirAoRemover (Lógica do requisito Colesel 45)', () => {
    it('redistribui proporcionalmente quando um participante é removido (exemplo do usuário)', () => {
      // Exemplo: meta 125k, Renan 70k (56%), V1 35k (28%), V2 20k (16%)
      // Remove V2 (20k).
      // Restantes: Renan (70k) e V1 (35k). Proporção 70:35 = 2:1.
      // 20k distribuído: 2/3 de 20k = 13.333,33 para Renan -> ~83.333,33
      // 1/3 de 20k = 6.666,67 para V1 -> ~41.666,67
      // Soma total mantida: 83.333,33 + 41.666,67 = 125.000,00!
      const participantes = [
        { usuario_id: 'renan', valor_individual: 70000, percentual: 56 },
        { usuario_id: 'v1', valor_individual: 35000, percentual: 28 },
        { usuario_id: 'v2', valor_individual: 20000, percentual: 16 },
      ]

      const resultado = redistribuirAoRemover(participantes, 'v2', 125000)

      expect(resultado.length).toBe(2)
      expect(resultado.find((p) => p.usuario_id === 'v2')).toBeUndefined()

      const renan = resultado.find((p) => p.usuario_id === 'renan')!
      const v1 = resultado.find((p) => p.usuario_id === 'v1')!

      expect(renan.valor_individual).toBeCloseTo(83333.33, 1)
      expect(v1.valor_individual).toBeCloseTo(41666.67, 1)

      // Soma dos novos valores bate 125.000 exato
      const soma = somarValoresIndividuais(resultado)
      expect(soma).toBe(125000)

      // Percentuais recalculados somando ~100%
      expect(renan.percentual + v1.percentual).toBeCloseTo(100, 0.1)
    })

    it('quando resta apenas 1 participante, ele assume 100% do valor', () => {
      const participantes = [
        { usuario_id: 'p1', valor_individual: 80000, percentual: 80 },
        { usuario_id: 'p2', valor_individual: 20000, percentual: 20 },
      ]

      const resultado = redistribuirAoRemover(participantes, 'p2', 100000)
      expect(resultado.length).toBe(1)
      expect(resultado[0].usuario_id).toBe('p1')
      expect(resultado[0].valor_individual).toBe(100000)
      expect(resultado[0].percentual).toBe(100)
    })

    it('se remover o último participante, retorna lista vazia sem erros', () => {
      const participantes = [
        { usuario_id: 'p1', valor_individual: 100000, percentual: 100 },
      ]

      const resultado = redistribuirAoRemover(participantes, 'p1', 100000)
      expect(resultado.length).toBe(0)
    })

    it('se os participantes restantes tiverem valor 0, divide igualmente', () => {
      const participantes = [
        { usuario_id: 'p1', valor_individual: 0, percentual: 0 },
        { usuario_id: 'p2', valor_individual: 0, percentual: 0 },
        { usuario_id: 'removido', valor_individual: 60000, percentual: 100 },
      ]

      const resultado = redistribuirAoRemover(participantes, 'removido', 60000)
      expect(resultado.length).toBe(2)
      expect(resultado[0].valor_individual).toBe(30000)
      expect(resultado[1].valor_individual).toBe(30000)
      expect(resultado[0].percentual).toBe(50)
      expect(resultado[1].percentual).toBe(50)
    })
  })
})
