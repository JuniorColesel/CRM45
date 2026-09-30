/**
 * Rota POST /backend/v1/integracoes/config
 * Salva as configurações de integrações na coleção segura integracoes_config.
 * Apenas ceo_financeiro pode gravar credenciais.
 * NUNCA loga valores nem retorna credenciais na resposta.
 * Retorna os valores sensíveis devidamente mascarados.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/integracoes/config',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas administradores (CEO / Financeiro) podem salvar credenciais.',
      })
    }

    const body = e.requestInfo().body || {}

    function mascararValor(val) {
      if (!val) return ''
      const str = String(val).trim()
      if (str.length === 0) return ''
      if (str.length <= 8) return '••••••••'
      const prefixo = str.substring(0, 4)
      const sufixo = str.substring(str.length - 4)
      return prefixo + '••••••••' + sufixo
    }

    // Obter ou criar registro singleton de configuração
    let configRecord = null
    const col = $app.findCollectionByNameOrId('integracoes_config')
    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        configRecord = records[0]
      }
    } catch (_) {}

    if (!configRecord) {
      configRecord = new Record(col)
      // Defaults iniciais
      configRecord.set('ia_ativo', true)
      configRecord.set('ia_permitir_preco', true)
      configRecord.set('ia_tom_de_voz', 'profissional')
    }

    // Nota: O campo bling_token em integracoes_config foi descontinuado na v0.0.68.
    // O CRM Colesel 45 opera estritamente com OAuth v3 em /bling.
    // O campo permanece no schema para integridade, mas não é mais gravado via API operacional.

    // Seção WhatsApp
    if (body.whatsapp_token !== undefined) {
      const raw = String(body.whatsapp_token || '').trim()
      if (raw && !raw.includes('••••')) {
        configRecord.set('whatsapp_token', raw)
      } else if (raw === '') {
        configRecord.set('whatsapp_token', '')
      }
    }
    if (body.whatsapp_provedor !== undefined) {
      configRecord.set('whatsapp_provedor', String(body.whatsapp_provedor || 'zenvia').trim())
    }
    if (body.whatsapp_telefone !== undefined) {
      configRecord.set('whatsapp_telefone', String(body.whatsapp_telefone || '').trim())
    }

    // Seção SMTP / E-mail
    if (body.smtp_host !== undefined) {
      configRecord.set('smtp_host', String(body.smtp_host || '').trim())
    }
    if (body.smtp_port !== undefined) {
      configRecord.set('smtp_port', String(body.smtp_port || '587').trim())
    }
    if (body.smtp_user !== undefined) {
      configRecord.set('smtp_user', String(body.smtp_user || '').trim())
    }
    if (body.smtp_password !== undefined) {
      const raw = String(body.smtp_password || '').trim()
      if (raw && !raw.includes('••••')) {
        configRecord.set('smtp_password', raw)
      } else if (raw === '') {
        configRecord.set('smtp_password', '')
      }
    }
    if (body.gateway_sms !== undefined) {
      configRecord.set('gateway_sms', String(body.gateway_sms || 'zenvia').trim())
    }

    // Seção IA
    if (body.ia_api_key !== undefined) {
      const raw = String(body.ia_api_key || '').trim()
      if (raw && !raw.includes('••••')) {
        configRecord.set('ia_api_key', raw)
      } else if (raw === '') {
        configRecord.set('ia_api_key', '')
      }
    }
    if (body.ia_ativo !== undefined) {
      configRecord.set('ia_ativo', Boolean(body.ia_ativo))
    }
    if (body.ia_permitir_preco !== undefined) {
      configRecord.set('ia_permitir_preco', Boolean(body.ia_permitir_preco))
    }
    if (body.ia_tom_de_voz !== undefined) {
      configRecord.set('ia_tom_de_voz', String(body.ia_tom_de_voz || 'profissional').trim())
    }
    if (body.ia_prompt_sistema !== undefined) {
      configRecord.set('ia_prompt_sistema', String(body.ia_prompt_sistema || ''))
    }

    try {
      $app.save(configRecord)
    } catch (saveErr) {
      return e.json(500, { message: 'Erro ao persistir configurações de integração.' })
    }

    const curBling = configRecord.getString('bling_token')
    const curWhatsapp = configRecord.getString('whatsapp_token')
    const curSmtpPass = configRecord.getString('smtp_password')
    const curIaKey = configRecord.getString('ia_api_key')

    return e.json(200, {
      success: true,
      message: 'Configurações de integração salvas com segurança no servidor.',
      bling_token_mascarado: mascararValor(curBling),
      tem_bling_token: Boolean(curBling && curBling.trim().length > 0),
      whatsapp_token_mascarado: mascararValor(curWhatsapp),
      tem_whatsapp_token: Boolean(curWhatsapp && curWhatsapp.trim().length > 0),
      whatsapp_provedor: configRecord.getString('whatsapp_provedor'),
      whatsapp_telefone: configRecord.getString('whatsapp_telefone'),
      smtp_host: configRecord.getString('smtp_host'),
      smtp_port: configRecord.getString('smtp_port'),
      smtp_user: configRecord.getString('smtp_user'),
      smtp_password_mascarada: mascararValor(curSmtpPass),
      tem_smtp_password: Boolean(curSmtpPass && curSmtpPass.trim().length > 0),
      gateway_sms: configRecord.getString('gateway_sms'),
      ia_api_key_mascarada: mascararValor(curIaKey),
      tem_ia_api_key: Boolean(curIaKey && curIaKey.trim().length > 0),
      ia_ativo: configRecord.getBool('ia_ativo'),
      ia_permitir_preco: configRecord.getBool('ia_permitir_preco'),
      ia_tom_de_voz: configRecord.getString('ia_tom_de_voz'),
      ia_prompt_sistema: configRecord.getString('ia_prompt_sistema'),
    })
  },
  $apis.requireAuth(),
)
