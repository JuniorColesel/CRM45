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

    // Escopos de menor privilégio: estritamente contatos, pedidos de venda e propostas comerciais (v0.0.75)
    // Conforme especificação, sem permissões financeiras ou de escrita (somente leitura)
    const scopes = encodeURIComponent('contatos:read pedidos-vendas:read propostas-comerciais:read')
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

    // Buscar resumo de auditoria gravado
    let auditoriaResumo = ''
    try {
      const logs = $app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
      if (logs && logs.length > 0) {
        auditoriaResumo = logs[0].getString('mensagem_resumo') || ''
      }
    } catch (_) {}

    // Buscar auditoria estruturada de propostas mais recente salva em erros_propostas
    let auditoriaExtraida = null
    try {
      const sLogs = $app.findRecordsByFilter('bling_sync_logs', '', '-created', 1, 0)
      if (sLogs && sLogs.length > 0) {
        const rawErrosPropostas = sLogs[0].get('erros_propostas')
        if (rawErrosPropostas) {
          if (typeof rawErrosPropostas === 'object') {
            auditoriaExtraida = rawErrosPropostas
          } else if (typeof rawErrosPropostas === 'string') {
            auditoriaExtraida = JSON.parse(rawErrosPropostas)
          }
        }
      }
    } catch (_) {}

    // Agregação em tempo real de propostas comerciais (v0.0.77 - Item 6 da pauta)
    // Contagens reais agrupadas por status_normalizado e vínculo
    const propostasResumoReal = {
      total: 0,
      rascunho: 0,
      aguardando: 0,
      nao_aprovada: 0,
      convertida: 0,
      outro: 0,
      pendentes_vinculo: 0,
    }

    try {
      if (
        auditoriaExtraida &&
        auditoriaExtraida.totais &&
        auditoriaExtraida.dist_status_normalizado
      ) {
        propostasResumoReal.total = auditoriaExtraida.totais.total || 0
        propostasResumoReal.rascunho = auditoriaExtraida.dist_status_normalizado.rascunho || 0
        propostasResumoReal.aguardando = auditoriaExtraida.dist_status_normalizado.aguardando || 0
        propostasResumoReal.nao_aprovada =
          auditoriaExtraida.dist_status_normalizado.nao_aprovada || 0
        propostasResumoReal.convertida = auditoriaExtraida.dist_status_normalizado.convertida || 0
        propostasResumoReal.outro = auditoriaExtraida.dist_status_normalizado.outro || 0
        propostasResumoReal.pendentes_vinculo = (auditoriaExtraida.pendentes_det || []).length
      } else {
        const todasPropostas = $app.findRecordsByFilter('bling_propostas', '', '', 5000, 0)
        propostasResumoReal.total = todasPropostas ? todasPropostas.length : 0
        for (let idx = 0; idx < propostasResumoReal.total; idx++) {
          const pRec = todasPropostas[idx]
          const st = pRec.getString('status_normalizado')
          if (st === 'rascunho') propostasResumoReal.rascunho++
          else if (st === 'aguardando') propostasResumoReal.aguardando++
          else if (st === 'nao_aprovada') propostasResumoReal.nao_aprovada++
          else if (st === 'convertida') propostasResumoReal.convertida++
          else propostasResumoReal.outro++

          if (pRec.getString('status_vinculo') === 'pendente') {
            propostasResumoReal.pendentes_vinculo++
          }
        }
      }
    } catch (_) {}

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
      auditoria_resumo: auditoriaResumo,
      auditoria_extraida: auditoriaExtraida,
      propostas_resumo_real: propostasResumoReal,
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
    } else if (tipo === 'propostas') {
      endpointBling =
        'https://api.bling.com.br/Api/v3/propostas-comerciais?pagina=' +
        pagina +
        '&limite=' +
        limite
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
// WORKER AD-HOC DE SEGUNDO PLANO (CRON RUNNER IDIOMÁTICO)
// ============================================================================
cronAdd('bling_sync_manual_runner', '* * * * *', () => {
  let logIdParaExecutar = ''
  try {
    const limiteLockIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const logsProcessando = $app.findRecordsByFilter(
      'bling_sync_logs',
      `status = 'processando' && iniciado_em >= '${limiteLockIso}'`,
      '-created',
      1,
      0,
    )
    if (logsProcessando && logsProcessando.length > 0) {
      logIdParaExecutar = logsProcessando[0].id
    }
  } catch (_) {}

  if (!logIdParaExecutar) {
    return
  }

  // --- MOTOR DE SINCRONIZAÇÃO TOTALMENTE INLINE DENTRO DO CALLBACK DO RUNNER ---
  // (O JSVM do PocketBase roda cada callback em VM isolada; funções auxiliares devem ser locais)
  try {
    console.log('[BLING-RUNNER] Disparando motor para o registro de log:', logIdParaExecutar)

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

            const tokenRenovado = executarRefreshOAuth(conn)
            if (tokenRenovado) {
              return { token: tokenRenovado, conn: conn, renovado: true }
            }
          }
        }
      } catch (_) {}

      return { token: '', conn: null, renovado: false }
    }

    function executarMotorSincronizacaoBlingInline(logRecordId) {
      const t0 = Date.now()
      let logRecord = null
      try {
        if (logRecordId) {
          logRecord = $app.findRecordById('bling_sync_logs', logRecordId)
        }
      } catch (_) {}

      if (!logRecord) {
        try {
          const limiteLockIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
          const logsProc = $app.findRecordsByFilter(
            'bling_sync_logs',
            `status = 'processando' && iniciado_em >= '${limiteLockIso}'`,
            '-created',
            1,
            0,
          )
          if (logsProc && logsProc.length > 0) {
            logRecord = logsProc[0]
          }
        } catch (_) {}
      }

      const tokenInfo = getValidBlingAccessToken()
      let currentAccessToken = tokenInfo.token
      const connectionRecord = tokenInfo.conn

      if (!currentAccessToken) {
        if (logRecord) {
          try {
            logRecord.set('status', 'erro')
            logRecord.set('finalizado_em', new Date().toISOString())
            logRecord.set('mensagem_resumo', 'Token OAuth do Bling inválido ou desconectado.')
            logRecord.set('erros', [
              'Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar.',
            ])
            $app.save(logRecord)
          } catch (_) {}
        }
        return { success: false, status: 'erro', erro: 'Token inválido' }
      }

      const iniciadoEm =
        logRecord && logRecord.getString('iniciado_em')
          ? new Date(logRecord.getString('iniciado_em'))
          : new Date()

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
        if (!vendedorBling) return null
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
          v === 'MARIA CAROLINE' ||
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
        console.warn(
          '[BLING-SYNC] Vendedor Bling desconhecido não mapeado: "' +
            vendedorBling +
            '" -> tratado como sem vendedor.',
        )
        return null
      }

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
        if (!vendedorCrm) return null
        if (mapVendedorParaUsuarioId[vendedorCrm]) {
          return mapVendedorParaUsuarioId[vendedorCrm]
        }
        return null
      }

      function pausarMs(ms) {
        if (!ms || ms <= 0) return
        const tAlvo = Date.now() + ms
        while (Date.now() < tAlvo) {
          /* pausa controlada na VM */
        }
      }

      let ultimoMomentoChamada = 0
      function throttleChamadaBling(intervaloMinMs) {
        const minIntervalo = intervaloMinMs || 380
        const agora = Date.now()
        const decorrido = agora - ultimoMomentoChamada
        if (decorrido < minIntervalo) {
          pausarMs(minIntervalo - decorrido)
        }
        ultimoMomentoChamada = Date.now()
      }

      let refreshExecutadoPor401 = false
      function getBlingGet(url, maxTentativas) {
        let tentativas = 0
        const limite = maxTentativas || 4
        let ultimoResultado = null
        let ultimoErro = null

        while (tentativas < limite) {
          tentativas++
          throttleChamadaBling(380)

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

            if (res.statusCode === 401 && !refreshExecutadoPor401 && connectionRecord) {
              refreshExecutadoPor401 = true
              const novoToken = executarRefreshOAuth(connectionRecord)
              if (novoToken) {
                currentAccessToken = novoToken
                throttleChamadaBling(380)
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

            if (res.statusCode === 429 && tentativas < limite) {
              const esperaMs = 1200 * tentativas
              pausarMs(esperaMs)
              continue
            }

            if (res.statusCode >= 500 && tentativas < limite) {
              const esperaMs = 1000 * tentativas
              pausarMs(esperaMs)
              continue
            }

            return res
          } catch (httpErr) {
            ultimoErro = httpErr
            if (tentativas < limite) {
              const esperaMs = 800 * tentativas
              pausarMs(esperaMs)
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
      const avisosGerais = []
      const errosPedidos = []
      const errosPropostas = []
      let statusNaoMapeados = 0
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

      let totalPropostasLidas = 0
      let totalPropostasPersistidas = 0
      let totalPropostasAtualizadas = 0
      let totalPropostasDuplicadas = 0
      let totalPropostasSemCliente = 0
      let paginasPropostasLidas = 0

      let clientesComComprasAtualizadas = 0

      try {
        const clientesExistentes = $app.findRecordsByFilter('clientes', '', '-created', 5000, 0)
        const mapPorBlingId = {}
        const mapPorDoc = {}
        const mapPorEmail = {}

        for (let i = 0; i < clientesExistentes.length; i++) {
          const c = clientesExistentes[i]
          const bId = c.getString('bling_id')
          const doc = normalizarDoc(c.getString('documento'))
          const em = normalizarEm(c.getString('email'))

          if (bId) mapPorBlingId[bId] = c
          if (doc) mapPorDoc[doc] = c
          if (em) mapPorEmail[em] = c
        }

        let paginaContatos = 1
        let temMaisContatos = true
        const limitePorPaginaContatos = 100

        while (temMaisContatos) {
          const urlContatos =
            'https://api.bling.com.br/Api/v3/contatos?pagina=' +
            paginaContatos +
            '&limite=' +
            limitePorPaginaContatos +
            '&criterio=1'

          let resContatos = null
          try {
            resContatos = getBlingGet(urlContatos, 4)
          } catch (errReq) {
            avisosGerais.push(
              'Erro ao buscar página ' +
                paginaContatos +
                ' de contatos: ' +
                String(errReq.message || errReq),
            )
            break
          }

          if (resContatos.statusCode === 404 || resContatos.statusCode === 204) {
            temMaisContatos = false
            break
          }

          if (resContatos.statusCode < 200 || resContatos.statusCode >= 300) {
            avisosGerais.push(
              'Status inesperado na página ' +
                paginaContatos +
                ' de contatos: ' +
                resContatos.statusCode,
            )
            break
          }

          const cJson = resContatos.json || {}
          const contatosArr = cJson.data || []
          if (!contatosArr || contatosArr.length === 0) {
            temMaisContatos = false
            break
          }

          for (let ci = 0; ci < contatosArr.length; ci++) {
            totalClientesLidos++
            const item = contatosArr[ci]
            const blingId = String(item.id || '')
            const nomeContato = String(item.nome || '').trim()

            if (isConsumidorFinalNome(nomeContato)) {
              totalClientesIgnorados++
              continue
            }

            const docRaw = item.numeroDocumento || ''
            const docNorm = normalizarDoc(docRaw)
            const emailNorm = normalizarEm(item.email || '')
            const fone = String(item.telefone || item.celular || '').trim()
            const tipoPessoa = item.tipo === 'J' ? 'PJ' : 'PF'

            let cRecord = null
            if (blingId && mapPorBlingId[blingId]) {
              cRecord = mapPorBlingId[blingId]
            } else if (docNorm && mapPorDoc[docNorm]) {
              cRecord = mapPorDoc[docNorm]
            } else if (emailNorm && mapPorEmail[emailNorm]) {
              cRecord = mapPorEmail[emailNorm]
            }

            const vendBling = item.vendedor ? item.vendedor.nome : ''
            const vendCrm = mapearVendedor(vendBling)
            const usuarioIdAtribuido = resolverUsuarioIdPorVendedorCrm(vendCrm)

            if (cRecord) {
              let alterou = false
              if (!cRecord.getString('bling_id') && blingId) {
                cRecord.set('bling_id', blingId)
                alterou = true
              }
              if (!cRecord.getString('documento') && docRaw) {
                cRecord.set('documento', docRaw)
                alterou = true
              }
              if (!cRecord.getString('email') && emailNorm) {
                cRecord.set('email', emailNorm)
                alterou = true
              }
              if (!cRecord.getString('telefone') && fone) {
                cRecord.set('telefone', fone)
                alterou = true
              }
              if (alterou) {
                try {
                  $app.save(cRecord)
                  totalClientesAtualizados++
                  if (blingId) mapPorBlingId[blingId] = cRecord
                  if (docNorm) mapPorDoc[docNorm] = cRecord
                  if (emailNorm) mapPorEmail[emailNorm] = cRecord
                } catch (eUp) {
                  avisosGerais.push('Erro ao atualizar cliente ' + nomeContato + ': ' + eUp.message)
                }
              }
            } else {
              try {
                const clientesCol = $app.findCollectionByNameOrId('clientes')
                const novoC = new Record(clientesCol)
                novoC.set('nome_empresa', nomeContato || 'Cliente Bling #' + blingId)
                novoC.set('documento', docRaw)
                novoC.set('email', emailNorm)
                novoC.set('telefone', fone)
                novoC.set('tipo_contato', tipoPessoa)
                novoC.set('status_cliente', 'ativo')
                novoC.set('bling_id', blingId)
                if (vendCrm) novoC.set('vendedor', vendCrm)
                if (usuarioIdAtribuido) novoC.set('responsavel_id', usuarioIdAtribuido)

                $app.save(novoC)
                totalClientesCriados++
                if (blingId) mapPorBlingId[blingId] = novoC
                if (docNorm) mapPorDoc[docNorm] = novoC
                if (emailNorm) mapPorEmail[emailNorm] = novoC
              } catch (eCriar) {
                avisosGerais.push('Erro ao criar cliente ' + nomeContato + ': ' + eCriar.message)
              }
            }
          }

          if (contatosArr.length < limitePorPaginaContatos) {
            temMaisContatos = false
          } else {
            paginaContatos++
          }
        }

        // ====================================================================
        // 3. SINCRONIZAÇÃO DE PEDIDOS DE VENDA
        // ====================================================================
        let paginaPedidos = 1
        let temMaisPedidos = true
        const limitePorPaginaPedidos = 100
        const comprasPorClienteId = {}

        while (temMaisPedidos) {
          const urlPedidos =
            'https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=' +
            paginaPedidos +
            '&limite=' +
            limitePorPaginaPedidos

          let resPedidos = null
          try {
            resPedidos = getBlingGet(urlPedidos, 4)
            paginasPedidosLidas++
          } catch (errPed) {
            avisosGerais.push(
              'Erro ao buscar página ' +
                paginaPedidos +
                ' de pedidos: ' +
                String(errPed.message || errPed),
            )
            break
          }

          if (resPedidos.statusCode === 404 || resPedidos.statusCode === 204) {
            temMaisPedidos = false
            break
          }

          if (resPedidos.statusCode < 200 || resPedidos.statusCode >= 300) {
            avisosGerais.push(
              'Status inesperado na página ' +
                paginaPedidos +
                ' de pedidos: ' +
                resPedidos.statusCode,
            )
            break
          }

          const pedJson = resPedidos.json || {}
          const pedidosArr = pedJson.data || []
          if (!pedidosArr || pedidosArr.length === 0) {
            temMaisPedidos = false
            break
          }

          for (let pi = 0; pi < pedidosArr.length; pi++) {
            totalPedidosLidos++
            const itemP = pedidosArr[pi]
            const blingPedidoId = String(itemP.id || '')
            const numPedido = String(itemP.numero || '')
            const sitId = itemP.situacao ? String(itemP.situacao.id || '') : ''
            const valorTotal = Number(itemP.total || itemP.valor || 0)
            const dataPed = itemP.data || itemP.dataSaida || ''

            let sitNome = ''
            if (sitId === '6') sitNome = 'Em aberto'
            else if (sitId === '9') sitNome = 'Atendido'
            else if (sitId === '12') sitNome = 'Cancelado'
            else if (itemP.situacao && itemP.situacao.nome) sitNome = itemP.situacao.nome
            else sitNome = 'Situacao #' + sitId

            let clienteRecordAssociado = null
            if (itemP.contato) {
              const cBlingId = String(itemP.contato.id || '')
              const cDoc = normalizarDoc(itemP.contato.numeroDocumento || '')
              if (cBlingId && mapPorBlingId[cBlingId]) {
                clienteRecordAssociado = mapPorBlingId[cBlingId]
              } else if (cDoc && mapPorDoc[cDoc]) {
                clienteRecordAssociado = mapPorDoc[cDoc]
              }
            }

            let statusVinculo = 'desvinculado'
            let clienteCrmId = ''
            if (clienteRecordAssociado) {
              statusVinculo = 'vinculado'
              clienteCrmId = clienteRecordAssociado.id

              if (
                sitId === '6' ||
                sitId === '9' ||
                sitNome === 'Em aberto' ||
                sitNome === 'Atendido'
              ) {
                if (!comprasPorClienteId[clienteCrmId]) {
                  comprasPorClienteId[clienteCrmId] = {
                    totalValor: 0,
                    qtdPedidos: 0,
                    datas: [],
                  }
                }
                comprasPorClienteId[clienteCrmId].totalValor += valorTotal
                comprasPorClienteId[clienteCrmId].qtdPedidos += 1
                if (dataPed) comprasPorClienteId[clienteCrmId].datas.push(dataPed)
              }
            } else {
              totalPedidosSemCliente++
            }

            const vendP = itemP.vendedor ? itemP.vendedor.nome : ''
            const vendCrmP = mapearVendedor(vendP)
            const respIdP = resolverUsuarioIdPorVendedorCrm(vendCrmP)

            let pedExistente = null
            try {
              pedExistente = $app.findFirstRecordByData(
                'bling_pedidos',
                'bling_pedido_id',
                blingPedidoId,
              )
            } catch (_) {}

            if (pedExistente) {
              try {
                pedExistente.set('numero', numPedido)
                pedExistente.set('situacao_bling_id', sitId)
                pedExistente.set('situacao_bling_nome', sitNome)
                pedExistente.set('valor_total', valorTotal)
                pedExistente.set('data_pedido', dataPed)
                pedExistente.set('cliente_id', clienteCrmId)
                pedExistente.set('status_vinculo', statusVinculo)
                if (vendCrmP) pedExistente.set('vendedor_crm', vendCrmP)
                if (respIdP) pedExistente.set('responsavel_id', respIdP)

                $app.save(pedExistente)
                totalPedidosAtualizados++
              } catch (eUpPed) {
                errosPedidos.push('Erro ao atualizar pedido ' + numPedido + ': ' + eUpPed.message)
              }
            } else {
              try {
                const pedCol = $app.findCollectionByNameOrId('bling_pedidos')
                const novoPed = new Record(pedCol)
                novoPed.set('bling_pedido_id', blingPedidoId)
                novoPed.set('numero', numPedido)
                novoPed.set('situacao_bling_id', sitId)
                novoPed.set('situacao_bling_nome', sitNome)
                novoPed.set('valor_total', valorTotal)
                novoPed.set('data_pedido', dataPed)
                novoPed.set('cliente_id', clienteCrmId)
                novoPed.set('status_vinculo', statusVinculo)
                if (vendCrmP) novoPed.set('vendedor_crm', vendCrmP)
                if (respIdP) novoPed.set('responsavel_id', respIdP)

                $app.save(novoPed)
                totalPedidosPersistidos++
              } catch (eAddPed) {
                errosPedidos.push('Erro ao criar pedido ' + numPedido + ': ' + eAddPed.message)
              }
            }
          }

          if (pedidosArr.length < limitePorPaginaPedidos) {
            temMaisPedidos = false
          } else {
            paginaPedidos++
          }
        }

        // ====================================================================
        // 4. ATUALIZAR ACUMULADOS DE COMPRA NOS CLIENTES
        // ====================================================================
        for (const cId in comprasPorClienteId) {
          try {
            const cRec = $app.findRecordById('clientes', cId)
            const dadosComp = comprasPorClienteId[cId]
            cRec.set('valor_total_vendas', dadosComp.totalValor)
            cRec.set('total_compras', dadosComp.qtdPedidos)
            if (dadosComp.datas.length > 0) {
              dadosComp.datas.sort()
              const ultima = dadosComp.datas[dadosComp.datas.length - 1]
              cRec.set('data_ultima_compra', ultima)
            }
            $app.save(cRec)
            clientesComComprasAtualizadas++
          } catch (_) {}
        }

        // ====================================================================
        // 5. SINCRONIZAÇÃO DE PROPOSTAS COMERCIAIS
        // ====================================================================
        let paginaPropostas = 1
        let temMaisPropostas = true
        const limitePorPaginaPropostas = 100

        while (temMaisPropostas) {
          const urlPropostas =
            'https://api.bling.com.br/Api/v3/propostas-comerciais?pagina=' +
            paginaPropostas +
            '&limite=' +
            limitePorPaginaPropostas

          let resPropostas = null
          try {
            resPropostas = getBlingGet(urlPropostas, 4)
            paginasPropostasLidas++
          } catch (errProp) {
            avisosGerais.push(
              'Erro ao buscar página ' +
                paginaPropostas +
                ' de propostas: ' +
                String(errProp.message || errProp),
            )
            break
          }

          if (resPropostas.statusCode === 404 || resPropostas.statusCode === 204) {
            temMaisPropostas = false
            break
          }

          if (resPropostas.statusCode < 200 || resPropostas.statusCode >= 300) {
            avisosGerais.push(
              'Status inesperado na página ' +
                paginaPropostas +
                ' de propostas: ' +
                resPropostas.statusCode,
            )
            break
          }

          const propJson = resPropostas.json || {}
          const propostasArr = propJson.data || []
          if (!propostasArr || propostasArr.length === 0) {
            temMaisPropostas = false
            break
          }

          for (let pri = 0; pri < propostasArr.length; pri++) {
            totalPropostasLidas++
            const itemPr = propostasArr[pri]
            const blingPropId = String(itemPr.id || '')
            const numProp = String(itemPr.numero || '')
            const sitPropId = itemPr.situacao ? String(itemPr.situacao.id || '') : ''
            const valorTotalProp = Number(itemPr.total || itemPr.valor || 0)
            const dataProp = itemPr.data || ''

            let sitPropNome = ''
            let statusNormalizado = 'outro'
            let visivelFunil = 0

            if (sitPropId === '0' || sitPropId === 'rascunho') {
              sitPropNome = 'Rascunho'
              statusNormalizado = 'rascunho'
              visivelFunil = 1
            } else if (sitPropId === '1' || sitPropId === 'aguardando') {
              sitPropNome = 'Aguardando aprovação'
              statusNormalizado = 'aguardando'
              visivelFunil = 1
            } else if (sitPropId === '2' || sitPropId === 'aprovada') {
              sitPropNome = 'Aprovada'
              statusNormalizado = 'convertida'
              visivelFunil = 0
            } else if (sitPropId === '3' || sitPropId === 'nao_aprovada') {
              sitPropNome = 'Não aprovada'
              statusNormalizado = 'nao_aprovada'
              visivelFunil = 1
            } else {
              sitPropNome =
                itemPr.situacao && itemPr.situacao.nome
                  ? itemPr.situacao.nome
                  : 'Situacao #' + sitPropId
              statusNaoMapeados++
            }

            let clienteRecordProp = null
            if (itemPr.contato) {
              const cBlingId = String(itemPr.contato.id || '')
              const cDoc = normalizarDoc(itemPr.contato.numeroDocumento || '')
              if (cBlingId && mapPorBlingId[cBlingId]) {
                clienteRecordProp = mapPorBlingId[cBlingId]
              } else if (cDoc && mapPorDoc[cDoc]) {
                clienteRecordProp = mapPorDoc[cDoc]
              }
            }

            let statusVinculoProp = 'pendente'
            let clienteCrmIdProp = ''
            if (clienteRecordProp) {
              statusVinculoProp = 'vinculado'
              clienteCrmIdProp = clienteRecordProp.id
            } else {
              totalPropostasSemCliente++
            }

            const vendProp = itemPr.vendedor ? itemPr.vendedor.nome : ''
            const vendCrmProp = mapearVendedor(vendProp)
            const respIdProp = resolverUsuarioIdPorVendedorCrm(vendCrmProp)

            let propExistente = null
            try {
              propExistente = $app.findFirstRecordByData(
                'bling_propostas',
                'bling_proposta_id',
                blingPropId,
              )
            } catch (_) {}

            if (propExistente) {
              try {
                propExistente.set('numero', numProp)
                propExistente.set('situacao_bling_id', sitPropId)
                propExistente.set('situacao_bling_nome', sitPropNome)
                propExistente.set('status_normalizado', statusNormalizado)
                propExistente.set('visivel_funil', visivelFunil)
                propExistente.set('valor_total', valorTotalProp)
                propExistente.set('data_proposta', dataProp)
                propExistente.set('cliente_id', clienteCrmIdProp)
                propExistente.set('status_vinculo', statusVinculoProp)
                if (vendCrmProp) propExistente.set('vendedor_crm', vendCrmProp)
                if (respIdProp) propExistente.set('responsavel_id', respIdProp)

                $app.save(propExistente)
                totalPropostasAtualizadas++
              } catch (eUpProp) {
                errosPropostas.push(
                  'Erro ao atualizar proposta ' + numProp + ': ' + eUpProp.message,
                )
              }
            } else {
              try {
                const propCol = $app.findCollectionByNameOrId('bling_propostas')
                const novaProp = new Record(propCol)
                novaProp.set('bling_proposta_id', blingPropId)
                novaProp.set('numero', numProp)
                novaProp.set('situacao_bling_id', sitPropId)
                novaProp.set('situacao_bling_nome', sitPropNome)
                novaProp.set('status_normalizado', statusNormalizado)
                novaProp.set('visivel_funil', visivelFunil)
                novaProp.set('valor_total', valorTotalProp)
                novaProp.set('data_proposta', dataProp)
                novaProp.set('cliente_id', clienteCrmIdProp)
                novaProp.set('status_vinculo', statusVinculoProp)
                if (vendCrmProp) novaProp.set('vendedor_crm', vendCrmProp)
                if (respIdProp) novaProp.set('responsavel_id', respIdProp)

                $app.save(novaProp)
                totalPropostasPersistidas++
              } catch (eAddProp) {
                errosPropostas.push('Erro ao criar proposta ' + numProp + ': ' + eAddProp.message)
              }
            }
          }

          if (propostasArr.length < limitePorPaginaPropostas) {
            temMaisPropostas = false
          } else {
            paginaPropostas++
          }
        }

        // ====================================================================
        // 6. MATERIALIZAÇÃO DE OPORTUNIDADES NO CRM
        // ====================================================================
        try {
          const etapasList = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 20, 0)
          let etapaPropostaId = ''
          let etapaNegociacaoId = ''
          let etapaEmAbertoBlingId = ''
          let etapaFechadoId = ''
          let etapaPerdidoId = ''

          for (let ep = 0; ep < etapasList.length; ep++) {
            const epRec = etapasList[ep]
            const epNome = epRec.getString('nome').toLowerCase()
            if (epNome.indexOf('propost') !== -1) etapaPropostaId = epRec.id
            if (epNome.indexOf('negoc') !== -1) etapaNegociacaoId = epRec.id
            if (epNome.indexOf('em aberto') !== -1) etapaEmAbertoBlingId = epRec.id
            if (epNome === 'fechado') etapaFechadoId = epRec.id
            if (epNome === 'perdido') etapaPerdidoId = epRec.id
          }

          let motivoNaoAprovadaId = ''
          let motivoCanceladoId = ''
          try {
            const motNaoAprov = $app.findFirstRecordByData(
              'motivos_perda',
              'descricao',
              'Não aprovada no Bling',
            )
            if (motNaoAprov) motivoNaoAprovadaId = motNaoAprov.id
          } catch (_) {}
          try {
            const motCanc = $app.findFirstRecordByData(
              'motivos_perda',
              'descricao',
              'Cancelado no Bling',
            )
            if (motCanc) motivoCanceladoId = motCanc.id
          } catch (_) {}

          if (
            etapaPropostaId &&
            etapaNegociacaoId &&
            etapaFechadoId &&
            etapaEmAbertoBlingId &&
            etapaPerdidoId
          ) {
            $app
              .db()
              .newQuery(`
              INSERT INTO oportunidades (
                id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
                etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
                data_fechamento, observacoes, criado_em, atualizado_em, created, updated
              )
              SELECT
                substr(hex(randomblob(8)), 1, 15) as id,
                'bling' as origem,
                'bling_proposta' as tipo_origem,
                bp.bling_proposta_id,
                '' as bling_pedido_id,
                bp.cliente_id,
                COALESCE(bp.valor_total, 0) as valor,
                CASE
                  WHEN bp.status_normalizado = 'rascunho' THEN {:etapaProposta}
                  WHEN bp.status_normalizado = 'aguardando' THEN {:etapaNegociacao}
                  WHEN bp.status_normalizado = 'nao_aprovada' THEN {:etapaPerdido}
                END as etapa_id,
                CASE
                  WHEN bp.status_normalizado = 'nao_aprovada' THEN 'perdido'
                  ELSE 'aberto'
                END as status,
                CASE
                  WHEN bp.status_normalizado = 'nao_aprovada' AND {:motivoNaoAprovada} != '' THEN {:motivoNaoAprovada}
                  ELSE ''
                END as motivo_perda_id,
                CASE WHEN bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
                CASE WHEN bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10) ELSE '' END as data_origem,
                CASE WHEN bp.data_validade != '' THEN substr(bp.data_validade, 1, 10) ELSE '' END as data_prevista_fechamento,
                CASE
                  WHEN bp.status_normalizado = 'nao_aprovada' AND bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10)
                  ELSE ''
                END as data_fechamento,
                'Proposta Bling nº ' || COALESCE(bp.numero, bp.bling_proposta_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
              FROM bling_propostas bp
              WHERE bp.visivel_funil = 1
                AND bp.status_vinculo = 'vinculado'
                AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
                AND (bp.status_normalizado = 'rascunho' OR bp.status_normalizado = 'aguardando' OR bp.status_normalizado = 'nao_aprovada')
                AND bp.bling_proposta_id NOT IN (
                  SELECT o.bling_proposta_id FROM oportunidades o WHERE o.bling_proposta_id IS NOT NULL AND o.bling_proposta_id != ''
                )
            `)
              .bind({
                etapaProposta: etapaPropostaId,
                etapaNegociacao: etapaNegociacaoId,
                etapaPerdido: etapaPerdidoId,
                motivoNaoAprovada: motivoNaoAprovadaId || '',
              })
              .execute()

            $app
              .db()
              .newQuery(`
              INSERT INTO oportunidades (
                id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
                etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
                data_fechamento, observacoes, criado_em, atualizado_em, created, updated
              )
              SELECT
                substr(hex(randomblob(8)), 1, 15) as id,
                'bling' as origem,
                'bling_pedido' as tipo_origem,
                '' as bling_proposta_id,
                bp.bling_pedido_id,
                bp.cliente_id,
                COALESCE(bp.valor_total, 0) as valor,
                CASE
                  WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN {:etapaEmAberto}
                  WHEN bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9' THEN {:etapaFechado}
                  WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN {:etapaPerdido}
                END as etapa_id,
                CASE
                  WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN 'perdido'
                  ELSE 'ganho'
                END as status,
                CASE
                  WHEN (bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12') AND {:motivoCancelado} != '' THEN {:motivoCancelado}
                  ELSE ''
                END as motivo_perda_id,
                CASE WHEN bp.responsavel_id IS NOT NULL AND bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
                CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_origem,
                CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_prevista_fechamento,
                CASE
                  WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN ''
                  WHEN bp.situacao_bling_nome = 'Atendido' AND bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
                  WHEN bp.situacao_bling_nome = 'Cancelado' AND bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
                  WHEN bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
                  WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
                  ELSE ''
                END as data_fechamento,
                'Pedido Bling nº ' || COALESCE(bp.numero, bp.bling_pedido_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
                strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
              FROM bling_pedidos bp
              WHERE bp.status_vinculo = 'vinculado'
                AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
                AND (bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '6' OR bp.situacao_bling_id = '9' OR bp.situacao_bling_id = '12')
                AND bp.bling_pedido_id NOT IN (
                  SELECT o.bling_pedido_id FROM oportunidades o WHERE o.bling_pedido_id IS NOT NULL AND o.bling_pedido_id != ''
                )
            `)
              .bind({
                etapaEmAberto: etapaEmAbertoBlingId,
                etapaFechado: etapaFechadoId,
                etapaPerdido: etapaPerdidoId,
                motivoCancelado: motivoCanceladoId || '',
              })
              .execute()

            $app
              .db()
              .newQuery(`
              DELETE FROM oportunidades
              WHERE tipo_origem = 'bling_proposta'
                AND bling_proposta_id IN (
                  SELECT bp.bling_proposta_id FROM bling_propostas bp
                  WHERE bp.status_normalizado = 'convertida' OR bp.status_normalizado = 'outro' OR bp.visivel_funil = 0
                )
            `)
              .execute()
          }
        } catch (errMat) {
          avisosGerais.push('Aviso na materialização do funil: ' + String(errMat.message || errMat))
        }

        const duracaoMs = Date.now() - t0
        const finalizadoEm = new Date()

        const resumoTexto =
          'Sincronização concluída com sucesso via OAuth v3. ' +
          'Clientes: ' +
          totalClientesLidos +
          ' lidos, ' +
          totalClientesCriados +
          ' criados, ' +
          totalClientesAtualizados +
          ' atualizados. ' +
          'Pedidos: ' +
          totalPedidosLidos +
          ' lidos, ' +
          totalPedidosPersistidos +
          ' novos, ' +
          totalPedidosAtualizados +
          ' atualizados. ' +
          'Propostas: ' +
          totalPropostasLidas +
          ' lidas, ' +
          totalPropostasPersistidas +
          ' novas, ' +
          totalPropostasAtualizadas +
          ' atualizadas.'

        if (logRecord) {
          try {
            logRecord.set('status', 'sucesso')
            logRecord.set('finalizado_em', finalizadoEm.toISOString())
            logRecord.set('duracao_ms', duracaoMs)
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
            logRecord.set('propostas_lidas', totalPropostasLidas)
            logRecord.set('propostas_persistidas', totalPropostasPersistidas)
            logRecord.set('propostas_atualizadas', totalPropostasAtualizadas)
            logRecord.set('propostas_duplicadas', totalPropostasDuplicadas)
            logRecord.set('propostas_sem_cliente', totalPropostasSemCliente)
            logRecord.set('paginas_propostas_lidas', paginasPropostasLidas)
            logRecord.set('erros', errosGerais.concat(errosPedidos).concat(errosPropostas))
            logRecord.set('avisos', avisosGerais)
            logRecord.set('mensagem_resumo', resumoTexto)
            $app.save(logRecord)
          } catch (eSave) {
            console.error('[BLING-RUNNER] Erro ao salvar log de sucesso:', eSave)
          }
        }

        console.log('[BLING-RUNNER] Execução finalizada com sucesso:', resumoTexto)
      } catch (errMotor) {
        const duracaoMs = Date.now() - t0
        const msgErro = String((errMotor && errMotor.message) || errMotor)
        if (logRecord) {
          try {
            logRecord.set('status', 'erro')
            logRecord.set('finalizado_em', new Date().toISOString())
            logRecord.set('duracao_ms', duracaoMs)
            logRecord.set('mensagem_resumo', 'Falha na sincronização: ' + msgErro)
            logRecord.set('erros', [msgErro])
            $app.save(logRecord)
          } catch (_) {}
        }
        console.error('[BLING-RUNNER] Erro crítico na execução:', msgErro)
      }
    }

    executarMotorSincronizacaoBlingInline(logIdParaExecutar)
  } catch (errWorker) {
    console.error('[BLING-RUNNER] Falha durante execução do worker:', errWorker)
  }
})

// ============================================================================
// ROTA MANUAL: POST /backend/v1/bling/sincronizar (RESPOSTA IMEDIATA EM ~2s)
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

    const usuarioIdOuSistema = authRecord.id
    const agoraMs = Date.now()
    const limiteLockIso = new Date(agoraMs - 10 * 60 * 1000).toISOString()

    // 1. Limpar logs 'processando' pendentes/expirados (> 10 min) para destravar o motor
    try {
      const logsExpirados = $app.findRecordsByFilter(
        'bling_sync_logs',
        `status = 'processando' && iniciado_em < '${limiteLockIso}'`,
        '-created',
        50,
        0,
      )
      for (let le = 0; le < logsExpirados.length; le++) {
        const lExp = logsExpirados[le]
        lExp.set('status', 'erro')
        lExp.set('mensagem_resumo', 'Sincronização anterior interrompida ou expirou sem finalizar.')
        lExp.set('finalizado_em', new Date().toISOString())
        $app.save(lExp)
      }
    } catch (_) {}

    // 2. Lock anti-concorrência ativo: se já houver sync processando nos últimos 10 min, responder 409
    const syncsEmAndamento = $app.findRecordsByFilter(
      'bling_sync_logs',
      `status = 'processando' && iniciado_em >= '${limiteLockIso}'`,
      '-created',
      1,
      0,
    )

    if (syncsEmAndamento && syncsEmAndamento.length > 0) {
      return e.json(409, {
        success: false,
        status: 'processando',
        log_id: syncsEmAndamento[0].id,
        message:
          'Já existe uma sincronização em processamento no momento. Aguarde o término antes de disparar outra.',
      })
    }

    // 3. Validar se o Bling está conectado no banco
    let connValida = null
    try {
      const conns = $app.findRecordsByFilter(
        'bling_connections',
        "status = 'conectado'",
        '-created',
        1,
        0,
      )
      if (conns && conns.length > 0 && conns[0].getString('access_token')) {
        connValida = conns[0]
      }
    } catch (_) {}

    if (!connValida) {
      return e.json(400, {
        success: false,
        message: 'Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar.',
      })
    }

    // 4. Criar registro de log na coleção com status 'processando'
    const iniciadoEm = new Date()
    let logRecord = null
    try {
      const syncLogCol = $app.findCollectionByNameOrId('bling_sync_logs')
      logRecord = new Record(syncLogCol)
      logRecord.set('iniciado_em', iniciadoEm.toISOString())
      if (usuarioIdOuSistema && usuarioIdOuSistema !== 'sistema_cron') {
        logRecord.set('usuario', usuarioIdOuSistema)
      }
      logRecord.set('status', 'processando')
      logRecord.set('clientes_lidos', 0)
      logRecord.set('clientes_criados', 0)
      logRecord.set('clientes_atualizados', 0)
      logRecord.set('clientes_ignorados', 0)
      logRecord.set('pedidos_lidos', 0)
      logRecord.set('pedidos_persistidos', 0)
      logRecord.set('pedidos_atualizados', 0)
      logRecord.set('pedidos_duplicados', 0)
      logRecord.set('pedidos_sem_cliente', 0)
      logRecord.set('paginas_pedidos_lidas', 0)
      logRecord.set('propostas_lidas', 0)
      logRecord.set('propostas_persistidas', 0)
      logRecord.set('propostas_atualizadas', 0)
      logRecord.set('propostas_duplicadas', 0)
      logRecord.set('propostas_sem_cliente', 0)
      logRecord.set('paginas_propostas_lidas', 0)
      logRecord.set('erros', [])
      logRecord.set('avisos', [])
      logRecord.set('duracao_ms', 0)
      logRecord.set(
        'mensagem_resumo',
        'Sincronização iniciada em segundo plano via OAuth seguro...',
      )
      $app.save(logRecord)
    } catch (errSaveLog) {
      console.error('[BLING-SYNC] Falha ao criar registro de log inicial:', errSaveLog)
      return e.json(500, {
        success: false,
        message:
          'Erro ao registrar histórico de sincronização: ' +
          String(errSaveLog.message || errSaveLog),
      })
    }

    // 5. Disparar execução em background via runner agendado (ou ad-hoc se disponível)
    try {
      if ($app.cron() && typeof $app.cron().run === 'function') {
        $app.cron().run('bling_sync_manual_runner')
      } else if ($app.cron() && typeof $app.cron().Run === 'function') {
        $app.cron().Run('bling_sync_manual_runner')
      }
    } catch (errTrigger) {
      console.warn('[BLING-SYNC] Aviso ao disparar runner ad-hoc imediatamente:', errTrigger)
    }

    // 6. Resposta HTTP imediata (~10ms) sem aguardar o término da sincronização
    return e.json(200, {
      success: true,
      status: 'processando',
      log_id: logRecord.id,
      iniciado_em: iniciadoEm.toISOString(),
      mensagem:
        'Sincronização iniciada com sucesso em segundo plano. Acompanhe o processamento em tempo real.',
    })
  },
  $apis.requireAuth(),
)

// ============================================================================
// 7. CRON AUTOMÁTICO DE 15 MINUTOS COM MOTOR INTEGRADO DE MATERIALIZAÇÃO
// ============================================================================
cronAdd('bling_sync_automatica', '*/15 * * * *', () => {
  try {
    const agoraMs = Date.now()
    const agoraIso = new Date(agoraMs).toISOString()
    const limiteLockIso = new Date(agoraMs - 10 * 60 * 1000).toISOString()

    // 1. Destravar APENAS logs "processando" realmente antigos/abandonados (inativos há > 15 min)
    // Logs concluídos com status 'sucesso' NUNCA são tocados aqui.
    try {
      const logsExpirados = $app.findRecordsByFilter(
        'bling_sync_logs',
        `status = 'processando' && ((atualizado_em != '' && atualizado_em < '${limiteLockIso}') || (atualizado_em = '' && iniciado_em < '${limiteLockIso}'))`,
        '-created',
        50,
        0,
      )
      for (let le = 0; le < logsExpirados.length; le++) {
        const lExp = logsExpirados[le]
        lExp.set('status', 'erro')
        lExp.set('mensagem_resumo', 'Sincronização anterior interrompida ou expirou sem finalizar.')
        lExp.set('finalizado_em', new Date().toISOString())
        $app.save(lExp)
      }
    } catch (_) {}

    // 2. Localizar estado retomável anterior para dar continuidade à cadeia
    let estadoAnterior = null
    try {
      const logsAnteriores = $app.findRecordsByFilter(
        'bling_sync_logs',
        "status = 'sucesso' && etapa_atual != ''",
        '-created',
        1,
        0,
      )
      if (logsAnteriores && logsAnteriores.length > 0) {
        estadoAnterior = logsAnteriores[0]
      }
    } catch (_) {}

    // Determinar etapa e página que a rodada atual deve executar
    let etapaParaExecutar = 'contatos'
    let paginaParaExecutar = 1

    if (estadoAnterior) {
      etapaParaExecutar = estadoAnterior.getString('etapa_atual') || 'contatos'
      paginaParaExecutar = estadoAnterior.getInt('pagina_atual') || 1
    }

    // Criar o log desta execução específica com status 'processando'
    let syncAlvo = null
    try {
      const syncLogCol = $app.findCollectionByNameOrId('bling_sync_logs')
      const novoLog = new Record(syncLogCol)
      novoLog.set('iniciado_em', agoraIso)
      novoLog.set('atualizado_em', agoraIso)
      novoLog.set('status', 'processando')
      novoLog.set('etapa_atual', etapaParaExecutar)
      novoLog.set('pagina_atual', paginaParaExecutar)
      novoLog.set('clientes_lidos', 0)
      novoLog.set('clientes_criados', 0)
      novoLog.set('clientes_atualizados', 0)
      novoLog.set('clientes_ignorados', 0)
      novoLog.set('pedidos_lidos', 0)
      novoLog.set('pedidos_persistidos', 0)
      novoLog.set('pedidos_atualizados', 0)
      novoLog.set('pedidos_duplicados', 0)
      novoLog.set('pedidos_sem_cliente', 0)
      novoLog.set('paginas_pedidos_lidas', 0)
      novoLog.set('propostas_lidas', 0)
      novoLog.set('propostas_persistidas', 0)
      novoLog.set('propostas_atualizadas', 0)
      novoLog.set('propostas_duplicadas', 0)
      novoLog.set('propostas_sem_cliente', 0)
      novoLog.set('paginas_propostas_lidas', 0)
      novoLog.set('erros', [])
      novoLog.set('avisos', [])
      novoLog.set('duracao_ms', 0)
      novoLog.set(
        'mensagem_resumo',
        'Executando ' + etapaParaExecutar + ' (página ' + paginaParaExecutar + ')...',
      )
      $app.save(novoLog)
      syncAlvo = novoLog
      console.log(
        '[BLING-CRON] Nova execução curta iniciada. ID:',
        novoLog.id,
        'Etapa:',
        etapaParaExecutar,
        'Página:',
        paginaParaExecutar,
      )
    } catch (errNovoLog) {
      console.warn('[BLING-CRON] Erro ao criar log de nova sincronização automática:', errNovoLog)
    }

    // 3. Processar exatamente UMA página de contatos se a etapa for 'contatos' (Tarefa 2B)
    if (syncAlvo && syncAlvo.getString('status') === 'processando') {
      const etapaAtual = syncAlvo.getString('etapa_atual') || 'contatos'
      const paginaAtual = syncAlvo.getInt('pagina_atual') || 1

      if (etapaAtual === 'contatos') {
        console.log(
          '[BLING-CRON] Executando página ' +
            paginaAtual +
            ' de contatos (log ID: ' +
            syncAlvo.id +
            ').',
        )

        // Helper local para base64
        function cronEncodeBase64(str) {
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

        // Helper local para refresh OAuth
        function cronExecutarRefreshOAuth(conn) {
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

            const b64 = cronEncodeBase64(cId + ':' + cSec)
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

        // Helper local para obter token de acesso válido
        function cronGetValidBlingAccessToken() {
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
                const margem = 5 * 60 * 1000

                if (expiraEm > agora + margem) {
                  return { token: accessToken, conn: conn }
                }

                const tokenRenovado = cronExecutarRefreshOAuth(conn)
                if (tokenRenovado) {
                  return { token: tokenRenovado, conn: conn }
                }
              }
            }
          } catch (_) {}
          return { token: '', conn: null }
        }

        function cronPausarMs(ms) {
          if (!ms || ms <= 0) return
          const tAlvo = Date.now() + ms
          while (Date.now() < tAlvo) {}
        }

        let cronUltimoMomentoChamada = 0
        function cronThrottleChamadaBling(intervaloMinMs) {
          const minIntervalo = intervaloMinMs || 380
          const agora = Date.now()
          const decorrido = agora - cronUltimoMomentoChamada
          if (decorrido < minIntervalo) {
            cronPausarMs(minIntervalo - decorrido)
          }
          cronUltimoMomentoChamada = Date.now()
        }

        function cronNormalizarDoc(doc) {
          if (!doc) return ''
          return String(doc).replace(/[^\w]/g, '').trim().toLowerCase()
        }

        function cronNormalizarEm(em) {
          if (!em) return ''
          return String(em).trim().toLowerCase()
        }

        function cronIsConsumidorFinalNome(nome) {
          if (!nome) return false
          const n = String(nome).trim().toLowerCase()
          return n === 'consumidor final' || n === 'consumidor final.'
        }

        function cronMapearVendedor(vendedorBling) {
          if (!vendedorBling) return null
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
            v === 'MARIA CAROLINE' ||
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
          return null
        }

        const cronMapVendedorParaUsuarioId = {}
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
              cronMapVendedorParaUsuarioId['Alice'] = uId
            } else if (uNome.indexOf('Renan') !== -1 || uEmail.indexOf('renan') !== -1) {
              cronMapVendedorParaUsuarioId['Renan'] = uId
            } else if (
              uPerfil === 'vendedor_1' ||
              uNome.indexOf('Vendas 1') !== -1 ||
              uNome.indexOf('Karoline') !== -1
            ) {
              cronMapVendedorParaUsuarioId['Karoline (Vendas 1)'] = uId
            } else if (uPerfil === 'vendedor_2' || uNome.indexOf('Vendas 2') !== -1) {
              cronMapVendedorParaUsuarioId['Vendas 2'] = uId
            }
          }
        } catch (_) {}

        function cronResolverUsuarioIdPorVendedorCrm(vendedorCrm) {
          if (!vendedorCrm) return null
          return cronMapVendedorParaUsuarioId[vendedorCrm] || null
        }

        const tokenInfo = cronGetValidBlingAccessToken()
        let currentAccessToken = tokenInfo.token
        const connectionRecord = tokenInfo.conn

        if (!currentAccessToken) {
          syncAlvo.set('status', 'erro')
          syncAlvo.set('finalizado_em', new Date().toISOString())
          syncAlvo.set('atualizado_em', new Date().toISOString())
          syncAlvo.set('mensagem_resumo', 'Token OAuth do Bling inválido ou desconectado.')
          let errosList = []
          try {
            errosList = JSON.parse(syncAlvo.getString('erros')) || []
          } catch (_) {
            errosList = []
          }
          errosList.push('Conecte o CRM ao Bling via OAuth em /bling antes de sincronizar.')
          syncAlvo.set('erros', errosList)
          $app.save(syncAlvo)
          return
        }

        // Executar chamada GET com throttle, backoff e refresh em 401
        let refreshFeito401 = false
        function cronGetBling(url, maxTentativas) {
          let tentativas = 0
          const limite = maxTentativas || 4
          let ultimoResultado = null
          let ultimoErro = null

          while (tentativas < limite) {
            tentativas++
            cronThrottleChamadaBling(380)

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

              if (res.statusCode === 401 && !refreshFeito401 && connectionRecord) {
                refreshFeito401 = true
                const novoToken = cronExecutarRefreshOAuth(connectionRecord)
                if (novoToken) {
                  currentAccessToken = novoToken
                  cronThrottleChamadaBling(380)
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

              if (res.statusCode === 429 && tentativas < limite) {
                const esperaMs = 1200 * tentativas
                cronPausarMs(esperaMs)
                continue
              }

              if (res.statusCode >= 500 && tentativas < limite) {
                const esperaMs = 1000 * tentativas
                cronPausarMs(esperaMs)
                continue
              }

              return res
            } catch (httpErr) {
              ultimoErro = httpErr
              if (tentativas < limite) {
                const esperaMs = 800 * tentativas
                cronPausarMs(esperaMs)
                continue
              }
            }
          }

          if (ultimoResultado) return ultimoResultado
          throw new Error(
            'Falha definitiva de rede após ' +
              limite +
              ' tentativas: ' +
              String((ultimoErro && ultimoErro.message) || ultimoErro || 'Erro desconhecido'),
          )
        }

        const urlContatos =
          'https://api.bling.com.br/Api/v3/contatos?pagina=' +
          paginaAtual +
          '&limite=100&criterio=1'

        let resContatos = null
        let falhaChamada = null
        try {
          resContatos = cronGetBling(urlContatos, 4)
        } catch (errChamada) {
          falhaChamada = errChamada
        }

        // Se a API retornar 404 ou 204 quando não houver mais registros, tratar como fim de contatos
        const statusCodeContatos = resContatos ? resContatos.statusCode : 0
        const isFimContatosHttp = statusCodeContatos === 404 || statusCodeContatos === 204

        if (
          !isFimContatosHttp &&
          (falhaChamada || !resContatos || statusCodeContatos < 200 || statusCodeContatos >= 300)
        ) {
          const msgErro = falhaChamada
            ? String(falhaChamada.message || falhaChamada)
            : 'HTTP ' + statusCodeContatos + ' na página ' + paginaAtual + ' de contatos.'

          console.error('[BLING-CRON] Falha na página ' + paginaAtual + ' de contatos:', msgErro)

          let errosList = []
          try {
            errosList = JSON.parse(syncAlvo.getString('erros')) || []
          } catch (_) {
            errosList = []
          }
          errosList.push(msgErro)
          syncAlvo.set('erros', errosList)
          syncAlvo.set('status', 'erro')
          syncAlvo.set('finalizado_em', new Date().toISOString())
          syncAlvo.set('atualizado_em', new Date().toISOString())
          syncAlvo.set(
            'mensagem_resumo',
            'Erro ao processar página ' + paginaAtual + ' de contatos: ' + msgErro,
          )
          $app.save(syncAlvo)
          return
        }

        // Processar contatos retornados
        const cJson = (resContatos && resContatos.json) || {}
        const contatosArr = isFimContatosHttp ? [] : cJson.data || []

        // 1. DETECÇÃO DE FIM DOS CONTATOS: página vazia
        if (isFimContatosHttp || contatosArr.length === 0) {
          const agoraFinal = new Date().toISOString()
          syncAlvo.set('etapa_atual', 'pedidos')
          syncAlvo.set('pagina_atual', 1)
          syncAlvo.set('status', 'sucesso')
          syncAlvo.set('atualizado_em', agoraFinal)
          syncAlvo.set('finalizado_em', agoraFinal)
          syncAlvo.set('duracao_ms', Date.now() - agoraMs)
          syncAlvo.set(
            'mensagem_resumo',
            'Etapa contatos finalizada com sucesso. Próxima etapa: pedidos (página 1).',
          )
          $app.save(syncAlvo)

          console.log(
            '[BLING-CRON] Fim dos contatos detectado na página ' +
              paginaAtual +
              '. Transição para pedidos página 1 concluída com sucesso.',
          )
          // ENCERRAR A EXECUÇÃO — NÃO processar pedidos nesta rodada
          return
        }

        // Mapear clientes já existentes para deduplicação / upsert rápido
        const clientesExistentes = $app.findRecordsByFilter('clientes', '', '-created', 5000, 0)
        const mapPorBlingId = {}
        const mapPorDoc = {}
        const mapPorEmail = {}

        for (let i = 0; i < clientesExistentes.length; i++) {
          const c = clientesExistentes[i]
          const bId = c.getString('bling_id')
          const doc = cronNormalizarDoc(c.getString('cnpj_cpf'))
          const em = cronNormalizarEm(c.getString('email'))

          if (bId) mapPorBlingId[bId] = c
          if (doc) mapPorDoc[doc] = c
          if (em) mapPorEmail[em] = c
        }

        let lidosNaPagina = 0
        let criadosNaPagina = 0
        let atualizadosNaPagina = 0
        let ignoradosNaPagina = 0

        for (let ci = 0; ci < contatosArr.length; ci++) {
          lidosNaPagina++
          const item = contatosArr[ci]
          const blingId = String(item.id || '')
          const nomeContato = String(item.nome || '').trim()

          if (cronIsConsumidorFinalNome(nomeContato)) {
            ignoradosNaPagina++
            continue
          }

          const docRaw = item.numeroDocumento || ''
          const docNorm = cronNormalizarDoc(docRaw)
          const emailNorm = cronNormalizarEm(item.email || '')
          const fone = String(item.telefone || item.celular || '').trim()
          const tipoPessoa = item.tipo === 'J' ? 'PJ' : 'PF'

          let cRecord = null
          if (blingId && mapPorBlingId[blingId]) {
            cRecord = mapPorBlingId[blingId]
          } else if (docNorm && mapPorDoc[docNorm]) {
            cRecord = mapPorDoc[docNorm]
          } else if (emailNorm && mapPorEmail[emailNorm]) {
            cRecord = mapPorEmail[emailNorm]
          }

          const vendBling = item.vendedor ? item.vendedor.nome : ''
          const vendCrm = cronMapearVendedor(vendBling)
          const usuarioIdAtribuido = cronResolverUsuarioIdPorVendedorCrm(vendCrm)

          if (cRecord) {
            let alterou = false
            if (!cRecord.getString('bling_id') && blingId) {
              cRecord.set('bling_id', blingId)
              alterou = true
            }
            if (!cRecord.getString('cnpj_cpf') && docRaw) {
              cRecord.set('cnpj_cpf', docRaw)
              alterou = true
            }
            if (!cRecord.getString('email') && emailNorm) {
              cRecord.set('email', emailNorm)
              alterou = true
            }
            if (!cRecord.getString('telefone') && fone) {
              cRecord.set('telefone', fone)
              alterou = true
            }
            if (alterou) {
              try {
                $app.save(cRecord)
                atualizadosNaPagina++
                if (blingId) mapPorBlingId[blingId] = cRecord
                if (docNorm) mapPorDoc[docNorm] = cRecord
                if (emailNorm) mapPorEmail[emailNorm] = cRecord
              } catch (eUp) {
                console.warn('[BLING-CRON] Aviso ao atualizar cliente:', eUp)
              }
            }
          } else {
            try {
              const clientesCol = $app.findCollectionByNameOrId('clientes')
              const novoC = new Record(clientesCol)
              novoC.set('nome_empresa', nomeContato || 'Cliente Bling #' + blingId)
              novoC.set('nome_contato', nomeContato || '')
              novoC.set('cnpj_cpf', docRaw)
              novoC.set('email', emailNorm)
              novoC.set('telefone', fone)
              novoC.set('tipo_contato', tipoPessoa === 'PJ' ? 'cliente' : 'cliente')
              novoC.set('status_cliente', 'ativo')
              novoC.set('bling_id', blingId)
              if (vendCrm) novoC.set('vendedor', vendCrm)
              if (usuarioIdAtribuido) novoC.set('responsavel_id', usuarioIdAtribuido)

              $app.save(novoC)
              criadosNaPagina++
              if (blingId) mapPorBlingId[blingId] = novoC
              if (docNorm) mapPorDoc[docNorm] = novoC
              if (emailNorm) mapPorEmail[emailNorm] = novoC
            } catch (eCriar) {
              console.warn('[BLING-CRON] Aviso ao criar cliente:', eCriar)
            }
          }
        }

        // Atualizar estado e contadores no log desta rodada
        // Se a página retornou menos itens que o limite (ex: 74 < 100), esta foi a última página com dados.
        // A próxima execução já receberá etapa_atual = 'pedidos' e pagina_atual = 1.
        const temProximaPagina = contatosArr.length >= 100
        const proximaEtapa = temProximaPagina ? 'contatos' : 'pedidos'
        const proximaPagina = temProximaPagina ? paginaAtual + 1 : 1

        const agoraConclusao = new Date().toISOString()
        syncAlvo.set('clientes_lidos', lidosNaPagina)
        syncAlvo.set('clientes_criados', criadosNaPagina)
        syncAlvo.set('clientes_atualizados', atualizadosNaPagina)
        syncAlvo.set('clientes_ignorados', ignoradosNaPagina)
        syncAlvo.set('etapa_atual', proximaEtapa)
        syncAlvo.set('pagina_atual', proximaPagina)
        syncAlvo.set('status', 'sucesso')
        syncAlvo.set('atualizado_em', agoraConclusao)
        syncAlvo.set('finalizado_em', agoraConclusao)
        syncAlvo.set('duracao_ms', Date.now() - agoraMs)

        let msgResumo =
          'Página ' +
          paginaAtual +
          ' de contatos processada com sucesso (' +
          lidosNaPagina +
          ' lidos, ' +
          criadosNaPagina +
          ' criados, ' +
          atualizadosNaPagina +
          ' atualizados).'
        if (temProximaPagina) {
          msgResumo += ' Próxima página: ' + proximaPagina + '.'
        } else {
          msgResumo += ' Última página de contatos atingida. Próxima etapa: pedidos (página 1).'
        }
        syncAlvo.set('mensagem_resumo', msgResumo)
        $app.save(syncAlvo)

        console.log(
          '[BLING-CRON] Página ' +
            paginaAtual +
            ' de contatos concluída com sucesso. Próxima etapa: ' +
            proximaEtapa +
            ' (página ' +
            proximaPagina +
            '). Total na rodada: ' +
            lidosNaPagina +
            ' lidos, ' +
            criadosNaPagina +
            ' criados, ' +
            atualizadosNaPagina +
            ' atualizados.',
        )
      }
    }

    // Motor de materialização de oportunidades executado também a cada rodada de 15 minutos
    // Garante sincronismo idempotente contínuo mesmo sem clique manual em /bling
    const etapasList = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 20, 0)
    let etapaPropostaId = ''
    let etapaNegociacaoId = ''
    let etapaEmAbertoBlingId = ''
    let etapaFechadoId = ''
    let etapaPerdidoId = ''

    for (let ep = 0; ep < etapasList.length; ep++) {
      const epRec = etapasList[ep]
      const epNome = epRec.getString('nome').toLowerCase()
      if (epNome.indexOf('propost') !== -1) etapaPropostaId = epRec.id
      if (epNome.indexOf('negoc') !== -1) etapaNegociacaoId = epRec.id
      if (epNome.indexOf('em aberto') !== -1) etapaEmAbertoBlingId = epRec.id
      if (epNome === 'fechado') etapaFechadoId = epRec.id
      if (epNome === 'perdido') etapaPerdidoId = epRec.id
    }

    let motivoNaoAprovadaId = ''
    let motivoCanceladoId = ''
    try {
      const motNaoAprov = $app.findFirstRecordByData(
        'motivos_perda',
        'descricao',
        'Não aprovada no Bling',
      )
      if (motNaoAprov) motivoNaoAprovadaId = motNaoAprov.id
    } catch (_) {}
    try {
      const motCanc = $app.findFirstRecordByData('motivos_perda', 'descricao', 'Cancelado no Bling')
      if (motCanc) motivoCanceladoId = motCanc.id
    } catch (_) {}

    if (
      etapaPropostaId &&
      etapaNegociacaoId &&
      etapaFechadoId &&
      etapaEmAbertoBlingId &&
      etapaPerdidoId
    ) {
      // 1. Inserir propostas elegíveis faltantes
      $app
        .db()
        .newQuery(`
        INSERT INTO oportunidades (
          id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
          etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
          data_fechamento, observacoes, criado_em, atualizado_em, created, updated
        )
        SELECT
          substr(hex(randomblob(8)), 1, 15) as id,
          'bling' as origem,
          'bling_proposta' as tipo_origem,
          bp.bling_proposta_id,
          '' as bling_pedido_id,
          bp.cliente_id,
          COALESCE(bp.valor_total, 0) as valor,
          CASE
            WHEN bp.status_normalizado = 'rascunho' THEN {:etapaProposta}
            WHEN bp.status_normalizado = 'aguardando' THEN {:etapaNegociacao}
            WHEN bp.status_normalizado = 'nao_aprovada' THEN {:etapaPerdido}
          END as etapa_id,
          CASE
            WHEN bp.status_normalizado = 'nao_aprovada' THEN 'perdido'
            ELSE 'aberto'
          END as status,
          CASE
            WHEN bp.status_normalizado = 'nao_aprovada' AND {:motivoNaoAprovada} != '' THEN {:motivoNaoAprovada}
            ELSE ''
          END as motivo_perda_id,
          CASE WHEN bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
          CASE WHEN bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10) ELSE '' END as data_origem,
          CASE WHEN bp.data_validade != '' THEN substr(bp.data_validade, 1, 10) ELSE '' END as data_prevista_fechamento,
          CASE
            WHEN bp.status_normalizado = 'nao_aprovada' AND bp.data_proposta != '' THEN substr(bp.data_proposta, 1, 10)
            ELSE ''
          END as data_fechamento,
          'Proposta Bling nº ' || COALESCE(bp.numero, bp.bling_proposta_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
        FROM bling_propostas bp
        WHERE bp.visivel_funil = 1
          AND bp.status_vinculo = 'vinculado'
          AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
          AND (bp.status_normalizado = 'rascunho' OR bp.status_normalizado = 'aguardando' OR bp.status_normalizado = 'nao_aprovada')
          AND bp.bling_proposta_id NOT IN (
            SELECT o.bling_proposta_id FROM oportunidades o WHERE o.bling_proposta_id IS NOT NULL AND o.bling_proposta_id != ''
          )
      `)
        .bind({
          etapaProposta: etapaPropostaId,
          etapaNegociacao: etapaNegociacaoId,
          etapaPerdido: etapaPerdidoId,
          motivoNaoAprovada: motivoNaoAprovadaId || '',
        })
        .execute()

      // 2. Inserir pedidos elegíveis faltantes
      $app
        .db()
        .newQuery(`
        INSERT INTO oportunidades (
          id, origem, tipo_origem, bling_proposta_id, bling_pedido_id, cliente_id, valor,
          etapa_id, status, motivo_perda_id, responsavel_id, data_origem, data_prevista_fechamento,
          data_fechamento, observacoes, criado_em, atualizado_em, created, updated
        )
        SELECT
          substr(hex(randomblob(8)), 1, 15) as id,
          'bling' as origem,
          'bling_pedido' as tipo_origem,
          '' as bling_proposta_id,
          bp.bling_pedido_id,
          bp.cliente_id,
          COALESCE(bp.valor_total, 0) as valor,
          CASE
            WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN {:etapaEmAberto}
            WHEN bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9' THEN {:etapaFechado}
            WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN {:etapaPerdido}
          END as etapa_id,
          CASE
            WHEN bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12' THEN 'perdido'
            ELSE 'ganho'
          END as status,
          CASE
            WHEN (bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12') AND {:motivoCancelado} != '' THEN {:motivoCancelado}
            ELSE ''
          END as motivo_perda_id,
          CASE WHEN bp.responsavel_id IS NOT NULL AND bp.responsavel_id != '' THEN bp.responsavel_id ELSE '' END as responsavel_id,
          CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_origem,
          CASE WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10) ELSE '' END as data_prevista_fechamento,
          CASE
            WHEN bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6' THEN ''
            WHEN bp.situacao_bling_nome = 'Atendido' AND bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
            WHEN bp.situacao_bling_nome = 'Cancelado' AND bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
            WHEN bp.data_atendimento != '' THEN substr(bp.data_atendimento, 1, 10)
            WHEN bp.data_pedido != '' THEN substr(bp.data_pedido, 1, 10)
            ELSE ''
          END as data_fechamento,
          'Pedido Bling nº ' || COALESCE(bp.numero, bp.bling_pedido_id) || ' (' || COALESCE(bp.situacao_bling_nome, '') || ')' as observacoes,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as criado_em,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as atualizado_em,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as created,
          strftime('%Y-%m-%d %H:%M:%f', 'now') as updated
        FROM bling_pedidos bp
        WHERE bp.status_vinculo = 'vinculado'
          AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
          AND (bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '6' OR bp.situacao_bling_id = '9' OR bp.situacao_bling_id = '12')
          AND bp.bling_pedido_id NOT IN (
            SELECT o.bling_pedido_id FROM oportunidades o WHERE o.bling_pedido_id IS NOT NULL AND o.bling_pedido_id != ''
          )
      `)
        .bind({
          etapaEmAberto: etapaEmAbertoBlingId,
          etapaFechado: etapaFechadoId,
          etapaPerdido: etapaPerdidoId,
          motivoCancelado: motivoCanceladoId || '',
        })
        .execute()

      // 3. Inativar propostas que passaram para convertida ou concluído
      $app
        .db()
        .newQuery(`
        DELETE FROM oportunidades
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado = 'convertida' OR bp.status_normalizado = 'outro' OR bp.visivel_funil = 0
          )
      `)
        .execute()
    }
  } catch (errCron) {
    console.error(
      '[BLING-CRON] Erro ao sincronizar funil:',
      errCron && errCron.message ? errCron.message : errCron,
    )
  }
})
