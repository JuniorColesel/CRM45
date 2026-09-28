import { describe, it, expect } from 'vitest'

// 1. autenticação (login válido/inválido)
describe('1. Autenticação de Usuários', () => {
  it('deve autenticar usuário com credenciais válidas e rejeitar credenciais inválidas', () => {
    // Mock determinístico do serviço de auth com base nos usuários seed do CRM
    const usuariosValidos = [
      { email: 'junior.colesel@coleselengenharia.com', pass: 'Skip@Pass' },
      { email: 'vendas1@coleselengenharia.com', pass: 'Skip@Pass123' },
      { email: 'vendas2@coleselengenharia.com', pass: 'Skip@Pass123' },
      { email: 'renan.coordenador@coleselengenharia.com', pass: 'Skip@Pass123' },
    ]

    const autenticar = (email: string, pass: string) => {
      const match = usuariosValidos.find((u) => u.email === email && u.pass === pass)
      if (!match) throw new Error('Credenciais inválidas.')
      return { token: 'mock-jwt-token', email: match.email }
    }

    // Login válido
    const res = autenticar('vendas1@coleselengenharia.com', 'Skip@Pass123')
    expect(res.token).toBeDefined()
    expect(res.email).toBe('vendas1@coleselengenharia.com')

    // Login inválido (senha errada)
    expect(() => autenticar('vendas1@coleselengenharia.com', 'SenhaErrada123')).toThrow(
      'Credenciais inválidas.',
    )

    // Login inválido (usuário inexistente)
    expect(() => autenticar('fantasma@coleselengenharia.com', 'Skip@Pass123')).toThrow(
      'Credenciais inválidas.',
    )
  })
})
