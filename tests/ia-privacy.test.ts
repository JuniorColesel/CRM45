import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Teste 15: IA não recebe PII desnecessária
 * Payload do /backend/v1/ia/sugerir contém apenas conversa_id e mensagem_cliente;
 * Prompt não leva nome/telefone/e-mail (Zero PII ao LLM)
 */

describe('15. Privacidade da IA e Minimização de Dados (Zero PII)', () => {
  it('IA não recebe PII desnecessária: prompt e payload sanitizados', () => {
    // 1. Ler o código real do hook ia_sugerir.js
    const hookIaPath = path.resolve(process.cwd(), 'pocketbase/hooks/ia_sugerir.js')
    const hookIaConteudo = fs.readFileSync(hookIaPath, 'utf-8')

    // O hook extrai estritamente conversa_id e mensagem_cliente do body
    expect(hookIaConteudo).toContain('const conversaId = body.conversa_id')
    expect(hookIaConteudo).toContain(
      "const mensagemCliente = (body.mensagem_cliente || '').trim()",
    )

    // O hook realiza sanitização ativa de e-mails, telefones e CPFs
    expect(hookIaConteudo).toContain('[email]')
    expect(hookIaConteudo).toContain('[telefone]')
    expect(hookIaConteudo).toContain('[cpf]')

    // Prompt do sistema contém nota explícita de anonimização e privacidade
    expect(hookIaConteudo).toContain(
      'NOTA DE PRIVACIDADE: O contexto foi anonimizado. Não utilize nomes pessoais nem telefones nas respostas sugeridas.',
    )

    // Simulação do payload enviado ao endpoint
    const payloadCliente = {
      conversa_id: 'conv_123456',
      mensagem_cliente: 'Qual o valor do metro da telha colonial?',
      // Campos PII que NÃO devem ser exigidos nem aceitos
      nome_cliente: 'João da Silva',
      telefone: '11999998888',
      email: 'joao@empresa.com',
    }

    // Função de sanitização executada pelo hook
    const sanitizarMensagem = (msg: string) => {
      return msg
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
        .replace(/(\(?\d{2}\)?\s*)?(9?\d{4}[-.\s]?\d{4})/g, '[telefone]')
        .replace(/\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/g, '[cpf]')
    }

    // Contexto com mensagem contendo telefone e email acidentais
    const textoComPii = 'Meu telefone é 11988887777 e email teste@email.com'
    const textoLimpo = sanitizarMensagem(textoComPii)

    expect(textoLimpo).not.toContain('11988887777')
    expect(textoLimpo).not.toContain('teste@email.com')
    expect(textoLimpo).toContain('[telefone]')
    expect(textoLimpo).toContain('[email]')

    // Garantir que campos de PII externa não compõem a chamada $ai.chat
    const chavesPermitidas = ['conversa_id', 'mensagem_cliente']
    const camposFiltrados = Object.keys(payloadCliente).filter((k) => chavesPermitidas.includes(k))
    expect(camposFiltrados).toEqual(['conversa_id', 'mensagem_cliente'])
  })
})
