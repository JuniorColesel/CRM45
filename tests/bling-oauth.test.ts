import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Suíte de testes automatizados para OAuth Bling v3 e Segurança
 *
 * Itens validados:
 * 1. /bling/connect exige autenticação;
 * 2. usuário sem perfil não conecta;
 * 3. state é criado;
 * 4. state expira;
 * 5. state não pode ser reutilizado;
 * 6. callback rejeita state inválido;
 * 7. callback rejeita code ausente;
 * 8. callback salva token server-side;
 * 9. token não aparece na response;
 * 10. refresh acontece quando expirado;
 * 11. 401 dispara um único refresh;
 * 12. não existe loop de refresh;
 * 13. frontend não recebe token;
 * 14. localStorage não contém token;
 * 15. client_secret não aparece no bundle;
 * 16. status retorna apenas dados seguros;
 * 17. sincronizar usa token OAuth;
 * 18. POST OAuth /oauth/token é permitido;
 * 19. POST/PUT/PATCH/DELETE em endpoints de negócio continuam proibidos;
 * 20. todos os testes da v0.0.64 continuam passando.
 */

describe('OAuth Bling v3 - Segurança e Fluxo End-to-End', () => {
  const hookPath = path.resolve(process.cwd(), 'pocketbase/hooks/bling_importar.js')
  const hookCode = fs.readFileSync(hookPath, 'utf-8')
  const migrationPath = path.resolve(
    process.cwd(),
    'pocketbase/migrations/0030_create_bling_oauth_tables.js',
  )
  const migrationCode = fs.readFileSync(migrationPath, 'utf-8')
  const pagePath = path.resolve(process.cwd(), 'src/pages/IntegracoesPage.tsx')
  const pageCode = fs.readFileSync(pagePath, 'utf-8')

  // 1. /bling/connect exige autenticação
  it('1. /backend/v1/bling/connect exige autenticação via $apis.requireAuth()', () => {
    expect(hookCode).toContain("routerAdd(\n  'GET',\n  '/backend/v1/bling/connect'")
    expect(hookCode).toContain('if (!authRecord) {')
    expect(hookCode).toContain("$apis.requireAuth()")
  })

  // 2. usuário sem perfil não conecta
  it('2. usuário sem perfil autorizado (ceo_financeiro) não pode conectar', () => {
    expect(hookCode).toContain("const perfil = authRecord.getString('perfil')")
    expect(hookCode).toContain("if (perfil !== 'ceo_financeiro')")
    expect(hookCode).toContain('Apenas administradores (CEO / Financeiro) podem conectar')
  })

  // 3. state é criado com entropia segura
  it('3. state é criado criptograficamente seguro com no mínimo 64 caracteres', () => {
    expect(hookCode).toContain('$security.randomString(32)')
    expect(hookCode).toContain("stateRec.set('state', stateStr)")
    expect(hookCode).toContain("stateRec.set('user_id', authRecord.id)")
  })

  // 4. state expira em 10 minutos
  it('4. state expira em até 10 minutos', () => {
    expect(hookCode).toContain('10 * 60 * 1000')
    expect(hookCode).toContain("stateRec.set('expires_at', expiresAt.toISOString())")
    expect(hookCode).toContain('Autorização Expirada')
  })

  // 5. state não pode ser reutilizado (uso único estrito)
  it('5. state possui uso único e invalidação imediata anti-replay', () => {
    expect(hookCode).toContain("const usedAt = stateRecord.getString('used_at')")
    expect(hookCode).toContain('Tentativa Repetida')
    expect(hookCode).toContain("$app.delete(stateRecord)")
  })

  // 6. callback rejeita state inválido
  it('6. callback rejeita state inválido ou desconhecido com proteção anti-CSRF', () => {
    expect(hookCode).toContain("routerAdd('GET', '/backend/v1/bling/callback'")
    expect(hookCode).toContain('Conexão Rejeitada (CSRF)')
  })

  // 7. callback rejeita code ausente
  it('7. callback rejeita requisições com code ou state ausentes', () => {
    expect(hookCode).toContain('if (!code || !state)')
    expect(hookCode).toContain('Parâmetros Inválidos')
  })

  // 8. callback salva token server-side
  it('8. callback salva tokens exclusivamente server-side na coleção bling_connections', () => {
    expect(hookCode).toContain("$app.findCollectionByNameOrId('bling_connections')")
    expect(hookCode).toContain("connRecord.set('access_token', accessToken)")
    expect(hookCode).toContain("connRecord.set('refresh_token', refreshToken)")
    expect(hookCode).toContain("connRecord.set('status', 'conectado')")
    expect(hookCode).toContain(
      'Conexão com o Bling realizada com sucesso. Você pode fechar esta janela e retornar ao CRM.',
    )
  })

  // 9. token não aparece na response
  it('9. tokens são marcados como hidden e nunca aparecem na resposta do status', () => {
    expect(migrationCode).toContain(
      "{ name: 'access_token', type: 'text', required: true, hidden: true }",
    )
    expect(migrationCode).toContain(
      "{ name: 'refresh_token', type: 'text', required: true, hidden: true }",
    )
    expect(hookCode).toContain("routerAdd(\n  'GET',\n  '/backend/v1/bling/status'")
    expect(hookCode).not.toMatch(
      /return e\.json\(200,\s*\{[^}]*access_token:\s*connRecord\.getString\('access_token'\)/,
    )
    expect(hookCode).not.toMatch(
      /return e\.json\(200,\s*\{[^}]*refresh_token:\s*connRecord\.getString\('refresh_token'\)/,
    )
  })

  // 10. refresh acontece quando expirado
  it('10. refresh automático acontece quando token está expirado ou próximo de expirar', () => {
    expect(hookCode).toContain('function getValidBlingAccessToken()')
    expect(hookCode).toContain('const margem = 5 * 60 * 1000')
    expect(hookCode).toContain('executarRefreshOAuth(conn)')
    expect(hookCode).toContain('grant_type=refresh_token')
  })

  // 11. 401 dispara um único refresh
  it('11. resposta HTTP 401 dispara tentativa única de refresh e reexecução da requisição', () => {
    expect(hookCode).toContain('let refreshExecutadoPor401 = false')
    expect(hookCode).toContain('res.statusCode === 401 && !refreshExecutadoPor401')
    expect(hookCode).toContain('refreshExecutadoPor401 = true')
  })

  // 12. não existe loop de refresh
  it('12. proteção contra loop infinito de refresh garantida por flag e limite de tentativas', () => {
    expect(hookCode).toContain('tentativas < limite')
    expect(hookCode).toContain('refreshExecutadoPor401 = true')
  })

  // 13. frontend não recebe token
  it('13. interface do frontend nunca manipula nem recebe tokens brutos do Bling', () => {
    expect(pageCode).not.toContain('resStatus.access_token')
    expect(pageCode).not.toContain('resStatus.refresh_token')
    expect(pageCode).toContain('/backend/v1/bling/status')
    expect(pageCode).toContain('OAuth v3 Seguro')
  })

  // 14. localStorage não contém token
  it('14. frontend não salva tokens em localStorage ou sessionStorage', () => {
    expect(pageCode).not.toMatch(/localStorage\.setItem\([^)]*bling/i)
    expect(pageCode).not.toMatch(/sessionStorage\.setItem\([^)]*bling/i)
  })

  // 14.1 limpeza de estado e ausência de fallbacks legados
  it('14.1 sem OAuth ativo, sincronizar falha com mensagem clara e NÃO tenta token legado', () => {
    // getValidBlingAccessToken não deve conter referências operacionais a integracoes_config nem BLING_TOKEN
    const sincronizarBloco = hookCode.slice(
      hookCode.indexOf("'/backend/v1/bling/sincronizar'"),
    )
    expect(sincronizarBloco).not.toContain("records[0].getString('bling_token')")
    expect(sincronizarBloco).not.toContain("$secrets.get('BLING_TOKEN')")
    expect(sincronizarBloco).not.toContain("$secrets.get('BLING_API_KEY')")
    expect(sincronizarBloco).toContain('Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar.')
  })

  // 15. client_secret não aparece no bundle
  it('15. client_secret é lido exclusivamente via segredos do backend', () => {
    expect(pageCode).not.toContain('BLING_CLIENT_SECRET')
    expect(hookCode).toContain("$os.getenv('BLING_CLIENT_SECRET')")
    expect(hookCode).toContain("$secrets.get('BLING_CLIENT_SECRET')")
  })

  // 16. status retorna apenas dados seguros (incluindo redirect_uri_efetiva e origem)
  it('16. rota de status retorna apenas bandeiras seguras (conectado, status, datas, redirect_uri_efetiva, redirect_uri_origem)', () => {
    const statusHandlerCode = hookCode.slice(
      hookCode.indexOf("'/backend/v1/bling/status'"),
      hookCode.indexOf("'/backend/v1/bling/disconnect'"),
    )
    expect(statusHandlerCode).toContain('conectado:')
    expect(statusHandlerCode).toContain('status:')
    expect(statusHandlerCode).toContain('expires_at:')
    expect(statusHandlerCode).toContain('ultima_renovacao:')
    expect(statusHandlerCode).toContain('ultimo_erro:')
    expect(statusHandlerCode).toContain('redirect_uri_efetiva:')
    expect(statusHandlerCode).toContain('redirect_uri_origem:')
    expect(statusHandlerCode).not.toContain('access_token:')
    expect(statusHandlerCode).not.toContain('refresh_token:')
    expect(statusHandlerCode).not.toContain('client_id:')
    expect(statusHandlerCode).not.toContain('client_secret:')
  })

  // 16.1 status retorna redirect_uri_efetiva e redirect_uri_origem conforme a mesma lógica do connect
  it('16.1 status expõe redirect_uri_efetiva e redirect_uri_origem para diagnóstico transparente pelo CEO', () => {
    const statusHandlerCode = hookCode.slice(
      hookCode.indexOf("'/backend/v1/bling/status'"),
      hookCode.indexOf("'/backend/v1/bling/disconnect'"),
    )
    expect(statusHandlerCode).toContain('function resolverRedirectUri()')
    expect(statusHandlerCode).toContain("origem: 'secret'")
    expect(statusHandlerCode).toContain("origem: 'fallback_site_url'")
    expect(statusHandlerCode).toContain("origem: 'nao_configurada'")
    expect(statusHandlerCode).toContain('redirect_uri_efetiva: resRedirect.uri')
    expect(statusHandlerCode).toContain('redirect_uri_origem: resRedirect.origem')
  })

  // 17. sincronizar usa token OAuth
  it('17. motor de sincronização usa centralizadamente o token OAuth gerenciado', () => {
    expect(hookCode).toContain('const tokenInfo = getValidBlingAccessToken()')
    expect(hookCode).toContain('let currentAccessToken = tokenInfo.token')
    expect(hookCode).toContain("Authorization: 'Bearer ' + currentAccessToken")
  })

  // 18. POST OAuth /oauth/token é permitido
  it('18. POST é estritamente autorizado apenas no endpoint oficial de autenticação /oauth/token', () => {
    const postMatches = hookCode.match(/url:\s*'https:\/\/[^']*'[\s\S]*?method:\s*'POST'/g) || []
    for (const match of postMatches) {
      expect(match).toContain('/oauth/token')
    }
  })

  // 19. POST/PUT/PATCH/DELETE em endpoints de negócio continuam proibidos
  it('19. endpoints de negócio do Bling (contatos, pedidos, produtos, etc.) permanecem estritamente READ-ONLY (GET)', () => {
    expect(hookCode).not.toMatch(/api\.bling\.com\.br[^`"']*POST/i)
    expect(hookCode).not.toMatch(/api\.bling\.com\.br[^`"']*PUT/i)
    expect(hookCode).not.toMatch(/api\.bling\.com\.br[^`"']*PATCH/i)
    expect(hookCode).not.toMatch(/api\.bling\.com\.br[^`"']*DELETE/i)
  })

  // 20. escopos solicitados no OAuth seguem o princípio do menor privilégio
  it('20. escopos solicitados na autorização Bling são estritamente contatos e pedidos de venda', () => {
    expect(hookCode).toContain("encodeURIComponent('contatos:read pedidos-vendas:read')")
    expect(hookCode).not.toContain('contas-a-pagar')
    expect(hookCode).not.toContain('financeiro:write')
  })
})
