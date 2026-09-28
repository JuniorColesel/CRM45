migrate(
  (app) => {
    // 1. Coleção integracoes_config
    // RLS restrita estritamente a admin (neste projeto, perfil ceo_financeiro)
    // Campos: bling_token, whatsapp_token, whatsapp_provedor, whatsapp_telefone,
    //         smtp_host, smtp_port, smtp_user, smtp_password, gateway_sms,
    //         ia_api_key, ia_ativo, ia_permitir_preco, ia_tom_de_voz, ia_prompt_sistema
    // Os campos sensíveis possuem hidden: true no PocketBase para nunca vazarem em list/view acidental.
    const adminRule = "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro'"

    const integracoesConfig = new Collection({
      name: 'integracoes_config',
      type: 'base',
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields: [
        // Bling
        {
          name: 'bling_token',
          type: 'text',
          required: false,
          hidden: true,
        },
        // WhatsApp
        {
          name: 'whatsapp_token',
          type: 'text',
          required: false,
          hidden: true,
        },
        {
          name: 'whatsapp_provedor',
          type: 'text',
          required: false,
        },
        {
          name: 'whatsapp_telefone',
          type: 'text',
          required: false,
        },
        // SMTP / E-mail
        {
          name: 'smtp_host',
          type: 'text',
          required: false,
        },
        {
          name: 'smtp_port',
          type: 'text',
          required: false,
        },
        {
          name: 'smtp_user',
          type: 'text',
          required: false,
        },
        {
          name: 'smtp_password',
          type: 'text',
          required: false,
          hidden: true,
        },
        // SMS Gateway
        {
          name: 'gateway_sms',
          type: 'text',
          required: false,
        },
        // IA
        {
          name: 'ia_api_key',
          type: 'text',
          required: false,
          hidden: true,
        },
        {
          name: 'ia_ativo',
          type: 'bool',
          required: false,
        },
        {
          name: 'ia_permitir_preco',
          type: 'bool',
          required: false,
        },
        {
          name: 'ia_tom_de_voz',
          type: 'text',
          required: false,
        },
        {
          name: 'ia_prompt_sistema',
          type: 'text',
          required: false,
        },
        // Autodate fields obrigatórios
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [],
    })

    app.save(integracoesConfig)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('integracoes_config')
      app.delete(col)
    } catch (_) {}
  },
)
