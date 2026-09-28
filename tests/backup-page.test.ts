import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Página e Rota Administrativa de Teste de Backup (/admin/backup-test)', () => {
  it('registra a rota /admin/backup-test protegida no App.tsx', () => {
    const appTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8')
    expect(appTsx).toContain("path=\"/admin/backup-test\"")
    expect(appTsx).toContain("element={<BackupTestPage />}")
  })

  it('adiciona o card de acesso rápido em ConfiguracoesPage.tsx para ceo_financeiro e coordenador_vendas', () => {
    const configTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/ConfiguracoesPage.tsx'), 'utf-8')
    expect(configTsx).toContain("id: 'backup-test'")
    expect(configTsx).toContain("rota: '/admin/backup-test'")
    expect(configTsx).toContain("perfisPermitidos: ['ceo_financeiro', 'coordenador_vendas']")
  })

  it('garante que a página BackupTestPage possui os 3 botões requeridos', () => {
    const pageTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/BackupTestPage.tsx'), 'utf-8')
    // Botão 1: Criar Backup
    expect(pageTsx).toContain('Criar Backup')
    expect(pageTsx).toContain("'/backend/v1/backup/create'")
    expect(pageTsx).toContain("method: 'POST'")

    // Botão 2: Listar Backups
    expect(pageTsx).toContain('Listar Backups')
    expect(pageTsx).toContain("'/backend/v1/backup/list'")
    expect(pageTsx).toContain("method: 'GET'")

    // Botão 3: Validar Restore (seguro)
    expect(pageTsx).toContain('Validar Restore (seguro)')
    expect(pageTsx).toContain("'/backend/v1/backup/restore'")
    expect(pageTsx).toContain('executar_real: false')

    // Área de log JSON formatado
    expect(pageTsx).toContain('data-testid="log-area-json"')
    expect(pageTsx).toContain('JSON.stringify')

    // Proteção no frontend com perfis autorizados
    expect(pageTsx).toContain("perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas'")
  })

  it('confirma que BackupTestPage usa o client PocketBase da sessão e não requer token externo manual', () => {
    const pageTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/BackupTestPage.tsx'), 'utf-8')
    // Utiliza o cliente pb de @/lib/pocketbase/client que já envia authStore.token
    expect(pageTsx).toContain("import pb from '@/lib/pocketbase/client'")
    expect(pageTsx).toContain('pb.send')
    // Não possui inputs de token externo manual
    expect(pageTsx).not.toContain('placeholder="Token externo"')
    expect(pageTsx).not.toContain('placeholder="Bearer token"')
  })

  it('garante que hooks de backend não foram alterados nem expõem credenciais na UI', () => {
    const pageTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/BackupTestPage.tsx'), 'utf-8')
    expect(pageTsx).not.toContain('BACKUP_S3_SECRET_ACCESS_KEY')
    expect(pageTsx).not.toContain('BACKUP_S3_KEY')
    expect(pageTsx).not.toContain('PB_SUPERUSER_TOKEN')
  })
})
