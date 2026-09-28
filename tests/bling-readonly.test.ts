import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Teste 14: Bling continua sem POST/PUT/PATCH/DELETE (Read-Only estrito)
 * Varredura estática de código no projeto em busca de qualquer chamada de mutação ao Bling
 */

describe('14. Integração Bling ERP - Somente Leitura (Read-Only)', () => {
  it('Bling continua sem POST/PUT/PATCH/DELETE em chamadas externas', () => {
    // 1. Verificar o hook de importação do Bling
    const hookBlingPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
    const hookBlingConteudo = fs.readFileSync(hookBlingPath, 'utf-8')

    // Deve usar exclusivamente GET
    expect(hookBlingConteudo).toContain("method: 'GET'")

    // NUNCA deve chamar api.bling.com.br com POST, PUT, PATCH ou DELETE
    expect(hookBlingConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*POST/)
    expect(hookBlingConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PUT/)
    expect(hookBlingConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*PATCH/)
    expect(hookBlingConteudo).not.toMatch(/api\.bling\.com\.br[^`"']*DELETE/)

    // 2. Varredura nos arquivos de frontend (src/pages/IntegracoesPage.tsx e src/pages/ImportacaoPage.tsx)
    const arquivosParaVerificar = [
      'src/pages/IntegracoesPage.tsx',
      'src/pages/ImportacaoPage.tsx',
    ]

    for (const relPath of arquivosParaVerificar) {
      const fullPath = path.resolve(process.cwd(), relPath)
      if (fs.existsSync(fullPath)) {
        const conteudo = fs.readFileSync(fullPath, 'utf-8')
        // Não deve haver chamadas diretas de escrita para a API do Bling
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*POST/i)
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*PUT/i)
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*DELETE/i)
      }
    }
  })
})
