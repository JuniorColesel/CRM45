/**
 * Rotas e lógica do Bling ERP no CRM Colesel 45:
 *
 * 1. GET  /backend/v1/bling/connect      -> Iniciar fluxo OAuth v3 (somente ceo_financeiro, state 64 chars, 10 min)
 * 2. GET  /backend/v1/bling/callback     -> Callback público OAuth Bling (validação state, troca de code, tela HTML de sucesso/erro)
 * 3. GET  /backend/v1/bling/status       -> Consulta de status da conexão (somente ceo_financeiro, NUNCA retorna tokens)
 * 4. POST /backend/v1/bling/disconnect   -> Desconectar Bling / revogar sessão local (somente ceo_financeiro)
 * 5. POST /backend/v1/bling/sincronizar  -> Motor de sincronização read-only v0.0.64 alimentado pelo token OAuth seguro
 * 6. POST /backend/v1/bling/importar     -> Rota legada de teste pontual (read-only)
 *
 * REGRA ABSOLUTA DE READ-ONLY DO CRM:
 * - Toda chamada de dados à api.bling.com.br usa EXCLUSIVAMENTE o método GET.
 * - Proibido POST, PUT, PATCH ou DELETE em endpoints de negócio do Bling.
 * - ÚNICA exceção técnica: POST em https://www.bling.com.br/Api/v3/oauth/token exclusivamente para
 *   troca/renovação de credenciais OAuth exigida pelo padrão RFC 6749.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback (escopo isolado de VM do goja)!
 */

// ============================================================================
// 1. ROTA DE CONEXÃO: GET /backend/v1/bling/connect
// ============================================================================
routerAdd(
  'GET',
  '/backend/v1/bling/connect',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas administradores (CEO / Financeiro) podem conectar o CRM ao Bling ERP.',
      })
    }

    // Função auxiliar interna para resolução da redirect_uri
    function resolverRedirectUri() {
      let uri = ''
      try {
        uri = $os.getenv('BLING_REDIRECT_URI') || $secrets.get('BLING_REDIRECT_URI') || ''
      } catch (_) {}
      if (uri) {
        return { uri: uri, origem: 'secret' }
      }

      let siteUrl = ''
      try {
        siteUrl = $os.getenv('SITE_URL') || $os.getenv('PB_INSTANCE_URL') || ''
      } catch (_) {}
      if (siteUrl) {
        if (siteUrl.endsWith('/')) siteUrl = siteUrl.slice(0, -1)
        return { uri: siteUrl + '/backend/v1/bling/callback', origem: 'fallback_site_url' }
      }

      return { uri: '', origem: 'nao_configurada' }
    }

    // Leitura dos secrets de ambiente
    let clientId = ''
    try {
      clientId = $os.getenv('BLING_CLIENT_ID') || $secrets.get('BLING_CLIENT_ID') || ''
    } catch (_) {}

    const resRedirect = resolverRedirectUri()
    const redirectUri = resRedirect.uri

    if (!clientId) {
      return e.json(400, {
        success: false,
        configurado: false,
        message:
          'Credenciais do Bling não configuradas no servidor (BLING_CLIENT_ID ausente nos secrets). Configure os segredos de ambiente antes de conectar.',
      })
    }

    // Gerar state criptograficamente seguro (mínimo 64 caracteres)
    const stateStr =
      $security.randomString(32) + $security.randomString(32) + $security.randomString(8)

    // Validade máxima de 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    try {
      const stateCol = $app.findCollectionByNameOrId('bling_oauth_states')
      const stateRec = new Record(stateCol)
      stateRec.set('state', stateStr)
      stateRec.set('user_id', authRecord.id)
      stateRec.set('expires_at', expiresAt.toISOString())
      $app.save(stateRec)
    } catch (saveErr) {
      return e.json(500, {
        success: false,
        message:
          'Falha ao registrar estado de segurança OAuth: ' + String(saveErr.message || saveErr),
      })
    }

    // Escopos de menor privilégio: estritamente contatos e pedidos de venda
    // Conforme especificação, sem permissões de contas a pagar, baixas, borderôs ou contábil
    const scopes = encodeURIComponent('contatos:read pedidos-vendas:read')
    const authUrl =
      'https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=' +
      encodeURIComponent(clientId) +
      '&redirect_uri=' +
      encodeURIComponent(redirectUri) +
      '&state=' +
      encodeURIComponent(stateStr) +
      '&scope=' +
      scopes

    // Se a requisição pedir JSON (ex: chamada via SDK/API)
    const acceptHeader = e.request.header.get('Accept') || ''
    const wantsJson =
      acceptHeader.indexOf('application/json') !== -1 ||
      e.request.url.query().get('format') === 'json'

    if (wantsJson) {
      return e.json(200, {
        success: true,
        auth_url: authUrl,
        state: stateStr,
      })
    }

    // Redirecionamento padrão do navegador para o Bling
    return e.redirect(302, authUrl)
  },
  $apis.requireAuth(),
)

// ============================================================================
// 2. CALLBACK OAUTH: GET /backend/v1/bling/callback
// ============================================================================
routerAdd('GET', '/backend/v1/bling/callback', (e) => {
  const query = e.request.url.query()
  const code = query.get('code') || ''
  const state = query.get('state') || ''
  const errorParam = query.get('error') || ''
  const errorDesc = query.get('error_description') || ''

  // Função auxiliar de renderização HTML de feedback amigável
  function renderHtml(sucesso, titulo, mensagem, detalhes) {
    const corTema = sucesso ? '#16A34A' : '#DC2626'
    const bgBadge = sucesso ? '#DCFCE7' : '#FEE2E2'
    const iconSvg = sucesso
      ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
      : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'

    const html =
      '<!DOCTYPE html>' +
      '<html lang="pt-BR">' +
      '<head>' +
      '<meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<title>' +
      titulo +
      ' - CRM Colesel 45</title>' +
      '<style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#F8FAFC;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box;color:#0F172A;}' +
      '.card{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;max-width:480px;width:100%;padding:32px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);text-align:center;}' +
      '.icon-wrap{width:72px;height:72px;border-radius:50%;background:' +
      bgBadge +
      ';display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;}' +
      'h1{font-size:20px;font-weight:700;margin:0 0 12px 0;color:#0F172A;}' +
      'p.msg{font-size:14px;line-height:1.6;color:#334155;margin:0 0 20px 0;}' +
      'p.sub{font-size:12px;color:#64748B;line-height:1.5;margin:0 0 24px 0;}' +
      '.btn{display:inline-block;background:#0F172A;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:13px;padding:10px 24px;border-radius:8px;transition:opacity 0.2s;cursor:pointer;border:none;}' +
      '.btn:hover{opacity:0.9;}' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div class="card">' +
      '<div class="icon-wrap">' +
      iconSvg +
      '</div>' +
      '<h1>' +
      titulo +
      '</h1>' +
      '<p class="msg">' +
      mensagem +
      '</p>' +
      (detalhes ? '<p class="sub">' + detalhes + '</p>' : '') +
      '<button class="btn" onclick="window.close();">Fechar Janela</button>' +
      '</div>' +
      '</body>' +
      '</html>'

    return e.html(sucesso ? 200 : 400, html)
  }

  // 1. Checagem de erro vindo diretamente do provedor Bling
  if (errorParam) {
    return renderHtml(
      false,
      'Autorização Cancelada',
      'O Bling retornou uma recusa de autorização ou erro no login.',
      errorDesc || 'Parâmetro: ' + errorParam,
    )
  }

  // 2. Validação obrigatória de code e state
  if (!code || !state) {
    return renderHtml(
      false,
      'Parâmetros Inválidos',
      'A resposta do Bling não continha os parâmetros de validação esperados (code ou state ausentes).',
      null,
    )
  }

  // 3. Localizar e validar state no banco (uso único, não expirado)
  let stateRecord = null
  try {
    const states = $app.findRecordsByFilter(
      'bling_oauth_states',
      'state = {:state}',
      '-created',
      1,
      0,
      { state: state },
    )
    if (states && states.length > 0) {
      stateRecord = states[0]
    }
  } catch (errState) {
    return renderHtml(
      false,
      'Erro de Validação',
      'Falha técnica ao verificar a autenticidade do pedido de conexão.',
      null,
    )
  }

  if (!stateRecord) {
    return renderHtml(
      false,
      'Conexão Rejeitada (CSRF)',
      'O identificador de estado (state) é desconhecido ou já foi utilizado. Por segurança, inicie uma nova tentativa pelo CRM.',
      null,
    )
  }

  // Verificar se já foi utilizado
  const usedAt = stateRecord.getString('used_at')
  if (usedAt) {
    return renderHtml(
      false,
      'Tentativa Repetida',
      'Este link de autorização já foi processado anteriormente. Solicite uma nova conexão pelo CRM.',
      null,
    )
  }

  // Verificar expiração (10 min)
  const expiresAtStr = stateRecord.getString('expires_at')
  if (expiresAtStr) {
    const expiresAt = new Date(expiresAtStr)
    if (Date.now() > expiresAt.getTime()) {
      try {
        $app.delete(stateRecord)
      } catch (_) {}
      return renderHtml(
        false,
        'Autorização Expirada',
        'O tempo limite para concluir a autorização no Bling expirou (máximo 10 minutos). Inicie o processo novamente.',
        null,
      )
    }
  }

  // INVALIDAÇÃO IMEDIATA DO STATE (uso único estrito anti-replay)
  const userIdAssociado = stateRecord.getString('user_id')
  try {
    stateRecord.set('used_at', new Date().toISOString())
    $app.save(stateRecord)
    // Deleta o registro para evitar acúmulo no banco
    $app.delete(stateRecord)
  } catch (delErr) {
    // Prossegue se der falha no delete, pois used_at já foi marcado
  }

  // 4. Obter credenciais do Bling para a troca de code
  let clientId = ''
  let clientSecret = ''
  let redirectUri = ''
  try {
    clientId = $os.getenv('BLING_CLIENT_ID') || $secrets.get('BLING_CLIENT_ID') || ''
    clientSecret = $os.getenv('BLING_CLIENT_SECRET') || $secrets.get('BLING_CLIENT_SECRET') || ''
    redirectUri = $os.getenv('BLING_REDIRECT_URI') || $secrets.get('BLING_REDIRECT_URI') || ''
  } catch (_) {}

  if (!redirectUri) {
    let siteUrl = ''
    try {
      siteUrl = $os.getenv('SITE_URL') || $os.getenv('PB_INSTANCE_URL') || ''
    } catch (_) {}
    if (siteUrl) {
      if (siteUrl.endsWith('/')) siteUrl = siteUrl.slice(0, -1)
      redirectUri = siteUrl + '/backend/v1/bling/callback'
    }
  }

  if (!clientId || !clientSecret) {
    return renderHtml(
      false,
      'Servidor Não Configurado',
      'Os segredos BLING_CLIENT_ID e BLING_CLIENT_SECRET não estão configurados no servidor.',
      null,
    )
  }

  // 5. TROCA DO CODE POR TOKEN (RFC 6749)
  // Requisito técnico do Bling v3:
  // Authorization: Basic base64(client_id:client_secret)
  // Header: enable-jwt: 1
  // Content-Type: application/x-www-form-urlencoded
  // Endpoint: https://www.bling.com.br/Api/v3/oauth/token
  // EXCEÇÃO TÉCNICA AUTORIZADA: Este POST é exclusivamente a troca de credencial do protocolo OAuth.
  const basicAuth = $security.hs256
    ? // No PocketBase JSVM, encode base64 padrão:
      // Se não houver btoa nativo, usar string formatada
      (function () {
        // Codificação Base64 manual robusta para ambiente JSVM
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        const str = clientId + ':' + clientSecret
        let output = ''
        for (
          let block = 0, charCode, idx = 0, map = chars;
          str.charAt(idx | 0) || ((map = '='), idx % 1);
          output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))
        ) {
          charCode = str.charCodeAt((idx += 3 / 4))
          if (charCode > 0xff) {
            throw new Error('Caractere inválido para base64')
          }
          block = (block << 8) | charCode
        }
        return output
      })()
    : ''

  const formBody =
    'grant_type=authorization_code&code=' +
    encodeURIComponent(code) +
    '&redirect_uri=' +
    encodeURIComponent(redirectUri)

  let tokenRes = null
  try {
    tokenRes = $http.send({
      url: 'https://www.bling.com.br/Api/v3/oauth/token',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + basicAuth,
        'enable-jwt': '1',
      },
      body: formBody,
      timeout: 20,
    })
  } catch (httpErr) {
    return renderHtml(
      false,
      'Falha na Comunicação',
      'Não foi possível contatar o servidor de autenticação do Bling.',
      String(httpErr.message || httpErr),
    )
  }

  if (!tokenRes || tokenRes.statusCode !== 200) {
    const statusErro = tokenRes ? tokenRes.statusCode : 'sem resposta'
    const detalheJson = tokenRes && tokenRes.json ? JSON.stringify(tokenRes.json) : ''
    return renderHtml(
      false,
      'Erro ao Obter Acesso',
      'O Bling rejeitou a troca de código por token (HTTP ' + statusErro + ').',
      detalheJson ? 'Resposta: ' + detalheJson : null,
    )
  }

  const tokenData = tokenRes.json || {}
  const accessToken = tokenData.access_token || ''
  const refreshToken = tokenData.refresh_token || ''
  const tokenType = tokenData.token_type || 'Bearer'
  const expiresIn = Number(tokenData.expires_in) || 21600 // Bling normalmente emite 21600s (6h)

  if (!accessToken || !refreshToken) {
    return renderHtml(
      false,
      'Token Inválido',
      'A resposta do Bling não continha access_token ou refresh_token válidos.',
      null,
    )
  }

  // 6. Armazenar tokens exclusivamente no backend na coleção bling_connections
  const agora = Date.now()
  const expiraEm = new Date(agora + expiresIn * 1000)

  try {
    const connCol = $app.findCollectionByNameOrId('bling_connections')
    // Buscar conexão existente para atualizar ou criar nova
    const conexoes = $app.findRecordsByFilter('bling_connections', '', '-created', 1, 0)
    let connRecord = null

    if (conexoes && conexoes.length > 0) {
      connRecord = conexoes[0]
    } else {
      connRecord = new Record(connCol)
    }

    if (userIdAssociado) {
      connRecord.set('user_id', userIdAssociado)
    }
    connRecord.set('access_token', accessToken)
    connRecord.set('refresh_token', refreshToken)
    connRecord.set('token_type', tokenType)
    connRecord.set('expires_at', expiraEm.toISOString())
    connRecord.set('last_refresh_at', new Date(agora).toISOString())
    connRecord.set('status', 'conectado')
    connRecord.set('ultimo_erro', '')
    $app.save(connRecord)
  } catch (saveConnErr) {
    return renderHtml(
      false,
      'Erro ao Persistir Conexão',
      'Não foi possível registrar a autorização no cofre seguro do CRM.',
      String(saveConnErr.message || saveConnErr),
    )
  }

  // Texto prescrito exatamente pelo usuário no requisito 8:
  // "Conexão com o Bling realizada com sucesso. Você pode fechar esta janela e retornar ao CRM."
  return renderHtml(
    true,
    'Conexão Estabelecida',
    'Conexão com o Bling realizada com sucesso. Você pode fechar esta janela e retornar ao CRM.',
    'Tokens protegidos com segurança no servidor do CRM.',
  )
})

// ============================================================================
// 3. CONSULTA DE STATUS SEGURO: GET /backend/v1/bling/status
// ============================================================================
routerAdd(
  'GET',
  '/backend/v1/bling/status',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro' && perfil !== 'coordenador_vendas') {
      return e.json(403, {
        message: 'Apenas administradores podem consultar o status da integração Bling.',
      })
    }

    // Função auxiliar interna para resolução da redirect_uri (mesma regra do /connect)
    function resolverRedirectUri() {
      let uri = ''
      try {
        uri = $os.getenv('BLING_REDIRECT_URI') || $secrets.get('BLING_REDIRECT_URI') || ''
      } catch (_) {}
      if (uri) {
        return { uri: uri, origem: 'secret' }
      }

      let siteUrl = ''
      try {
        siteUrl = $os.getenv('SITE_URL') || $os.getenv('PB_INSTANCE_URL') || ''
      } catch (_) {}
      if (siteUrl) {
        if (siteUrl.endsWith('/')) siteUrl = siteUrl.slice(0, -1)
        return { uri: siteUrl + '/backend/v1/bling/callback', origem: 'fallback_site_url' }
      }

      return { uri: '', origem: 'nao_configurada' }
    }

    const resRedirect = resolverRedirectUri()

    // Checar presença dos segredos essenciais no ambiente
    let hasSecrets = false
    try {
      const cId = $os.getenv('BLING_CLIENT_ID') || $secrets.get('BLING_CLIENT_ID') || ''
      const cSec = $os.getenv('BLING_CLIENT_SECRET') || $secrets.get('BLING_CLIENT_SECRET') || ''
      hasSecrets = Boolean(cId && cSec)
    } catch (_) {}

    // Buscar conexão ativa no banco
    let connRecord = null
    try {
      const records = $app.findRecordsByFilter('bling_connections', '', '-created', 1, 0)
      if (records && records.length > 0) {
        connRecord = records[0]
      }
    } catch (_) {}

    if (!connRecord) {
      return e.json(200, {
        conectado: false,
        status: 'desconectado',
        configurado_no_servidor: hasSecrets,
        tipo_autenticacao: 'oauth_v3',
        redirect_uri_efetiva: resRedirect.uri,
        redirect_uri_origem: resRedirect.origem,
        expires_at: null,
        ultima_renovacao: null,
        ultimo_erro: null,
      })
    }

    const statusConn = connRecord.getString('status') || 'desconectado'
    const expiresAtStr = connRecord.getString('expires_at') || null
    const lastRefreshStr = connRecord.getString('last_refresh_at') || null
    const ultimoErro = connRecord.getString('ultimo_erro') || null

    // NUNCA retornar tokens na resposta
    return e.json(200, {
      conectado: statusConn === 'conectado',
      status: statusConn,
      configurado_no_servidor: hasSecrets,
      tipo_autenticacao: 'oauth_v3',
      redirect_uri_efetiva: resRedirect.uri,
      redirect_uri_origem: resRedirect.origem,
      expires_at: expiresAtStr,
      ultima_renovacao: lastRefreshStr,
      ultimo_erro: ultimoErro,
    })
  },
  $apis.requireAuth(),
)

// ============================================================================
// 4. DESCONECTAR BLING: POST /backend/v1/bling/disconnect
// ============================================================================
routerAdd(
  'POST',
  '/backend/v1/bling/disconnect',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas administradores (CEO / Financeiro) podem desconectar a integração.',
      })
    }

    try {
      const records = $app.findRecordsByFilter('bling_connections', '', '-created', 10, 0)
      for (let i = 0; i < records.length; i++) {
        records[i].set('status', 'desconectado')
        records[i].set('access_token', '')
        records[i].set('refresh_token', '')
        records[i].set('ultimo_erro', 'Desconectado manualmente pelo usuário')
        $app.save(records[i])
      }
    } catch (errDisc) {
      return e.json(500, {
        success: false,
        message: 'Falha ao desconectar: ' + String(errDisc.message || errDisc),
      })
    }

    return e.json(200, {
      success: true,
      conectado: false,
      message: 'Integração Bling desconectada com sucesso.',
    })
  },
  $apis.requireAuth(),
)

// ============================================================================
// 5. HELPER LEGADO: POST /backend/v1/bling/importar (READ-ONLY)
// ============================================================================
routerAdd(
  'POST',
  '/backend/v1/bling/importar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas administradores (CEO / Financeiro) podem executar a importação do Bling.',
      })
    }

    // Função interna de codificação Base64
    function encodeBase64(str) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let output = ''
      for (
        let block = 0, charCode, idx = 0, map = chars;
        str.charAt(idx | 0) || ((map = '='), idx % 1);
        output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))
      ) {
        charCode = str.charCodeAt((idx += 3 / 4))
        if (charCode > 0xff) throw new Error('Caractere inválido para base64')
        block = (block << 8) | charCode
      }
      return output
    }

    // Função inline getValidBlingAccessToken() com refresh automático
    function obterTokenAcesso() {
      // 1. Prioridade: Conexão OAuth v3 ativa
      try {
        const conns = $app.findRecordsByFilter('bling_connections', '', '-created', 1, 0)
        if (conns && conns.length > 0) {
          const conn = conns[0]
          const status = conn.getString('status')
          const accessToken = conn.getString('access_token')
          const refreshToken = conn.getString('refresh_token')
          const expiresAtStr = conn.getString('expires_at')

          if (status === 'conectado' && accessToken) {
            // Verificar expiração com margem de segurança de 5 minutos
            const expiraEm = expiresAtStr ? new Date(expiresAtStr).getTime() : 0
            const agora = Date.now()
            const margem = 5 * 60 * 1000

            if (expiraEm > agora + margem) {
              return { token: accessToken, conn: conn }
            }

            // Expirado ou próximo de expirar: tentar renovar via refresh_token
            if (refreshToken) {
              let cId = ''
              let cSec = ''
              try {
                cId = $os.getenv('BLING_CLIENT_ID') || $secrets.get('BLING_CLIENT_ID') || ''
                cSec =
                  $os.getenv('BLING_CLIENT_SECRET') || $secrets.get('BLING_CLIENT_SECRET') || ''
              } catch (_) {}

              if (cId && cSec) {
                const b64 = encodeBase64(cId + ':' + cSec)
                const refreshBody =
                  'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)

                const refreshRes = $http.send({
                  url: 'https://www.bling.com.br/Api/v3/oauth/token',
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: 'Basic ' + b64,
                    'enable-jwt': '1',
                  },
                  body: refreshBody,
                  timeout: 15,
                })

                if (refreshRes && refreshRes.statusCode === 200) {
                  const rData = refreshRes.json || {}
                  const novoAccess = rData.access_token || ''
                  const novoRefresh = rData.refresh_token || refreshToken
                  const novoExpiresIn = Number(rData.expires_in) || 21600
                  const novoExpiresAt = new Date(Date.now() + novoExpiresIn * 1000)

                  if (novoAccess) {
                    conn.set('access_token', novoAccess)
                    conn.set('refresh_token', novoRefresh)
                    conn.set('expires_at', novoExpiresAt.toISOString())
                    conn.set('last_refresh_at', new Date().toISOString())
                    conn.set('status', 'conectado')
                    conn.set('ultimo_erro', '')
                    $app.save(conn)
                    return { token: novoAccess, conn: conn }
                  }
                }
              }
            }
          }
        }
      } catch (_) {}

      return { token: '', conn: null }
    }

    const tokenObj = obterTokenAcesso()
    const blingToken = tokenObj.token

    if (!blingToken) {
      return e.json(400, {
        success: false,
        message: 'Conecte o CRM ao Bling via OAuth em /bling antes de importar dados.',
      })
    }

    const body = e.requestInfo().body || {}
    const tipo = body.tipo || 'contatos'
    const pagina = Number(body.pagina) || 1
    const limite = Number(body.limite) || 50

    let endpointBling = ''
    if (tipo === 'pedidos') {
      endpointBling =
        'https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=' + pagina + '&limite=' + limite
    } else {
      endpointBling =
        'https://api.bling.com.br/Api/v3/contatos?pagina=' + pagina + '&limite=' + limite
    }

    try {
      const res = $http.send({
        url: endpointBling,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + blingToken,
        },
        timeout: 15,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return e.json(200, {
          success: true,
          tipo: tipo,
          pagina: pagina,
          data: res.json ? res.json.data || res.json : [],
          mensagem: 'Dados obtidos com sucesso do Bling ERP.',
        })
      }

      return e.json(res.statusCode || 502, {
        success: false,
        message: 'A API do Bling retornou status ' + res.statusCode + '.',
        detalhes: res.json
          ? res.json.error || res.json.mensagem || 'Falha na resposta do Bling'
          : 'Erro de comunicação',
      })
    } catch (httpErr) {
      return e.json(502, {
        success: false,
        message: 'Falha ao conectar com o servidor do Bling ERP.',
      })
    }
  },
  $apis.requireAuth(),
)

// ============================================================================
// 6. MOTOR DE SINCRONIZAÇÃO COMPLETA: POST /backend/v1/bling/sincronizar
// ============================================================================
routerAdd(
  'POST',
  '/backend/v1/bling/sincronizar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message:
          'Apenas administradores (CEO / Financeiro) podem executar a sincronização do Bling.',
      })
    }

    const iniciadoEm = new Date()
    const t0 = Date.now()

    // Função interna de codificação Base64
    function encodeBase64(str) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let output = ''
      for (
        let block = 0, charCode, idx = 0, map = chars;
        str.charAt(idx | 0) || ((map = '='), idx % 1);
        output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))
      ) {
        charCode = str.charCodeAt((idx += 3 / 4))
        if (charCode > 0xff) throw new Error('Caractere inválido para base64')
        block = (block << 8) | charCode
      }
      return output
    }

    // Função inline para renovação de token OAuth
    function executarRefreshOAuth(conn) {
      try {
        const refreshToken = conn.getString('refresh_token')
        if (!refreshToken) return null

        let cId = ''
        let cSec = ''
        try {
          cId = $os.getenv('BLING_CLIENT_ID') || $secrets.get('BLING_CLIENT_ID') || ''
          cSec = $os.getenv('BLING_CLIENT_SECRET') || $secrets.get('BLING_CLIENT_SECRET') || ''
        } catch (_) {}

        if (!cId || !cSec) return null

        const b64 = encodeBase64(cId + ':' + cSec)
        const refreshBody =
          'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)

        const refreshRes = $http.send({
          url: 'https://www.bling.com.br/Api/v3/oauth/token',
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + b64,
            'enable-jwt': '1',
          },
          body: refreshBody,
          timeout: 15,
        })

        if (refreshRes && refreshRes.statusCode === 200) {
          const rData = refreshRes.json || {}
          const novoAccess = rData.access_token || ''
          const novoRefresh = rData.refresh_token || refreshToken
          const novoExpiresIn = Number(rData.expires_in) || 21600
          const novoExpiresAt = new Date(Date.now() + novoExpiresIn * 1000)

          if (novoAccess) {
            conn.set('access_token', novoAccess)
            conn.set('refresh_token', novoRefresh)
            conn.set('expires_at', novoExpiresAt.toISOString())
            conn.set('last_refresh_at', new Date().toISOString())
            conn.set('status', 'conectado')
            conn.set('ultimo_erro', '')
            $app.save(conn)
            return novoAccess
          }
        } else {
          const errDet = refreshRes && refreshRes.json ? JSON.stringify(refreshRes.json) : ''
          conn.set('status', 'erro_renovacao')
          conn.set('ultimo_erro', 'Falha no refresh automático: ' + errDet)
          $app.save(conn)
        }
      } catch (errRef) {
        try {
          conn.set('status', 'erro_renovacao')
          conn.set('ultimo_erro', 'Exceção no refresh: ' + String(errRef.message || errRef))
          $app.save(conn)
        } catch (_) {}
      }
      return null
    }

    // Função centralizada getValidBlingAccessToken()
    // 1) busca conexão ativa;
    // 2) verifica expires_at;
    // 3) se válido -> retorna token;
    // 4) se expirado/próximo -> renova via refresh_token;
    // 5/6/7) atualiza tokens e timestamps
    function getValidBlingAccessToken() {
      try {
        const conns = $app.findRecordsByFilter('bling_connections', '', '-created', 1, 0)
        if (conns && conns.length > 0) {
          const conn = conns[0]
          const status = conn.getString('status')
          const accessToken = conn.getString('access_token')
          const expiresAtStr = conn.getString('expires_at')

          if (status === 'conectado' && accessToken) {
            const expiraEm = expiresAtStr ? new Date(expiresAtStr).getTime() : 0
            const agora = Date.now()
            const margem = 5 * 60 * 1000 // 5 minutos de margem de segurança

            if (expiraEm > agora + margem) {
              return { token: accessToken, conn: conn, renovado: false }
            }

            // Expirado ou próximo: executar refresh
            const tokenRenovado = executarRefreshOAuth(conn)
            if (tokenRenovado) {
              return { token: tokenRenovado, conn: conn, renovado: true }
            }
          }
        }
      } catch (_) {}

      return { token: '', conn: null, renovado: false }
    }

    const tokenInfo = getValidBlingAccessToken()
    let currentAccessToken = tokenInfo.token
    const connectionRecord = tokenInfo.conn

    if (!currentAccessToken) {
      return e.json(400, {
        success: false,
        message: 'Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar.',
      })
    }

    // Criar registro de log com status 'processando'
    let logRecord = null
    try {
      const syncLogCol = $app.findCollectionByNameOrId('bling_sync_logs')
      logRecord = new Record(syncLogCol)
      logRecord.set('iniciado_em', iniciadoEm.toISOString())
      logRecord.set('usuario', authRecord.id)
      logRecord.set('status', 'processando')
      logRecord.set('clientes_lidos', 0)
      logRecord.set('clientes_criados', 0)
      logRecord.set('clientes_atualizados', 0)
      logRecord.set('clientes_ignorados', 0)
      logRecord.set('pedidos_lidos', 0)
      logRecord.set('erros', [])
      logRecord.set('mensagem_resumo', 'Sincronização iniciada via OAuth seguro...')
      $app.save(logRecord)
    } catch (_) {}

    // Funções auxiliares inline para tratamento dos dados
    function normalizarDoc(doc) {
      if (!doc) return ''
      return String(doc).replace(/[^\w]/g, '').trim().toLowerCase()
    }

    function normalizarEm(em) {
      if (!em) return ''
      return String(em).trim().toLowerCase()
    }

    function isConsumidorFinalNome(nome) {
      if (!nome) return false
      const n = String(nome).trim().toLowerCase()
      return n === 'consumidor final' || n === 'consumidor final.'
    }

    function mapearVendedor(vendedorBling) {
      if (!vendedorBling) return 'Renan'
      const v = String(vendedorBling)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()

      if (v === 'ALICE PAITRA COLESEL' || v === 'ALICE' || v.indexOf('ALICE PAITRA') === 0) {
        return 'Alice'
      }
      if (v === 'RENAN SOUZA' || v === 'RENAN') {
        return 'Renan'
      }
      if (
        v === 'KAROLINE' ||
        v === 'VENDAS 1' ||
        v === 'MARIA CAROLINE SANTOS' ||
        v === 'CONSUMIDOR FINAL' ||
        v === 'CONSUMIDOR FINAL.' ||
        v.indexOf('KAROLINE ') === 0 ||
        v.indexOf('MARIA CAROLINE') === 0
      ) {
        return 'Karoline (Vendas 1)'
      }
      if (v === 'VENDAS 2') {
        return 'Vendas 2'
      }
      return 'Renan'
    }

    // Resolução de vendedor CRM para usuário real da coleção usuarios
    const mapVendedorParaUsuarioId = {}
    try {
      const usuariosCadastrados = $app.findRecordsByFilter(
        'usuarios',
        'ativo = true',
        'nome',
        50,
        0,
      )
      for (let u = 0; u < usuariosCadastrados.length; u++) {
        const uRec = usuariosCadastrados[u]
        const uId = uRec.id
        const uPerfil = uRec.getString('perfil')
        const uNome = uRec.getString('nome') || ''
        const uEmail = uRec.getString('email') || ''

        if (uNome.indexOf('Alice') !== -1 || uEmail.indexOf('alice') !== -1) {
          mapVendedorParaUsuarioId['Alice'] = uId
        } else if (uNome.indexOf('Renan') !== -1 || uEmail.indexOf('renan') !== -1) {
          mapVendedorParaUsuarioId['Renan'] = uId
        } else if (
          uPerfil === 'vendedor_1' ||
          uNome.indexOf('Vendas 1') !== -1 ||
          uNome.indexOf('Karoline') !== -1
        ) {
          mapVendedorParaUsuarioId['Karoline (Vendas 1)'] = uId
        } else if (uPerfil === 'vendedor_2' || uNome.indexOf('Vendas 2') !== -1) {
          mapVendedorParaUsuarioId['Vendas 2'] = uId
        }
      }
    } catch (_) {}

    function resolverUsuarioIdPorVendedorCrm(vendedorCrm) {
      if (mapVendedorParaUsuarioId[vendedorCrm]) {
        return mapVendedorParaUsuarioId[vendedorCrm]
      }
      if (mapVendedorParaUsuarioId['Renan']) {
        return mapVendedorParaUsuarioId['Renan']
      }
      return authRecord.id
    }

    // Chamador HTTP GET com retry robusto (429/5xx), backoff exponencial e retry único pós-401 via refresh
    let refreshExecutadoPor401 = false
    function getBlingGet(url, maxTentativas) {
      let tentativas = 0
      const limite = maxTentativas || 3
      let ultimoResultado = null
      let ultimoErro = null

      while (tentativas < limite) {
        tentativas++
        try {
          const res = $http.send({
            url: url,
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer ' + currentAccessToken,
            },
            timeout: 20,
          })
          ultimoResultado = res

          // Se 401: tentar refresh UMA única vez e repetir UMA única vez
          if (res.statusCode === 401 && !refreshExecutadoPor401 && connectionRecord) {
            refreshExecutadoPor401 = true
            const novoToken = executarRefreshOAuth(connectionRecord)
            if (novoToken) {
              currentAccessToken = novoToken
              // Repetir a requisição imediatamente com o novo token
              const retryRes = $http.send({
                url: url,
                method: 'GET',
                headers: {
                  Accept: 'application/json',
                  Authorization: 'Bearer ' + currentAccessToken,
                },
                timeout: 20,
              })
              ultimoResultado = retryRes
              return retryRes
            }
          }

          // 429 Too Many Requests -> retry com backoff (espera computacional para goja JSVM)
          if (res.statusCode === 429 && tentativas < limite) {
            const esperaMs = 300 * tentativas
            const tFim = Date.now() + esperaMs
            while (Date.now() < tFim) {
              /* backoff ativo seguro para JSVM */
            }
            continue
          }

          // 5xx Server Error do Bling -> retry com backoff
          if (res.statusCode >= 500 && tentativas < limite) {
            const esperaMs = 250 * tentativas
            const tFim = Date.now() + esperaMs
            while (Date.now() < tFim) {
              /* backoff ativo seguro para JSVM */
            }
            continue
          }

          return res
        } catch (httpErr) {
          ultimoErro = httpErr
          if (tentativas < limite) {
            const esperaMs = 200 * tentativas
            const tFim = Date.now() + esperaMs
            while (Date.now() < tFim) {
              /* backoff ativo seguro para JSVM */
            }
            continue
          }
        }
      }

      if (ultimoResultado) {
        return ultimoResultado
      }
      throw new Error(
        'Falha definitiva de rede após ' +
          limite +
          ' tentativas: ' +
          String((ultimoErro && ultimoErro.message) || ultimoErro || 'Erro desconhecido'),
      )
    }

    const errosGerais = []
    const errosPedidos = []
    let totalClientesLidos = 0
    let totalClientesCriados = 0
    let totalClientesAtualizados = 0
    let totalClientesIgnorados = 0

    let totalPedidosLidos = 0
    let totalPedidosPersistidos = 0
    let totalPedidosAtualizados = 0
    let totalPedidosDuplicados = 0
    let totalPedidosSemCliente = 0
    let paginasPedidosLidas = 0

    let clientesComComprasAtualizadas = 0

    try {
      // 2. Carregar todos os clientes atuais do CRM para mapeamento em memória
      const clientesExistentes = $app.findRecordsByFilter('clientes', '', '-created', 5000, 0)
      const mapPorBlingId = {}
      const mapPorDoc = {}
      const mapPorEmail = {}
      const mapPorNomeEmpresa = {}
      let recConsumidorFinal = null

      for (let i = 0; i < clientesExistentes.length; i++) {
        const c = clientesExistentes[i]
        const bId = c.getString('bling_id')
        if (bId) mapPorBlingId[bId] = c

        const doc = normalizarDoc(c.getString('cnpj_cpf'))
        if (doc) mapPorDoc[doc] = c

        const em = normalizarEm(c.getString('email'))
        if (em) mapPorEmail[em] = c

        const nomeEmp = c.getString('nome_empresa')
        if (nomeEmp) {
          mapPorNomeEmpresa[nomeEmp.trim().toLowerCase()] = c
        }
        if (isConsumidorFinalNome(nomeEmp)) {
          recConsumidorFinal = c
        }
      }

      // ==============================================================
      // 3. BUSCA DE CONTATOS DO BLING COM PAGINAÇÃO COMPLETA
      // ==============================================================
      let paginaContatos = 1
      const limiteContatos = 100
      let temMaisContatos = true
      const maxPaginasContatos = 200

      while (temMaisContatos && paginaContatos <= maxPaginasContatos) {
        const urlContatos =
          'https://api.bling.com.br/Api/v3/contatos?pagina=' +
          paginaContatos +
          '&limite=' +
          limiteContatos

        let resContatos = null
        try {
          resContatos = getBlingGet(urlContatos, 3)
        } catch (errReq) {
          errosGerais.push(
            'Erro de rede na página ' +
              paginaContatos +
              ' de contatos: ' +
              String(errReq.message || errReq),
          )
          break
        }

        if (resContatos.statusCode === 401 || resContatos.statusCode === 403) {
          throw new Error(
            'Token do Bling não autorizado ou expirado (status ' + resContatos.statusCode + ').',
          )
        }

        if (resContatos.statusCode !== 200) {
          errosGerais.push(
            'Bling retornou HTTP ' +
              resContatos.statusCode +
              ' ao buscar contatos na página ' +
              paginaContatos,
          )
          break
        }

        const dataJson = resContatos.json || {}
        const listaContatos = dataJson.data || []

        if (!listaContatos || listaContatos.length === 0) {
          temMaisContatos = false
          break
        }

        totalClientesLidos += listaContatos.length

        // Processar cada contato da página
        for (let idx = 0; idx < listaContatos.length; idx++) {
          const item = listaContatos[idx]
          const blingId = item.id ? String(item.id) : ''
          const nomeContatoBling = (item.nome || '').trim()
          const razaoSocialBling = (item.fantasia || item.nome || '').trim()
          const docBling = (item.numeroDocumento || '').trim()
          const docBlingLimpo = normalizarDoc(docBling)
          const emailBling = (item.email || '').trim()
          const emailBlingLimpo = normalizarEm(emailBling)
          const telBling = (item.telefone || item.celular || '').trim()

          let cidadeBling = ''
          let ufBling = ''
          if (item.endereco && item.endereco.geral) {
            cidadeBling = (item.endereco.geral.municipio || '').trim()
            ufBling = (item.endereco.geral.uf || '').trim()
          }

          let vendedorBlingNome = ''
          if (item.vendedor && item.vendedor.nome) {
            vendedorBlingNome = item.vendedor.nome
          }

          const vendedorCrm = mapearVendedor(vendedorBlingNome)
          const isConsumidor =
            isConsumidorFinalNome(razaoSocialBling) || isConsumidorFinalNome(nomeContatoBling)

          let clienteExistente = null
          if (isConsumidor && recConsumidorFinal) {
            clienteExistente = recConsumidorFinal
          } else {
            if (blingId && mapPorBlingId[blingId]) {
              clienteExistente = mapPorBlingId[blingId]
            } else if (docBlingLimpo && mapPorDoc[docBlingLimpo]) {
              clienteExistente = mapPorDoc[docBlingLimpo]
            } else if (emailBlingLimpo && mapPorEmail[emailBlingLimpo]) {
              clienteExistente = mapPorEmail[emailBlingLimpo]
            }
          }

          const clientesCol = $app.findCollectionByNameOrId('clientes')

          if (clienteExistente) {
            let alterou = false

            if (blingId && clienteExistente.getString('bling_id') !== blingId) {
              clienteExistente.set('bling_id', blingId)
              alterou = true
            }

            if (docBling && !clienteExistente.getString('cnpj_cpf')) {
              clienteExistente.set('cnpj_cpf', docBling)
              alterou = true
            }

            if (emailBling && !clienteExistente.getString('email')) {
              clienteExistente.set('email', emailBling)
              alterou = true
            }

            if (telBling && !clienteExistente.getString('telefone')) {
              clienteExistente.set('telefone', telBling)
              alterou = true
            }

            if (cidadeBling && !clienteExistente.getString('cidade')) {
              clienteExistente.set('cidade', cidadeBling)
              alterou = true
            }

            if (ufBling && !clienteExistente.getString('estado')) {
              clienteExistente.set('estado', ufBling.substring(0, 2).toUpperCase())
              alterou = true
            }

            if (isConsumidor) {
              if (clienteExistente.getString('vendedor') !== 'Karoline (Vendas 1)') {
                clienteExistente.set('vendedor', 'Karoline (Vendas 1)')
                alterou = true
              }
            } else if (vendedorBlingNome) {
              clienteExistente.set('vendedor', vendedorCrm)
              alterou = true
            }

            if (alterou) {
              try {
                $app.save(clienteExistente)
                totalClientesAtualizados++
              } catch (errUpd) {
                errosGerais.push(
                  'Erro ao atualizar cliente ' +
                    clienteExistente.id +
                    ': ' +
                    String(errUpd.message || errUpd),
                )
              }
            } else {
              totalClientesIgnorados++
            }

            if (blingId) mapPorBlingId[blingId] = clienteExistente
            if (docBlingLimpo) mapPorDoc[docBlingLimpo] = clienteExistente
            if (emailBlingLimpo) mapPorEmail[emailBlingLimpo] = clienteExistente
            if (isConsumidor) recConsumidorFinal = clienteExistente
          } else {
            const novoCliente = new Record(clientesCol)
            const nomeEmpresaFinal =
              razaoSocialBling ||
              nomeContatoBling ||
              (isConsumidor ? 'Consumidor Final' : 'Cliente Sem Nome')

            novoCliente.set('nome_empresa', nomeEmpresaFinal)
            novoCliente.set('nome_contato', nomeContatoBling || nomeEmpresaFinal)
            if (blingId) novoCliente.set('bling_id', blingId)
            if (docBling) novoCliente.set('cnpj_cpf', docBling)
            if (emailBling) novoCliente.set('email', emailBling)
            if (telBling) novoCliente.set('telefone', telBling)
            if (cidadeBling) novoCliente.set('cidade', cidadeBling)
            if (ufBling) novoCliente.set('estado', ufBling.substring(0, 2).toUpperCase())

            const vendFinal = isConsumidor ? 'Karoline (Vendas 1)' : vendedorCrm
            novoCliente.set('vendedor', vendFinal)
            novoCliente.set('status_cliente', 'para_reativacao')
            novoCliente.set('tipo_contato', 'cliente')
            novoCliente.set('valor_total_vendas', 0)
            novoCliente.set('valor_total_compras', 0)
            novoCliente.set('responsavel_id', authRecord.id)

            try {
              $app.save(novoCliente)
              totalClientesCriados++

              if (blingId) mapPorBlingId[blingId] = novoCliente
              if (docBlingLimpo) mapPorDoc[docBlingLimpo] = novoCliente
              if (emailBlingLimpo) mapPorEmail[emailBlingLimpo] = novoCliente
              if (isConsumidor) recConsumidorFinal = novoCliente
            } catch (errIns) {
              errosGerais.push(
                'Erro ao inserir cliente "' +
                  nomeEmpresaFinal +
                  '": ' +
                  String(errIns.message || errIns),
              )
            }
          }
        }

        if (listaContatos.length < limiteContatos) {
          temMaisContatos = false
        } else {
          paginaContatos++
        }
      }

      // ==============================================================
      // 4. BUSCA DE PEDIDOS DE VENDA DO BLING COM PAGINAÇÃO COMPLETA E PERSISTÊNCIA EM bling_pedidos
      // ==============================================================
      const dadosVendasPorCliente = {}

      // Mapeamento em memória dos pedidos já existentes em bling_pedidos (para idempotência)
      const mapBlingPedidosExistentes = {}
      try {
        const pedidosLocais = $app.findRecordsByFilter('bling_pedidos', '', '-created', 10000, 0)
        for (let pl = 0; pl < pedidosLocais.length; pl++) {
          const recP = pedidosLocais[pl]
          const pId = recP.getString('bling_pedido_id')
          if (pId) {
            mapBlingPedidosExistentes[pId] = recP
          }
        }
      } catch (_) {}

      // Consulta dinâmica de situações dos módulos no Bling (se disponível)
      const mapSituacoesModulos = {}
      try {
        const urlSituacoes = 'https://api.bling.com.br/Api/v3/situacoes/modulos'
        const resSit = getBlingGet(urlSituacoes, 2)
        if (resSit && resSit.statusCode === 200 && resSit.json && resSit.json.data) {
          const listaModulos = resSit.json.data || []
          for (let sm = 0; sm < listaModulos.length; sm++) {
            const mod = listaModulos[sm]
            const sits = mod.situacoes || []
            for (let st = 0; st < sits.length; st++) {
              const sitObj = sits[st]
              const sId = String(sitObj.id || '')
              const sNome = String(sitObj.nome || sitObj.descricao || '')
              if (sId && sNome) {
                mapSituacoesModulos[sId] = sNome
              }
            }
          }
        }
      } catch (_) {
        // Tolerante: caso endpoint não esteja liberado no escopo atual
      }

      // Função auxiliar de normalização de status do pedido
      function normalizarStatusPedido(sitId, sitNome) {
        const n = String(sitNome || '')
          .trim()
          .toLowerCase()
        if (
          n.indexOf('atendido') !== -1 ||
          n.indexOf('faturado') !== -1 ||
          n.indexOf('concluid') !== -1 ||
          n.indexOf('entregue') !== -1
        ) {
          return 'atendido'
        }
        if (n.indexOf('cancelad') !== -1 || n.indexOf('estorn') !== -1) {
          return 'cancelado'
        }
        if (
          n.indexOf('aberto') !== -1 ||
          n.indexOf('pendente') !== -1 ||
          n.indexOf('aguard') !== -1
        ) {
          return 'em_aberto'
        }
        if (n.indexOf('andamento') !== -1 || n.indexOf('process') !== -1) {
          return 'em_andamento'
        }
        return 'outro'
      }

      let paginaPedidos = 1
      const limitePedidos = 100
      let temMaisPedidos = true
      const maxPaginasPedidos = 300
      let blingPedidosCol = null
      try {
        blingPedidosCol = $app.findCollectionByNameOrId('bling_pedidos')
      } catch (_) {}

      while (temMaisPedidos && paginaPedidos <= maxPaginasPedidos) {
        const urlPedidos =
          'https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=' +
          paginaPedidos +
          '&limite=' +
          limitePedidos

        const tInicioPagina = Date.now()
        let resPedidos = null
        try {
          resPedidos = getBlingGet(urlPedidos, 3)
        } catch (errPedReq) {
          const duracaoPagina = Date.now() - tInicioPagina
          const msgErroReq =
            'Página ' +
            paginaPedidos +
            ' de pedidos falhou após ' +
            duracaoPagina +
            'ms: ' +
            String(errPedReq.message || errPedReq)
          errosGerais.push(msgErroReq)
          errosPedidos.push({
            pagina: paginaPedidos,
            status_http: 0,
            duracao_ms: duracaoPagina,
            erro: msgErroReq,
          })
          break
        }

        const duracaoPagina = Date.now() - tInicioPagina
        paginasPedidosLidas++

        if (resPedidos.statusCode === 401 || resPedidos.statusCode === 403) {
          const msg401 =
            'Token do Bling não autorizado ou expirado ao ler pedidos (status ' +
            resPedidos.statusCode +
            ').'
          errosPedidos.push({
            pagina: paginaPedidos,
            status_http: resPedidos.statusCode,
            duracao_ms: duracaoPagina,
            erro: msg401,
          })
          throw new Error(msg401)
        }

        if (resPedidos.statusCode !== 200) {
          const msgHttp =
            'Bling retornou HTTP ' +
            resPedidos.statusCode +
            ' ao buscar pedidos na página ' +
            paginaPedidos +
            ' (' +
            duracaoPagina +
            'ms)'
          errosGerais.push(msgHttp)
          errosPedidos.push({
            pagina: paginaPedidos,
            status_http: resPedidos.statusCode,
            duracao_ms: duracaoPagina,
            erro: msgHttp,
          })
          break
        }

        const dataPedidosJson = resPedidos.json || {}
        const listaPedidos = dataPedidosJson.data || []

        if (!listaPedidos || listaPedidos.length === 0) {
          temMaisPedidos = false
          break
        }

        totalPedidosLidos += listaPedidos.length

        for (let p = 0; p < listaPedidos.length; p++) {
          const ped = listaPedidos[p]
          const pedidoIdRaw = ped.id ? String(ped.id) : ''
          const numeroPedido = ped.numero ? String(ped.numero) : ''
          const contatoPed = ped.contato || {}
          const pedContatoBlingId = contatoPed.id ? String(contatoPed.id) : ''
          const pedDocOriginal = (contatoPed.numeroDocumento || '').trim()
          const pedDoc = normalizarDoc(pedDocOriginal)
          const pedNome = (contatoPed.nome || '').trim()
          const dataPedidoStr = (ped.data || '').trim()
          const dataSaidaStr = (ped.dataSaida || '').trim()
          const totalPedido = Number(
            ped.total !== undefined ? ped.total : ped.valor !== undefined ? ped.valor : 0,
          )

          // Situação
          const sitObj = ped.situacao || {}
          const sitId = sitObj.id ? String(sitObj.id) : ''
          let sitNome = mapSituacoesModulos[sitId] || ''
          if (!sitNome && sitObj.valor !== undefined) {
            sitNome = 'Situação #' + sitId + ' (' + sitObj.valor + ')'
          } else if (!sitNome && sitId) {
            sitNome = 'Situação #' + sitId
          }
          const statusNormalizado = normalizarStatusPedido(sitId, sitNome)

          // Vendedor do pedido
          let vendedorBlingNome = ''
          if (ped.vendedor && ped.vendedor.nome) {
            vendedorBlingNome = ped.vendedor.nome
          }
          const vendedorCrm = mapearVendedor(vendedorBlingNome)
          const responsavelUsuarioId = resolverUsuarioIdPorVendedorCrm(vendedorCrm)

          // 5. MATCHING DE CLIENTE
          // Prioridade: 1. bling_id; 2. CNPJ/CPF; 3. Consumidor Final; 4. Razão Social/Nome
          let clienteAlvo = null
          if (pedContatoBlingId && mapPorBlingId[pedContatoBlingId]) {
            clienteAlvo = mapPorBlingId[pedContatoBlingId]
          } else if (pedDoc && mapPorDoc[pedDoc]) {
            clienteAlvo = mapPorDoc[pedDoc]
          } else if (isConsumidorFinalNome(pedNome) && recConsumidorFinal) {
            clienteAlvo = recConsumidorFinal
          } else if (pedNome && mapPorNomeEmpresa[pedNome.toLowerCase()]) {
            clienteAlvo = mapPorNomeEmpresa[pedNome.toLowerCase()]
          }

          // Se cliente não encontrado: NÃO descartar o pedido.
          // Salvar cliente_id = null, status_vinculo = pendente, bling_contato_id = valor real.
          let statusVinculo = 'vinculado'
          let clienteIdParaSalvar = null
          if (clienteAlvo) {
            clienteIdParaSalvar = clienteAlvo.id
            statusVinculo = 'vinculado'
          } else {
            statusVinculo = 'pendente'
            totalPedidosSemCliente++
          }

          // PERSISTÊNCIA IDEMPOTENTE EM bling_pedidos (UPSERT por bling_pedido_id)
          if (blingPedidosCol && pedidoIdRaw) {
            let recPedido = mapBlingPedidosExistentes[pedidoIdRaw]
            let isNovoPedido = false

            if (!recPedido) {
              recPedido = new Record(blingPedidosCol)
              recPedido.set('bling_pedido_id', pedidoIdRaw)
              isNovoPedido = true
            }

            recPedido.set('numero', numeroPedido)
            recPedido.set('cliente_id', clienteIdParaSalvar)
            recPedido.set('bling_contato_id', pedContatoBlingId)
            recPedido.set('contato_nome', pedNome)
            recPedido.set('documento', pedDocOriginal)
            recPedido.set('vendedor_bling', vendedorBlingNome)
            recPedido.set('vendedor_crm', vendedorCrm)
            recPedido.set('responsavel_id', responsavelUsuarioId)

            if (dataPedidoStr) {
              recPedido.set('data_pedido', dataPedidoStr)
            }
            if (dataSaidaStr) {
              recPedido.set('data_atendimento', dataSaidaStr)
            }
            recPedido.set('valor_total', totalPedido)
            recPedido.set('situacao_bling_id', sitId)
            recPedido.set('situacao_bling_nome', sitNome)
            recPedido.set('status_normalizado', statusNormalizado)
            recPedido.set('status_vinculo', statusVinculo)
            recPedido.set('sincronizado_em', new Date().toISOString())

            try {
              $app.save(recPedido)
              mapBlingPedidosExistentes[pedidoIdRaw] = recPedido
              if (isNovoPedido) {
                totalPedidosPersistidos++
              } else {
                totalPedidosAtualizados++
                totalPedidosDuplicados++
              }
            } catch (errPedSave) {
              errosGerais.push(
                'Erro ao salvar pedido bling_id ' +
                  pedidoIdRaw +
                  ' (número ' +
                  numeroPedido +
                  '): ' +
                  String(errPedSave.message || errPedSave),
              )
            }
          }

          // Consolidação de vendas para o cliente (somente se vinculado)
          if (clienteAlvo) {
            const cid = clienteAlvo.id
            if (!dadosVendasPorCliente[cid]) {
              dadosVendasPorCliente[cid] = {
                cliente: clienteAlvo,
                totalVendas: 0,
                qtdVendas: 0,
                primeiraCompra: dataPedidoStr,
                ultimaCompra: dataPedidoStr,
              }
            }

            const reg = dadosVendasPorCliente[cid]
            reg.totalVendas += totalPedido
            reg.qtdVendas += 1

            if (dataPedidoStr) {
              if (!reg.primeiraCompra || dataPedidoStr < reg.primeiraCompra) {
                reg.primeiraCompra = dataPedidoStr
              }
              if (!reg.ultimaCompra || dataPedidoStr > reg.ultimaCompra) {
                reg.ultimaCompra = dataPedidoStr
              }
            }
          }
        }

        if (listaPedidos.length < limitePedidos) {
          temMaisPedidos = false
        } else {
          paginaPedidos++
        }
      }

      // ==============================================================
      // 5. ATUALIZAR STATUS E HISTÓRICO COMERCIAL NOS CLIENTES (IDEMPOTENTE)
      // ==============================================================
      const agora = new Date()
      const limite6Meses = new Date(agora)
      limite6Meses.setMonth(limite6Meses.getMonth() - 6)

      const chavesClientes = Object.keys(dadosVendasPorCliente)
      for (let k = 0; k < chavesClientes.length; k++) {
        const cId = chavesClientes[k]
        const inf = dadosVendasPorCliente[cId]
        const cliRec = inf.cliente

        let modificado = false
        const totalArredondado = Math.round(inf.totalVendas * 100) / 100
        if (cliRec.getInt('valor_total_vendas') !== totalArredondado) {
          cliRec.set('valor_total_vendas', totalArredondado)
          modificado = true
        }

        if (inf.primeiraCompra && cliRec.getString('data_primeira_compra') !== inf.primeiraCompra) {
          cliRec.set('data_primeira_compra', inf.primeiraCompra)
          modificado = true
        }

        if (inf.ultimaCompra) {
          if (cliRec.getString('data_ultima_compra') !== inf.ultimaCompra) {
            cliRec.set('data_ultima_compra', inf.ultimaCompra)
            modificado = true
          }

          const dUltima = new Date(inf.ultimaCompra)
          if (!isNaN(dUltima.getTime())) {
            const statusCalculado = dUltima >= limite6Meses ? 'ativo' : 'para_reativacao'
            if (cliRec.getString('status_cliente') !== statusCalculado) {
              cliRec.set('status_cliente', statusCalculado)
              cliRec.set('status', statusCalculado === 'ativo' ? 'ativo' : 'rascunho')
              modificado = true
            }
          }
        }

        if (modificado) {
          try {
            $app.save(cliRec)
            clientesComComprasAtualizadas++
          } catch (errCliSave) {
            errosGerais.push(
              'Erro ao consolidar compras no cliente ' +
                cId +
                ': ' +
                String(errCliSave.message || errCliSave),
            )
          }
        }
      }

      // ==============================================================
      // 6. FINALIZAR LOG DE SINCRONIZAÇÃO
      // ==============================================================
      const duracaoMs = Date.now() - t0
      const statusFinal =
        errosGerais.length === 0
          ? 'sucesso'
          : totalClientesLidos > 0 || totalPedidosLidos > 0
            ? 'sucesso_parcial'
            : 'erro'

      const msgResumo =
        'Concluído em ' +
        Math.round(duracaoMs / 1000) +
        's: ' +
        totalClientesLidos +
        ' contatos lidos (' +
        totalClientesCriados +
        ' novos, ' +
        totalClientesAtualizados +
        ' atualizados), ' +
        totalPedidosLidos +
        ' pedidos lidos (' +
        totalPedidosPersistidos +
        ' persistidos, ' +
        totalPedidosAtualizados +
        ' atualizados, ' +
        totalPedidosSemCliente +
        ' pendentes vínculo). Erros: ' +
        errosGerais.length

      if (logRecord) {
        try {
          logRecord.set('finalizado_em', new Date().toISOString())
          logRecord.set('status', statusFinal)
          logRecord.set('clientes_lidos', totalClientesLidos)
          logRecord.set('clientes_criados', totalClientesCriados)
          logRecord.set('clientes_atualizados', totalClientesAtualizados)
          logRecord.set('clientes_ignorados', totalClientesIgnorados)
          logRecord.set('pedidos_lidos', totalPedidosLidos)
          logRecord.set('pedidos_persistidos', totalPedidosPersistidos)
          logRecord.set('pedidos_atualizados', totalPedidosAtualizados)
          logRecord.set('pedidos_duplicados', totalPedidosDuplicados)
          logRecord.set('pedidos_sem_cliente', totalPedidosSemCliente)
          logRecord.set('paginas_pedidos_lidas', paginasPedidosLidas)
          logRecord.set('erros_pedidos', errosPedidos.slice(0, 30))
          logRecord.set('erros', errosGerais.slice(0, 50))
          logRecord.set('duracao_ms', duracaoMs)
          logRecord.set('mensagem_resumo', msgResumo)
          $app.save(logRecord)
        } catch (_) {}
      }

      return e.json(200, {
        success: statusFinal !== 'erro',
        status: statusFinal,
        iniciado_em: iniciadoEm.toISOString(),
        finalizado_em: new Date().toISOString(),
        duracao_ms: duracaoMs,
        clientes_consultados: totalClientesLidos,
        clientes_criados: totalClientesCriados,
        clientes_atualizados: totalClientesAtualizados,
        clientes_ignorados: totalClientesIgnorados,
        pedidos_consultados: totalPedidosLidos,
        pedidos_persistidos: totalPedidosPersistidos,
        pedidos_atualizados: totalPedidosAtualizados,
        pedidos_duplicados: totalPedidosDuplicados,
        pedidos_sem_cliente: totalPedidosSemCliente,
        paginas_pedidos_lidas: paginasPedidosLidas,
        clientes_com_compras_atualizadas: clientesComComprasAtualizadas,
        erros: errosGerais,
        erros_pedidos: errosPedidos,
        mensagem: msgResumo,
      })
    } catch (errFatal) {
      const duracaoMs = Date.now() - t0
      const msgErro = String(errFatal.message || errFatal)
      errosGerais.push('Erro crítico: ' + msgErro)

      if (logRecord) {
        try {
          logRecord.set('finalizado_em', new Date().toISOString())
          logRecord.set('status', 'erro')
          logRecord.set('erros', errosGerais)
          logRecord.set('duracao_ms', duracaoMs)
          logRecord.set('mensagem_resumo', 'Falha na sincronização: ' + msgErro)
          $app.save(logRecord)
        } catch (_) {}
      }

      return e.json(500, {
        success: false,
        status: 'erro',
        duracao_ms: duracaoMs,
        mensagem: 'Erro ao executar sincronização do Bling ERP: ' + msgErro,
        erros: errosGerais,
      })
    }
  },
  $apis.requireAuth(),
)
