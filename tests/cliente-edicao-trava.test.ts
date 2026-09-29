import { describe, it, expect } from 'vitest'
import { podeEditarCliente, ehVendedorDoCliente, type ClienteModel } from '@/types/clientes'
import type { Usuario } from '@/contexts/AuthContext'

describe('Trava de Edição de Clientes entre Vendedores (BUG 3)', () => {
  const usuarioCeo: Usuario = {
    id: 'user_ceo',
    email: 'financeiro@colesel.com.br',
    nome: 'Alice (CEO)',
    perfil: 'ceo_financeiro',
    created: '',
    updated: '',
  }

  const usuarioCoordenador: Usuario = {
    id: 'user_coord',
    email: 'renan@colesel.com.br',
    nome: 'Renan (Coordenador)',
    perfil: 'coordenador_vendas',
    created: '',
    updated: '',
  }

  const usuarioVendedor1: Usuario = {
    id: 'user_vend1',
    email: 'karoline@colesel.com.br',
    nome: 'Karoline',
    perfil: 'vendedor_1',
    created: '',
    updated: '',
  }

  const usuarioVendedor2: Usuario = {
    id: 'user_vend2',
    email: 'vendas2@colesel.com.br',
    nome: 'Vendedor 2',
    perfil: 'vendedor_2',
    created: '',
    updated: '',
  }

  const usuarioEstoque: Usuario = {
    id: 'user_est',
    email: 'estoque@colesel.com.br',
    nome: 'Estoque',
    perfil: 'estoque',
    created: '',
    updated: '',
  }

  const clienteDoVendedor1: ClienteModel = {
    id: 'cli_1',
    nome_empresa: 'Empresa do Vendedor 1',
    nome_contato: 'Contato 1',
    vendedor: 'Karoline (Vendas 1)',
    responsavel_id: 'user_vend1',
    status_cliente: 'ativo',
    created: '',
    updated: '',
  }

  const clienteDoVendedor2: ClienteModel = {
    id: 'cli_2',
    nome_empresa: 'Empresa do Vendedor 2',
    nome_contato: 'Contato 2',
    vendedor: 'Vendas 2',
    responsavel_id: 'user_vend2',
    status_cliente: 'ativo',
    created: '',
    updated: '',
  }

  const clienteParaReativacao: ClienteModel = {
    id: 'cli_reat',
    nome_empresa: 'Empresa Abandonada',
    nome_contato: 'Contato Reativação',
    vendedor: 'Alice',
    responsavel_id: 'user_ceo',
    status_cliente: 'para_reativacao',
    created: '',
    updated: '',
  }

  it('permite que ceo_financeiro e coordenador_vendas editem qualquer cliente', () => {
    expect(podeEditarCliente(usuarioCeo, clienteDoVendedor1)).toBe(true)
    expect(podeEditarCliente(usuarioCeo, clienteDoVendedor2)).toBe(true)
    expect(podeEditarCliente(usuarioCoordenador, clienteDoVendedor1)).toBe(true)
    expect(podeEditarCliente(usuarioCoordenador, clienteDoVendedor2)).toBe(true)
  })

  it('permite que um vendedor edite seu próprio cliente (por responsavel_id ou campo vendedor)', () => {
    expect(ehVendedorDoCliente(usuarioVendedor1, clienteDoVendedor1)).toBe(true)
    expect(podeEditarCliente(usuarioVendedor1, clienteDoVendedor1)).toBe(true)

    expect(ehVendedorDoCliente(usuarioVendedor2, clienteDoVendedor2)).toBe(true)
    expect(podeEditarCliente(usuarioVendedor2, clienteDoVendedor2)).toBe(true)
  })

  it('BLOQUEIA a edição quando o cliente pertencer a outro vendedor', () => {
    // Vendedor 1 tentando editar cliente do Vendedor 2
    expect(ehVendedorDoCliente(usuarioVendedor1, clienteDoVendedor2)).toBe(false)
    expect(podeEditarCliente(usuarioVendedor1, clienteDoVendedor2)).toBe(false)

    // Vendedor 2 tentando editar cliente do Vendedor 1
    expect(ehVendedorDoCliente(usuarioVendedor2, clienteDoVendedor1)).toBe(false)
    expect(podeEditarCliente(usuarioVendedor2, clienteDoVendedor1)).toBe(false)
  })

  it('permite que qualquer vendedor edite cliente com status para_reativacao', () => {
    expect(podeEditarCliente(usuarioVendedor1, clienteParaReativacao)).toBe(true)
    expect(podeEditarCliente(usuarioVendedor2, clienteParaReativacao)).toBe(true)
  })

  it('bloqueia usuário do estoque de editar qualquer cliente', () => {
    expect(podeEditarCliente(usuarioEstoque, clienteDoVendedor1)).toBe(false)
    expect(podeEditarCliente(usuarioEstoque, clienteParaReativacao)).toBe(false)
  })
})
