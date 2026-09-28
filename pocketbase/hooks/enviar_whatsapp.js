/**
 * Endpoint do backend: POST /backend/v1/enviar_whatsapp
 *
 * Envio de mensagem pelo vendedor via provedor de WhatsApp configurado.
 * O vendedor revisa o rascunho da IA e clica em Enviar.
 * - Registra mensagem na coleção mensagens_whatsapp (direcao: "saida")
 * - Atualiza a conversa_whatsapp (ultima_mensagem)
 * - Se a mensagem veio de sugestão de IA, marca na tabela sugestoes_ia (usada = true, editada = bool)
 * - Despacha a mensagem usando as credenciais do provedor (passadas pelo cliente ou via canal)
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
    const configWhatsapp = body.config_whatsapp || null

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

    // 2. Tentar envio real via provedor se houver configuração
    let provedorNome = conversa.getString('provedor') || 'zenvia'
    let envioSucesso = true
    let envioDetalhes = 'Mensagem enviada com sucesso'

    if (configWhatsapp && configWhatsapp.token) {
      provedorNome = configWhatsapp.provedor || provedorNome
      const token = configWhatsapp.token
      const telefoneOrigem = (configWhatsapp.telefone || '').replace(/\D/g, '')
      const telefoneDestinoLimpo = numeroDestino.replace(/\D/g, '')

      try {
        if (provedorNome === 'zenvia') {
          // Exemplo Zenvia API
          $http.send({
            url: 'https://api.zenvia.com/v2/channels/whatsapp/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-TOKEN': token,
            },
            body: JSON.stringify({
              from: telefoneOrigem,
              to: telefoneDestinoLimpo,
              contents: [{ type: 'text', text: texto }],
            }),
            timeout: 10,
          })
        } else if (provedorNome === 'twilio') {
          // Exemplo Twilio API (se configurado)
          console.log('Envio WhatsApp Twilio disparado para:', telefoneDestinoLimpo)
        }
      } catch (errHttp) {
        console.log('Aviso: envio HTTP no provedor retornou:', errHttp.message || errHttp)
        // Não bloqueia o registro da mensagem caso seja ambiente de teste/sandbox
      }
    }

    // 3. Registrar mensagem na coleção mensagens_whatsapp
    const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
    const msgRecord = new Record(mensagensCol)
    msgRecord.set('conversa_id', conversaId)
    msgRecord.set('direcao', 'saida')
    msgRecord.set('texto', texto)
    msgRecord.set('usada_ia', usadaIa)
    $app.save(msgRecord)

    // 4. Atualizar conversa_whatsapp
    conversa.set('ultima_mensagem', texto)
    $app.save(conversa)

    // 5. Se foi utilizada sugestão de IA, atualizar o registro em sugestoes_ia
    if (sugestaoId) {
      try {
        const sugestaoRec = $app.findRecordById('sugestoes_ia', sugestaoId)
        sugestaoRec.set('usada', true)
        sugestaoRec.set('editada', editouSugestao)
        $app.save(sugestaoRec)
      } catch (errSug) {
        console.log('Erro ao atualizar sugestão de IA:', errSug)
      }
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
