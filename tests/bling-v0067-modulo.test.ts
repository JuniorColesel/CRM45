import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('v0.0.67 - Reestruturação do Módulo Bling ERP', () => {
  // =========================================================================
  // 1. NOVA ROTA /bling
  // =========================================================================
  it('registra a rota /bling no App.tsx associada ao BlingPage', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx')
    const conteudo = fs.readFileSync(appPath, 'utf-8')

    expect(conteudo).toContain("import BlingPage from './pages/BlingPage'")
    expect(conteudo).toMatch(/<Route\s+path="\/bling"\s+element={<BlingPage\s*\/>}\s*\/>/)
  })

  it('adiciona item "Bling ERP" na navegação do Layout.tsx com restrição por perfil', () => {
    const layoutPath = path.resolve(process.cwd(), 'src/components/Layout.tsx')
    const conteudo = fs.readFileSync(layoutPath, 'utf-8')

    expect(conteudo).toContain("name: 'Bling ERP'")
    expect(conteudo).toContain("href: '/bling'")
    expect(conteudo).toMatch(/perfisPermitidos:\s*\[\s*'ceo_financeiro',\s*'coordenador_vendas'\s*\]/)
  })

  it('adiciona card de atalho para o Bling ERP em ConfiguracoesPage.tsx', () => {
    const configPath = path.resolve(process.cwd(), 'src/pages/ConfiguracoesPage.tsx')
    const conteudo = fs.readFileSync(configPath, 'utf-8')

    expect(conteudo).toContain("id: 'bling'")
    expect(conteudo).toContain("rota: '/bling'")
    expect(conteudo).toContain('Bling ERP (Integração Direta)')
  })

  // =========================================================================
  // 2. /integracoes LIMPA E GENÉRICA (SEM CONTROLES OPERACIONAIS DO BLING)
  // =========================================================================
  it('garante que /integracoes não contém mais campo de token manual legado nem botões operacionais', () => {
    const integracoesPath = path.resolve(process.cwd(), 'src/pages/IntegracoesPage.tsx')
    const conteudo = fs.readFileSync(integracoesPath, 'utf-8')

    // Botões operacionais removidos da página
    expect(conteudo).not.toContain('handleConectarBlingOAuth')
    expect(conteudo).not.toContain('handleSincronizarBling')
    expect(conteudo).not.toContain('handleSalvarBling')
    expect(conteudo).not.toContain('Salvar Token Legado')
    expect(conteudo).not.toContain('Token de API Legado (Bling)')
    expect(conteudo).not.toContain('SINCRONIZAR BLING')

    // Contém apenas o card resumido com o botão "ABRIR INTEGRAÇÃO BLING"
    expect(conteudo).toContain('ABRIR INTEGRAÇÃO BLING')
    expect(conteudo).toContain("navigate('/bling')")
  })

  // =========================================================================
  // 3. ESTRUTURA DA PÁGINA BlingPage.tsx
  // =========================================================================
  it('possui as 8 seções obrigatórias no BlingPage.tsx', () => {
    const blingPagePath = path.resolve(process.cwd(), 'src/pages/BlingPage.tsx')
    const conteudo = fs.readFileSync(blingPagePath, 'utf-8')

    // 1. Cabeçalho
    expect(conteudo).toContain('Bling ERP')
    expect(conteudo).toContain('Conexão e sincronização em modo somente leitura.')

    // 2. Seção Conexão
    expect(conteudo).toContain('Conexão com o Bling')
    expect(conteudo).toContain('CONECTAR AO BLING')
    expect(conteudo).toContain('RECONECTAR')
    expect(conteudo).toContain('DESCONECTAR')

    // 3. Seção Sincronização
    expect(conteudo).toContain('Sincronização')
    expect(conteudo).toContain('SINCRONIZAR AGORA')
    expect(conteudo).toContain('/backend/v1/bling/sincronizar')

    // 4. Seção Clientes
    expect(conteudo).toContain('Clientes do Bling')
    expect(conteudo).toContain('Com Bling ID')

    // 5. Seção Vendas
    expect(conteudo).toContain('Vendas / Pedidos')
    expect(conteudo).toContain('Valor Total Consolidado em Vendas')

    // 6. Seção Logs
    expect(conteudo).toContain('Histórico de Sincronizações (Logs)')
    expect(conteudo).toContain('bling_sync_logs')

    // 7. Seção Diagnóstico (exclusivo CEO)
    expect(conteudo).toContain('Diagnóstico da Conexão (Somente CEO)')

    // 8. Seção Configurações (Read-only + extensões)
    expect(conteudo).toContain('Configurações da Integração')
    expect(conteudo).toContain('SOMENTE LEITURA')
    expect(conteudo).toContain('Extensões Planejadas do Módulo Bling ERP')
  })

  // =========================================================================
  // 4. FLUXO OAUTH E POPUP NEUTRO (iniciarConexaoBling)
  // =========================================================================
  it('valida o helper iniciarConexaoBling: popup neutro, backend connect e polling', async () => {
    const { iniciarConexaoBling } = await import('@/lib/bling/iniciarConexaoBling')
    const pb = (await import('@/lib/pocketbase/client')).default

    const mockReplace = vi.fn()
    const mockWindowOpen = vi.fn().mockReturnValue({
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      location: {
        href: 'about:blank',
        replace: mockReplace,
      },
      document: {
        title: '',
        body: { innerHTML: '' },
      },
    })

    // Mock do window.open
    const originalWindowOpen = window.open
    window.open = mockWindowOpen

    // Mock do pb.send com a estrutura real exata gerada pelo hook do PocketBase
    const urlEsperadaBling =
      'https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=bling_client_xyz&redirect_uri=https%3A%2F%2Fexemplo.com%2Fbackend%2Fv1%2Fbling%2Fcallback&state=state_secreto_64_caracteres_xyz&scope=contatos%3Aread%20pedidos-vendas%3Aread'

    const pbSendSpy = vi.spyOn(pb, 'send').mockImplementation(async (pathStr: string) => {
      if (pathStr.includes('/backend/v1/bling/connect')) {
        return {
          success: true,
          auth_url: urlEsperadaBling,
          state: 'state_secreto_64_caracteres_xyz',
        }
      }
      if (pathStr.includes('/backend/v1/bling/status')) {
        return {
          conectado: true,
          status: 'conectado',
        }
      }
      return {}
    })

    const onStatusChange = vi.fn()
    const onSuccess = vi.fn()

    const conexao = await iniciarConexaoBling({
      pollIntervalMs: 50,
      maxTimeoutMs: 1000,
      onStatusChange,
      onSuccess,
    })

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'about:blank',
      'oauth_bling_popup',
      expect.stringContaining('width=650,height=750'),
    )

    expect(pbSendSpy).toHaveBeenCalledWith('/backend/v1/bling/connect?format=json', {
      method: 'GET',
    })

    // Valida que o popup navegou exatamente para a URL retornada via replace
    expect(mockReplace).toHaveBeenCalledWith(urlEsperadaBling)

    // Aguardar o polling detectar conexão
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(onSuccess).toHaveBeenCalled()
    conexao.cancelar()

    // Restaurar
    window.open = originalWindowOpen
    pbSendSpy.mockRestore()
  })

  it('rejeita navegação do popup se a URL retornada não pertencer ao domínio oficial do Bling', async () => {
    const { iniciarConexaoBling } = await import('@/lib/bling/iniciarConexaoBling')
    const pb = (await import('@/lib/pocketbase/client')).default

    const popupMock = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      location: { href: 'about:blank', replace: vi.fn() },
      document: { title: '', body: { innerHTML: '' } },
    }
    const originalWindowOpen = window.open
    window.open = vi.fn().mockReturnValue(popupMock)

    // Simula resposta maliciosa ou errada retornando URL interna do CRM
    const pbSendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      auth_url: 'https://crm.colesel.com.br/integracoes',
    })

    const onError = vi.fn()
    await iniciarConexaoBling({ onError })

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('URL de autorização retornada pelo servidor não pertence ao Bling ERP'),
    )
    expect(popupMock.close).toHaveBeenCalled()
    expect(popupMock.location.replace).not.toHaveBeenCalled()

    window.open = originalWindowOpen
    pbSendSpy.mockRestore()
  })

  it('fecha popup, cancela fluxo e não inicia polling quando payload não tem auth_url válida', async () => {
    const { iniciarConexaoBling } = await import('@/lib/bling/iniciarConexaoBling')
    const pb = (await import('@/lib/pocketbase/client')).default

    const popupMock = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      location: { href: 'about:blank', replace: vi.fn() },
      document: { title: '', body: { innerHTML: '' } },
    }
    const originalWindowOpen = window.open
    window.open = vi.fn().mockReturnValue(popupMock)

    const pbSendSpy = vi.spyOn(pb, 'send').mockImplementation(async (pathStr: string) => {
      if (pathStr.includes('/backend/v1/bling/connect')) {
        return {
          success: false,
          message: 'BLING_CLIENT_ID ausente nos secrets',
        }
      }
      return {}
    })

    const onError = vi.fn()
    const onStatusChange = vi.fn()
    await iniciarConexaoBling({ onError, onStatusChange })

    expect(onError).toHaveBeenCalledWith('BLING_CLIENT_ID ausente nos secrets')
    expect(popupMock.close).toHaveBeenCalled()
    expect(popupMock.location.replace).not.toHaveBeenCalled()
    expect(onStatusChange).not.toHaveBeenCalled()

    window.open = originalWindowOpen
    pbSendSpy.mockRestore()
  })

  it('rejeita URL do Bling com parâmetros OAuth faltando (response_type, client_id, redirect_uri, state)', async () => {
    const { iniciarConexaoBling } = await import('@/lib/bling/iniciarConexaoBling')
    const pb = (await import('@/lib/pocketbase/client')).default

    const popupMock = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      location: { href: 'about:blank', replace: vi.fn() },
      document: { title: '', body: { innerHTML: '' } },
    }
    const originalWindowOpen = window.open
    window.open = vi.fn().mockReturnValue(popupMock)

    // Falta redirect_uri e state
    const pbSendSpy = vi.spyOn(pb, 'send').mockResolvedValueOnce({
      success: true,
      auth_url: 'https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=123',
    })

    const onError = vi.fn()
    await iniciarConexaoBling({ onError })

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('URL de autorização retornada pelo servidor não pertence ao Bling ERP ou possui parâmetros ausentes'),
    )
    expect(popupMock.close).toHaveBeenCalled()
    expect(popupMock.location.replace).not.toHaveBeenCalled()

    window.open = originalWindowOpen
    pbSendSpy.mockRestore()
  })

  // =========================================================================
  // 4.1 DIAGNÓSTICO DE REDIRECT URI NO FRONTEND (v0.0.70)
  // =========================================================================
  it('exibe linha de diagnóstico "Redirect URI em uso", badge de comparação e botão de cópia no BlingPage.tsx', () => {
    const blingPagePath = path.resolve(process.cwd(), 'src/pages/BlingPage.tsx')
    const conteudo = fs.readFileSync(blingPagePath, 'utf-8')

    expect(conteudo).toContain('Redirect URI em uso')
    expect(conteudo).toContain('✓ igual à esperada')
    expect(conteudo).toContain('⚠ difere do esperado')
    expect(conteudo).toContain('⚠ não configurada')
    expect(conteudo).toContain('Valor efetivo enviado ao Bling:')
    expect(conteudo).toContain('Valor esperado pelo navegador atual:')
    expect(conteudo).toContain('Copiar esperada')
    expect(conteudo).toContain('Copiar efetiva')
  })

  // =========================================================================
  // 5. READ-ONLY E ZERO VAZAMENTO DE TOKENS
  // =========================================================================
  it('garante que nenhum segredo do Bling é exposto no código do módulo frontend', () => {
    const blingPagePath = path.resolve(process.cwd(), 'src/pages/BlingPage.tsx')
    const helperPath = path.resolve(process.cwd(), 'src/lib/bling/iniciarConexaoBling.ts')

    const conteudoPage = fs.readFileSync(blingPagePath, 'utf-8')
    const conteudoHelper = fs.readFileSync(helperPath, 'utf-8')

    // client_secret e refresh_token literais nunca no frontend
    expect(conteudoPage).not.toMatch(/BLING_CLIENT_SECRET\s*=/)
    expect(conteudoHelper).not.toMatch(/BLING_CLIENT_SECRET\s*=/)

    // Sem endpoints de escrita no Bling
    expect(conteudoPage).not.toMatch(/api\.bling\.com\.br/)
    expect(conteudoHelper).not.toMatch(/api\.bling\.com\.br/)
  })
})
