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
      'src/lib/bling/blingUtils.ts',
    ]

    for (const relPath of arquivosParaVerificar) {
      const fullPath = path.resolve(process.cwd(), relPath)
      if (fs.existsSync(fullPath)) {
        const conteudo = fs.readFileSync(fullPath, 'utf-8')
        // Não deve haver chamadas diretas de escrita para a API do Bling
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*POST/i)
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*PUT/i)
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*PATCH/i)
        expect(conteudo).not.toMatch(/https:\/\/api\.bling\.com\.br[^\n]*DELETE/i)
      }
    }
  })

  it('Verificação estrita: nenhuma chamada POST/PUT/PATCH/DELETE para a API do Bling existe em todo o repositório', () => {
    // Escaneia todos os arquivos de código em pocketbase/ e src/
    const varrerDiretorio = (dir: string, arquivos: string[] = []): string[] => {
      const itens = fs.readdirSync(dir)
      for (const item of itens) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          if (!fullPath.includes('node_modules') && !fullPath.includes('.git') && !fullPath.includes('dist')) {
            varrerDiretorio(fullPath, arquivos)
          }
        } else if (/\.(js|ts|tsx)$/.test(item)) {
          arquivos.push(fullPath)
        }
      }
      return arquivos
    }

    const todosArquivos = [
      ...varrerDiretorio(path.resolve(process.cwd(), 'pocketbase')),
      ...varrerDiretorio(path.resolve(process.cwd(), 'src')),
    ]

    for (const arq of todosArquivos) {
      const conteudo = fs.readFileSync(arq, 'utf-8')
      // Proibição estrita: api.bling.com.br nunca pode ser associado com POST, PUT, PATCH ou DELETE
      expect(conteudo).not.toMatch(/api\.bling\.com\.br[^\n]*(POST|PUT|PATCH|DELETE)/i)
      expect(conteudo).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"][^\n]*api\.bling\.com\.br/i)
    }
  })
})
