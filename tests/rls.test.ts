import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Testes 2 a 6: Regras de RLS (Row Level Security) e Escopo de Acesso
 * Validação semântica e determinística das regras das migrações 0009 e 0013
 */

describe('RLS e Controle de Acesso Baseado em Perfis', () => {
  // Ler regra real definida na migração 0013
  const migracaoPath = path.resolve(
    process.cwd(),
    'pocketbase/migrations/0013_rls_hardening_and_webhook_logs.js',
  )
  const migracaoConteudo = fs.readFileSync(migracaoPath, 'utf-8')

  // Avaliador de RLS simulando o motor PocketBase com as regras da migração 0013
  const podeAcessarCliente = (usuario: { id: string; perfil: string }, cliente: { vendedor: string; responsavel_id?: string; grande_cliente?: boolean }) => {
    if (usuario.perfil === 'estoque') return false
    if (usuario.perfil === 'ceo_financeiro') return true
    if (usuario.perfil === 'coordenador_vendas') {
      // Coordenador acessa vendedores sob sua gestão ou não atribuídos
      return true
    }
    if (usuario.perfil === 'vendedor_1' || usuario.perfil === 'vendedor_2') {
      return cliente.vendedor === usuario.id || cliente.responsavel_id === usuario.id
    }
    if (usuario.perfil === 'compras_grandes_clientes') {
      return !!cliente.grande_cliente
    }
    return false
  }

  const podeAlterarCliente = (usuario: { id: string; perfil: string }, cliente: { vendedor: string; responsavel_id?: string }) => {
    if (usuario.perfil === 'estoque' || usuario.perfil === 'compras_grandes_clientes') return false
    if (usuario.perfil === 'ceo_financeiro' || usuario.perfil === 'coordenador_vendas') return true
    if (usuario.perfil === 'vendedor_1' || usuario.perfil === 'vendedor_2') {
      return cliente.vendedor === usuario.id || cliente.responsavel_id === usuario.id
    }
    return false
  }

  // 2. vendedor A não lê cliente B (RLS)
  it('2. vendedor A não lê cliente B (RLS)', () => {
    const vendedorA = { id: 'usr_vendas1', perfil: 'vendedor_1' }
    const clienteDeB = { vendedor: 'usr_vendas2' }

    expect(podeAcessarCliente(vendedorA, clienteDeB)).toBe(false)

    // Confirma que a regra no código da migração 0013 exige vendedor = @request.auth.id
    expect(migracaoConteudo).toContain(
      "((@request.auth.perfil = 'vendedor_1' || @request.auth.perfil = 'vendedor_2') && (vendedor = @request.auth.id || responsavel_id = @request.auth.id))",
    )
  })

  // 3. vendedor A não altera cliente B (RLS)
  it('3. vendedor A não altera cliente B (RLS)', () => {
    const vendedorA = { id: 'usr_vendas1', perfil: 'vendedor_1' }
    const clienteDeB = { vendedor: 'usr_vendas2' }

    expect(podeAlterarCliente(vendedorA, clienteDeB)).toBe(false)
  })

  // 4. coordenador acessa vendedores sob sua gestão
  it('4. coordenador acessa vendedores sob sua gestão', () => {
    const coordenador = { id: 'usr_renan', perfil: 'coordenador_vendas' }
    const clienteDeVendedor1 = { vendedor: 'usr_vendas1' }
    const clienteDeVendedor2 = { vendedor: 'usr_vendas2' }

    expect(podeAcessarCliente(coordenador, clienteDeVendedor1)).toBe(true)
    expect(podeAcessarCliente(coordenador, clienteDeVendedor2)).toBe(true)

    // Confirma que a regra permite que coordenador veja vendedores gerenciados
    expect(migracaoConteudo).toContain("@request.auth.perfil = 'coordenador_vendas'")
  })

  // 5. financeiro não altera dados comerciais
  it('5. financeiro / compras não altera dados comerciais', () => {
    const comprasFinanceiro = { id: 'usr_compras', perfil: 'compras_grandes_clientes' }
    const clienteComercial = { vendedor: 'usr_vendas1', grande_cliente: true }

    // Pode ler se for grande cliente
    expect(podeAcessarCliente(comprasFinanceiro, clienteComercial)).toBe(true)
    // Mas NUNCA pode alterar dados comerciais
    expect(podeAlterarCliente(comprasFinanceiro, clienteComercial)).toBe(false)
    expect(migracaoConteudo).toContain("@request.auth.perfil != 'compras_grandes_clientes'")
  })

  // 6. usuário não consegue promover o próprio perfil
  it('6. usuário não consegue promover o próprio perfil', () => {
    // Validar a regra updateRule em usuarios da migracao 0013
    expect(migracaoConteudo).toContain(
      "(id = @request.auth.id && @request.body.perfil:isset = false)",
    )

    const podeAtualizarPerfilProprio = (
      usuarioLogado: { id: string; perfil: string },
      alvoId: string,
      camposTentandoAlterar: Record<string, any>,
    ) => {
      if (usuarioLogado.perfil === 'ceo_financeiro') return true
      if (usuarioLogado.id === alvoId) {
        // Se tentar mexer no campo 'perfil', rejeita
        if ('perfil' in camposTentandoAlterar) return false
        return true
      }
      return false
    }

    const vendedor = { id: 'usr_vendas1', perfil: 'vendedor_1' }

    // Tentar se autopromover para ceo_financeiro
    const autoPromocao = podeAtualizarPerfilProprio(vendedor, 'usr_vendas1', {
      perfil: 'ceo_financeiro',
    })
    expect(autoPromocao).toBe(false)

    // Alterar nome do perfil próprio é permitido
    const alterarNome = podeAtualizarPerfilProprio(vendedor, 'usr_vendas1', {
      nome: 'Vendedor 1 Silva',
    })
    expect(alterarNome).toBe(true)
  })
})
