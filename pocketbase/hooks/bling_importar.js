/**
 * Rota proxy: POST /backend/v1/bling/importar
 * Lê o bling_token exclusivamente do backend (integracoes_config) ou de secrets.
 * O frontend NUNCA envia nem vê a chave da API do Bling.
 *
 * Suporta:
 * - tipo: 'contatos' (clientes) | 'pedidos' (vendas/oportunidades)
 * - pagina (default 1)
 *
 * Retorna dados normalizados de contatos ou pedidos para importação no CRM.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

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

    // 1. Obter bling_token salvo no banco
    let blingToken = ''
    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        blingToken = records[0].getString('bling_token')
      }
    } catch (_) {}

    if (!blingToken) {
      // Fallback para secrets de ambiente se houver
      try {
        blingToken = $secrets.get('BLING_TOKEN') || $secrets.get('BLING_API_KEY') || ''
      } catch (_) {}
    }

    if (!blingToken) {
      return e.json(400, {
        success: false,
        message:
          'Token de API do Bling não configurado no backend. Configure em Configurações → Integrações.',
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

      // Se API externa rejeitou ou retornou erro
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
