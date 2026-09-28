import { describe, it, expect } from 'vitest'
import { executarBackupSnapshot, executarRestoreIsolado } from '../scripts/backup_restore_test'

/**
 * Teste Adicional: Validação de Backup + Restore com Integridade Estrita de Contagens (P0-7)
 */

describe('Backup e Restore com Integridade de Contagens (P0-7)', () => {
  it('executa restore completo e valida contagens exatas antes e depois', () => {
    // Mock com dados representativos das coleções essenciais do CRM Colesel
    const mockDb = {
      users: [
        { id: 'usr_sys_1', name: 'Admin', avatar: 'avatar_sample.png' },
      ],
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
    expect(snapshot.colecoes.users.total).toBe(1)
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
    expect(resultado.contagensDepois.users).toBe(resultado.contagensAntes.users)
    expect(resultado.contagensDepois.usuarios).toBe(resultado.contagensAntes.usuarios)
    expect(resultado.contagensDepois.clientes).toBe(resultado.contagensAntes.clientes)
    expect(resultado.contagensDepois.oportunidades).toBe(resultado.contagensAntes.oportunidades)
    expect(resultado.contagensDepois.conversas_whatsapp).toBe(resultado.contagensAntes.conversas_whatsapp)
  })

  it('valida estrutura dos hooks de backup externo R2, rotas e SigV4', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')

    const hookDiario = fs.readFileSync(path.resolve(process.cwd(), 'pocketbase/hooks/backup_diario.js'), 'utf-8')
    const hookCreate = fs.readFileSync(path.resolve(process.cwd(), 'pocketbase/hooks/backup_create.js'), 'utf-8')
    const hookList = fs.readFileSync(path.resolve(process.cwd(), 'pocketbase/hooks/backup_list.js'), 'utf-8')
    const hookRestore = fs.readFileSync(path.resolve(process.cwd(), 'pocketbase/hooks/backup_restore.js'), 'utf-8')

    // Cron diário 06:00 UTC (03:00 Horário de Brasília)
    expect(hookDiario).toContain("'0 6 * * *'")

    // Credenciais lidas exclusivamente do ambiente ($os.getenv / $secrets.get)
    for (const hook of [hookDiario, hookCreate, hookList, hookRestore]) {
      expect(hook).toContain('BACKUP_S3_BUCKET')
      expect(hook).toContain('BACKUP_S3_ENDPOINT')
      expect(hook).toContain('BACKUP_S3_KEY')
      expect(hook).toContain('BACKUP_S3_SECRET')
      // Nenhuma credencial hardcoded
      expect(hook).not.toMatch(/BACKUP_S3_KEY\s*=\s*['"][a-zA-Z0-9]{10,}['"]/)
      expect(hook).not.toMatch(/BACKUP_S3_SECRET\s*=\s*['"][a-zA-Z0-9]{10,}['"]/)
    }

    // Pré-voo de conexão e tratamento de erros do Cloudflare R2
    expect(hookCreate).toContain('parseR2Error')
    expect(hookCreate).toContain('Credenciais inválidas para o R2')
    expect(hookCreate).toContain('Bucket não encontrado')
    expect(hookCreate).toContain('list-type=2&max-keys=1')

    expect(hookList).toContain('parseR2Error')
    expect(hookList).toContain('Credenciais inválidas para o R2')

    expect(hookRestore).toContain('parseR2Error')
    expect(hookRestore).toContain('Credenciais inválidas para o R2')

    // Rotas registradas com autenticação admin
    expect(hookCreate).toContain("routerAdd(\n  'POST',\n  '/backend/v1/backup/create'")
    expect(hookCreate).toContain('$apis.requireAuth()')

    expect(hookList).toContain("routerAdd(\n  'GET',\n  '/backend/v1/backup/list'")
    expect(hookList).toContain('$apis.requireAuth()')

    expect(hookRestore).toContain("routerAdd(\n  'POST',\n  '/backend/v1/backup/restore'")
    expect(hookRestore).toContain('$apis.requireAuth()')

    // Rotação efetiva com DeleteObject na API S3
    expect(hookDiario).toContain("method: 'DELETE'")
    expect(hookCreate).toContain("method: 'DELETE'")
    expect(hookDiario).toContain('30 * 24 * 60 * 60 * 1000') // Retenção de 30 dias

    // Assinatura AWS SigV4 presente nos hooks
    expect(hookDiario).toContain('AWS4-HMAC-SHA256')
    expect(hookCreate).toContain('AWS4-HMAC-SHA256')
    expect(hookList).toContain('AWS4-HMAC-SHA256')
    expect(hookRestore).toContain('AWS4-HMAC-SHA256')
  })
})
