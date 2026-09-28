import { describe, it, expect } from 'vitest'
import { executarBackupSnapshot, executarRestoreIsolado } from '../scripts/backup_restore_test'

/**
 * Teste Adicional: Validação de Backup + Restore com Integridade Estrita de Contagens (P0-7)
 */

describe('Backup e Restore com Integridade de Contagens (P0-7)', () => {
  it('executa restore completo e valida contagens exatas antes e depois', () => {
    // Mock com dados representativos das coleções essenciais do CRM Colesel
    const mockDb = {
      usuarios: [
        { id: 'u1', email: 'junior.colesel@coleselengenharia.com', perfil: 'ceo_financeiro' },
        { id: 'u2', email: 'alice.paitra@coleselengenharia.com', perfil: 'ceo_financeiro' },
        { id: 'u3', email: 'renan.coordenador@coleselengenharia.com', perfil: 'coordenador_vendas' },
        { id: 'u4', email: 'vendas1@coleselengenharia.com', perfil: 'vendedor_1' },
        { id: 'u5', email: 'vendas2@coleselengenharia.com', perfil: 'vendedor_2' },
      ],
      etapas_funil: [
        { id: 'e1', nome: 'Prospecção', ordem: 1 },
        { id: 'e2', nome: 'Qualificação', ordem: 2 },
        { id: 'e3', nome: 'Proposta', ordem: 3 },
        { id: 'e4', nome: 'Negociação', ordem: 4 },
        { id: 'e5', nome: 'Fechado', ordem: 5 },
      ],
      motivos_perda: [
        { id: 'm1', descricao: 'Sem interesse' },
        { id: 'm2', descricao: 'Preço alto' },
        { id: 'm3', descricao: 'Concorrente ganhou' },
        { id: 'm4', descricao: 'Sem budget' },
        { id: 'm5', descricao: 'Outro' },
      ],
      clientes: [
        { id: 'c1', nome_contato: 'Carlos Engenharia', vendedor: 'u4', grande_cliente: false },
        { id: 'c2', nome_contato: 'Construtora Beta', vendedor: 'u5', grande_cliente: true },
      ],
      oportunidades: [
        { id: 'op1', cliente_id: 'c1', valor: 45000, status: 'aberto', vendedor: 'u4' },
      ],
      conversas_whatsapp: [
        { id: 'cw1', numero: '5511999998888', status: 'aberta', vendedor: 'u4' },
      ],
      mensagens_whatsapp: [
        { id: 'mw1', conversa_id: 'cw1', texto: 'Orçamento telhas', external_id: 'ext_1' },
      ],
    }

    // 1. Executar snapshot de backup
    const snapshot = executarBackupSnapshot(mockDb)
    expect(snapshot.colecoes.usuarios.total).toBe(5)
    expect(snapshot.colecoes.etapas_funil.total).toBe(5)
    expect(snapshot.colecoes.motivos_perda.total).toBe(5)
    expect(snapshot.colecoes.clientes.total).toBe(2)
    expect(snapshot.colecoes.oportunidades.total).toBe(1)
    expect(snapshot.colecoes.conversas_whatsapp.total).toBe(1)
    expect(snapshot.colecoes.mensagens_whatsapp.total).toBe(1)

    // 2. Executar restore isolado
    const resultado = executarRestoreIsolado(snapshot)

    // 3. Validação de integridade estrita
    expect(resultado.sucesso).toBe(true)
    expect(Object.keys(resultado.diferencas).length).toBe(0)

    // Números antes e depois devem ser idênticos
    expect(resultado.contagensDepois.usuarios).toBe(resultado.contagensAntes.usuarios)
    expect(resultado.contagensDepois.clientes).toBe(resultado.contagensAntes.clientes)
    expect(resultado.contagensDepois.oportunidades).toBe(resultado.contagensAntes.oportunidades)
    expect(resultado.contagensDepois.conversas_whatsapp).toBe(resultado.contagensAntes.conversas_whatsapp)
  })
})
