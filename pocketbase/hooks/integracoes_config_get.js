/**
 * Rota GET /backend/v1/integracoes/config
 * Retorna as configurações de integrações com MÁSCARAS para campos sensíveis.
 * NUNCA retorna tokens ou senhas reais para o cliente.
 * Restrito aos administradores/gestores (ceo_financeiro e coordenador_vendas).
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'GET',
  '/backend/v1/integracoes/config',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro' && perfil !== 'coordenador_vendas') {
      return e.json(403, {
        message: 'Acesso negado. Apenas gestores podem visualizar configurações.',
      })
    }

    let configRecord = null
    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        configRecord = records[0]
      }
    } catch (_) {}

    function mascararValor(val) {
      if (!val) return ''
      const str = String(val).trim()
      if (str.length === 0) return ''
      if (str.length <= 8) return '••••••••'
      const prefixo = str.substring(0, 4)
      const sufixo = str.substring(str.length - 4)
      return prefixo + '••••••••' + sufixo
    }

    if (!configRecord) {
      return e.json(200, {
        bling_token_mascarado: '',
        tem_bling_token: false,
        whatsapp_token_mascarado: '',
        tem_whatsapp_token: false,
        whatsapp_provedor: 'zenvia',
        whatsapp_telefone: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_password_mascarada: '',
        tem_smtp_password: false,
        gateway_sms: 'zenvia',
        ia_api_key_mascarada: '',
        tem_ia_api_key: false,
        ia_ativo: true,
        ia_permitir_preco: true,
        ia_tom_de_voz: 'profissional',
        ia_prompt_sistema: '',
      })
    }

    const rawBling = configRecord.getString('bling_token')
    const rawWhatsapp = configRecord.getString('whatsapp_token')
    const rawSmtpPass = configRecord.getString('smtp_password')
    const rawIaKey = configRecord.getString('ia_api_key')

    return e.json(200, {
      bling_token_mascarado: mascararValor(rawBling),
      tem_bling_token: Boolean(rawBling && rawBling.trim().length > 0),
      whatsapp_token_mascarado: mascararValor(rawWhatsapp),
      tem_whatsapp_token: Boolean(rawWhatsapp && rawWhatsapp.trim().length > 0),
      whatsapp_provedor: configRecord.getString('whatsapp_provedor') || 'zenvia',
      whatsapp_telefone: configRecord.getString('whatsapp_telefone') || '',
      smtp_host: configRecord.getString('smtp_host') || '',
      smtp_port: configRecord.getString('smtp_port') || '587',
      smtp_user: configRecord.getString('smtp_user') || '',
      smtp_password_mascarada: mascararValor(rawSmtpPass),
      tem_smtp_password: Boolean(rawSmtpPass && rawSmtpPass.trim().length > 0),
      gateway_sms: configRecord.getString('gateway_sms') || 'zenvia',
      ia_api_key_mascarada: mascararValor(rawIaKey),
      tem_ia_api_key: Boolean(rawIaKey && rawIaKey.trim().length > 0),
      ia_ativo: configRecord.getBool('ia_ativo'),
      ia_permitir_preco: configRecord.getBool('ia_permitir_preco'),
      ia_tom_de_voz: configRecord.getString('ia_tom_de_voz') || 'profissional',
      ia_prompt_sistema: configRecord.getString('ia_prompt_sistema') || '',
    })
  },
  $apis.requireAuth(),
)
