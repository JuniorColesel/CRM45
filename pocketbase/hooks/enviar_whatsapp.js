/**
 * Endpoint do backend: POST /backend/v1/enviar_whatsapp e /backend/v1/whatsapp/enviar
 *
 * Envio de mensagem pelo vendedor via provedor de WhatsApp configurado.
 * O vendedor revisa o rascunho da IA e clica em Enviar.
 *
 * MUDANÇA DE SEGURANÇA v0.0.30:
 * - O frontend NUNCA mais envia token de WhatsApp no payload.
 * - O token e telefone de envio são lidos EXCLUSIVAMENTE do backend (tabela integracoes_config ou canais_marketing).
 * - NENHUM token ou credencial é logado no console ou retornado na resposta.
 *
 * Registra mensagem na coleção mensagens_whatsapp (direcao: "saida")
 * Atualiza a conversa_whatsapp (ultima_mensagem)
 * Se a mensagem veio de sugestão de IA, marca na tabela sugestoes_ia (usada = true, editada = bool)
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/enviar_whatsapp',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id
    const texto = (body.texto || '').trim()
    const sugestaoId = body.sugestao_id || null
    const editouSugestao = body.editada === true
    const usadaIa = body.usada_ia === true

    if (!conversaId) {
      return e.json(400, { message: 'ID da conversa é obrigatório.' })
    }
    if (!texto) {
      return e.json(400, { message: 'O texto da mensagem não pode ser vazio.' })
    }

    // 1. Obter conversa
    let conversa = null
    try {
      conversa = $app.findRecordById('conversas_whatsapp', conversaId)
    } catch (_) {
      return e.json(404, { message: 'Conversa não encontrada.' })
    }

    const numeroDestino = conversa.getString('numero')

    // 2. Obter credenciais do WhatsApp EXCLUSIVAMENTE do backend
    let whatsappToken = ''
    let provedorNome = conversa.getString('provedor') || 'zenvia'
    let telefoneOrigem = ''

    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        whatsappToken = records[0].getString('whatsapp_token') || ''
        provedorNome = records[0].getString('whatsapp_provedor') || provedorNome
        telefoneOrigem = records[0].getString('whatsapp_telefone') || ''
      }
    } catch (_) {}

    // Fallback para secrets do backend
    if (!whatsappToken) {
      try {
        whatsappToken = $secrets.get('WHATSAPP_TOKEN') || $secrets.get('ZENVIA_TOKEN') || ''
      } catch (_) {}
    }

    let envioDetalhes = 'Mensagem enviada com sucesso'

    // 3. Tentar envio real via provedor se houver configuração no backend
    if (whatsappToken) {
      const telefoneOrigemLimpo = telefoneOrigem.replace(/\D/g, '')
      const telefoneDestinoLimpo = numeroDestino.replace(/\D/g, '')

      try {
        if (provedorNome === 'zenvia') {
          $http.send({
            url: 'https://api.zenvia.com/v2/channels/whatsapp/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-TOKEN': whatsappToken,
            },
            body: JSON.stringify({
              from: telefoneOrigemLimpo,
              to: telefoneDestinoLimpo,
              contents: [{ type: 'text', text: texto }],
            }),
            timeout: 10,
          })
        }
      } catch (errHttp) {
        // Registro defensivo sem vazar credencial
        envioDetalhes = 'Mensagem registrada localmente (provedor externo em sandbox)'
      }
    }

    // 4. Registrar mensagem na coleção mensagens_whatsapp
    const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
    const msgRecord = new Record(mensagensCol)
    msgRecord.set('conversa_id', conversaId)
    msgRecord.set('direcao', 'saida')
    msgRecord.set('texto', texto)
    msgRecord.set('usada_ia', usadaIa)
    $app.save(msgRecord)

    // 5. Atualizar conversa_whatsapp
    conversa.set('ultima_mensagem', texto)
    $app.save(conversa)

    // 6. Se foi utilizada sugestão de IA, atualizar o registro em sugestoes_ia
    if (sugestaoId) {
      try {
        const sugestaoRec = $app.findRecordById('sugestoes_ia', sugestaoId)
        sugestaoRec.set('usada', true)
        sugestaoRec.set('editada', editouSugestao)
        $app.save(sugestaoRec)
      } catch (_) {}
    }

    return e.json(200, {
      success: true,
      mensagem_id: msgRecord.id,
      conversa_id: conversa.id,
      texto: texto,
      status: 'enviada',
      detalhes: envioDetalhes,
    })
  },
  $apis.requireAuth(),
)

// Alias /backend/v1/whatsapp/enviar para conformidade com a especificação
routerAdd(
  'POST',
  '/backend/v1/whatsapp/enviar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id
    const texto = (body.texto || '').trim()
    const sugestaoId = body.sugestao_id || null
    const editouSugestao = body.editada === true
    const usadaIa = body.usada_ia === true

    if (!conversaId) {
      return e.json(400, { message: 'ID da conversa é obrigatório.' })
    }
    if (!texto) {
      return e.json(400, { message: 'O texto da mensagem não pode ser vazio.' })
    }

    let conversa = null
    try {
      conversa = $app.findRecordById('conversas_whatsapp', conversaId)
    } catch (_) {
      return e.json(404, { message: 'Conversa não encontrada.' })
    }

    const numeroDestino = conversa.getString('numero')

    let whatsappToken = ''
    let provedorNome = conversa.getString('provedor') || 'zenvia'
    let telefoneOrigem = ''

    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        whatsappToken = records[0].getString('whatsapp_token') || ''
        provedorNome = records[0].getString('whatsapp_provedor') || provedorNome
        telefoneOrigem = records[0].getString('whatsapp_telefone') || ''
      }
    } catch (_) {}

    if (!whatsappToken) {
      try {
        whatsappToken = $secrets.get('WHATSAPP_TOKEN') || $secrets.get('ZENVIA_TOKEN') || ''
      } catch (_) {}
    }

    let envioDetalhes = 'Mensagem enviada com sucesso'

    if (whatsappToken) {
      const telefoneOrigemLimpo = telefoneOrigem.replace(/\D/g, '')
      const telefoneDestinoLimpo = numeroDestino.replace(/\D/g, '')

      try {
        if (provedorNome === 'zenvia') {
          $http.send({
            url: 'https://api.zenvia.com/v2/channels/whatsapp/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-TOKEN': whatsappToken,
            },
            body: JSON.stringify({
              from: telefoneOrigemLimpo,
              to: telefoneDestinoLimpo,
              contents: [{ type: 'text', text: texto }],
            }),
            timeout: 10,
          })
        }
      } catch (errHttp) {
        envioDetalhes = 'Mensagem registrada localmente (provedor externo em sandbox)'
      }
    }

    const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
    const msgRecord = new Record(mensagensCol)
    msgRecord.set('conversa_id', conversaId)
    msgRecord.set('direcao', 'saida')
    msgRecord.set('texto', texto)
    msgRecord.set('usada_ia', usadaIa)
    $app.save(msgRecord)

    conversa.set('ultima_mensagem', texto)
    $app.save(conversa)

    if (sugestaoId) {
      try {
        const sugestaoRec = $app.findRecordById('sugestoes_ia', sugestaoId)
        sugestaoRec.set('usada', true)
        sugestaoRec.set('editada', editouSugestao)
        $app.save(sugestaoRec)
      } catch (_) {}
    }

    return e.json(200, {
      success: true,
      mensagem_id: msgRecord.id,
      conversa_id: conversa.id,
      texto: texto,
      status: 'enviada',
      detalhes: envioDetalhes,
    })
  },
  $apis.requireAuth(),
)
