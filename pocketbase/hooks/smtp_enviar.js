/**
 * Rota proxy: POST /backend/v1/smtp/enviar
 * Lê as credenciais SMTP (host, port, user, password) exclusivamente do backend (integracoes_config).
 * O frontend NUNCA vê a senha nem envia credenciais.
 *
 * Payload aceito:
 * - destinatario: email do destinatário (string, obrigatório)
 * - assunto: título do e-mail (string, obrigatório)
 * - corpo: mensagem em texto ou HTML (string, obrigatório)
 * - cliente_id: opcional (para vincular em mensagens_enviadas)
 * - automacao_id: opcional
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/smtp/enviar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const destinatario = (body.destinatario || body.para || '').trim()
    const assunto = (body.assunto || '').trim()
    const corpo = (body.corpo || body.mensagem || '').trim()
    const clienteId = body.cliente_id || null
    const automacaoId = body.automacao_id || null

    if (!destinatario) {
      return e.json(400, { success: false, message: 'O e-mail de destino é obrigatório.' })
    }
    if (!assunto) {
      return e.json(400, { success: false, message: 'O assunto do e-mail é obrigatório.' })
    }
    if (!corpo) {
      return e.json(400, { success: false, message: 'O corpo da mensagem é obrigatório.' })
    }

    // 1. Obter credenciais do backend
    let smtpHost = ''
    let smtpPort = '587'
    let smtpUser = ''
    let smtpPass = ''

    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        smtpHost = records[0].getString('smtp_host')
        smtpPort = records[0].getString('smtp_port') || '587'
        smtpUser = records[0].getString('smtp_user')
        smtpPass = records[0].getString('smtp_password')
      }
    } catch (_) {}

    // Fallback para secrets se não preenchido na tabela
    if (!smtpHost) {
      try {
        smtpHost = $secrets.get('SMTP_HOST') || ''
        smtpPort = $secrets.get('SMTP_PORT') || '587'
        smtpUser = $secrets.get('SMTP_USER') || ''
        smtpPass = $secrets.get('SMTP_PASS') || $secrets.get('SMTP_PASSWORD') || ''
      } catch (_) {}
    }

    const temConfig = Boolean(smtpHost && smtpUser)

    let envioSimulado = false
    let erroEnvio = ''

    if (!temConfig) {
      envioSimulado = true
    } else {
      // Disparo de e-mail via rotina interna do servidor PocketBase
      try {
        const mail = new MailerMessage({
          from: {
            address: smtpUser,
            name: 'CRM Colesel 45',
          },
          to: [{ address: destinatario }],
          subject: assunto,
          html:
            '<div style="font-family:sans-serif;line-height:1.6;">' +
            corpo.replace(/\n/g, '<br/>') +
            '</div>',
        })
        $app.newMailClient().send(mail)
      } catch (errMail) {
        // Se o mail client do PB não estiver configurado para SMTP externo neste momento
        erroEnvio = 'Falha ao despachar via SMTP do servidor.'
      }
    }

    // 2. Registrar na tabela mensagens_enviadas se cliente_id for informado
    let msgId = ''
    if (clienteId) {
      try {
        const msgCol = $app.findCollectionByNameOrId('mensagens_enviadas')
        const msgRec = new Record(msgCol)
        msgRec.set('canal', 'email')
        msgRec.set('cliente_id', clienteId)
        if (automacaoId) {
          msgRec.set('automacao_id', automacaoId)
        }
        msgRec.set('conteudo', assunto + '\n\n' + corpo)
        msgRec.set('status', erroEnvio ? 'falhou' : 'enviada')
        msgRec.set('data_envio', new Date().toISOString())
        if (erroEnvio) {
          msgRec.set('erro', 'Falha no servidor SMTP')
        }
        $app.save(msgRec)
        msgId = msgRec.id
      } catch (_) {}
    }

    if (erroEnvio) {
      return e.json(502, {
        success: false,
        message: 'Não foi possível enviar o e-mail via servidor SMTP.',
      })
    }

    return e.json(200, {
      success: true,
      mensagem_id: msgId,
      destinatario: destinatario,
      assunto: assunto,
      modo: envioSimulado ? 'simulado' : 'real',
      message: envioSimulado
        ? 'E-mail registrado (SMTP não configurado integralmente no backend).'
        : 'E-mail enviado com sucesso.',
    })
  },
  $apis.requireAuth(),
)
