import { describe, it, expect } from 'vitest'
import {
  SLIDES_TREINAMENTO,
  QUIZ_TREINAMENTO,
  LISTA_POPS,
} from '@/data/popTreinamentoData'

describe('Validação do Treinamento e Quiz do CRM Colesel 45', () => {
  it('contém exatamente 18 slides cobrindo os módulos 0 a 6', () => {
    expect(SLIDES_TREINAMENTO.length).toBe(18)
    const modulos = new Set(SLIDES_TREINAMENTO.map((s) => s.moduloNumero))
    expect(modulos.has(0)).toBe(true) // Boas-vindas
    expect(modulos.has(1)).toBe(true) // Gestão de Clientes
    expect(modulos.has(2)).toBe(true) // Follow-up
    expect(modulos.has(3)).toBe(true) // Prospecção & Ligações
    expect(modulos.has(4)).toBe(true) // Metas
    expect(modulos.has(5)).toBe(true) // Compliance & Backup
    expect(modulos.has(6)).toBe(true) // Integrações & Quiz
  })

  it('o slide 18 é a etapa final de verificação com o quiz', () => {
    const ultimoSlide = SLIDES_TREINAMENTO[17]
    expect(ultimoSlide.numero).toBe(18)
    expect(ultimoSlide.moduloNumero).toBe(6)
  })

  it('o quiz possui perguntas cobrindo as regras essenciais do sistema', () => {
    expect(QUIZ_TREINAMENTO.length).toBeGreaterThanOrEqual(6)

    // Pergunta 1: Trava de duplicidade com mensagem exata
    const q1 = QUIZ_TREINAMENTO[0]
    expect(q1.pergunta).toContain('CNPJ ou Nome de Empresa')
    const opcaoCorretaQ1 = q1.opcoes.find((o) => o.id === q1.respostaCorreta)
    expect(opcaoCorretaQ1?.texto).toContain('Já existe um cliente cadastrado com esse CNPJ/nome.')

    // Pergunta 2: Trava de edição de vendedor
    const q2 = QUIZ_TREINAMENTO[1]
    expect(q2.pergunta).toContain('Vendedor editar')
    const opcaoCorretaQ2 = q2.opcoes.find((o) => o.id === q2.respostaCorreta)
    expect(opcaoCorretaQ2?.texto).toContain('para_reativacao')

    // Pergunta 3: Regra +1h no prefill
    const q3 = QUIZ_TREINAMENTO[2]
    expect(q3.pergunta).toContain('Nova Tarefa')
    const opcaoCorretaQ3 = q3.opcoes.find((o) => o.id === q3.respostaCorreta)
    expect(opcaoCorretaQ3?.texto).toContain('+1h')

    // Pergunta 4: Redistribuição proporcional na remoção de participante de metas
    const q4 = QUIZ_TREINAMENTO[3]
    expect(q4.pergunta).toContain('remove um participante')
    const opcaoCorretaQ4 = q4.opcoes.find((o) => o.id === q4.respostaCorreta)
    expect(opcaoCorretaQ4?.texto).toContain('redistribuído proporcionalmente')

    // Pergunta 5: Papéis de acesso em metas
    const q5 = QUIZ_TREINAMENTO[4]
    expect(q5.pergunta).toContain('papel de cada perfil')
    const opcaoCorretaQ5 = q5.opcoes.find((o) => o.id === q5.respostaCorreta)
    expect(opcaoCorretaQ5?.texto).toContain('CEO cria e edita')

    // Pergunta 6: Backup test e compliance
    const q6 = QUIZ_TREINAMENTO[5]
    expect(q6.pergunta).toContain('/admin/backup-test')
    const opcaoCorretaQ6 = q6.opcoes.find((o) => o.id === q6.respostaCorreta)
    expect(opcaoCorretaQ6?.texto).toContain('Cloudflare R2')
    expect(opcaoCorretaQ6?.texto).toContain('modo seguro')
  })

  it('todos os POPs estão estruturados com passos e perfis aplicáveis', () => {
    expect(LISTA_POPS.length).toBeGreaterThanOrEqual(8)
    for (const pop of LISTA_POPS) {
      expect(pop.codigo).toMatch(/^POP-\d{3}$/)
      expect(pop.titulo.length).toBeGreaterThan(5)
      expect(pop.itens.length).toBeGreaterThanOrEqual(3)
      expect(pop.perfisValidos.length).toBeGreaterThan(0)
    }
  })
})
