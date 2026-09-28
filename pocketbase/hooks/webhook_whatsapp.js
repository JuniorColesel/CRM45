/**
 * Webhook de entrada de WhatsApp (Zenvia, Twilio, 360dialog, Infobip, etc.)
 * POST /backend/v1/webhook_whatsapp
 *
 * Requisitos:
 * - Endpoint público que recebe mensagem nova do provedor
 * - Cria/atualiza a conversa vinculando pelo número de telefone
 * - Se o número não existir em clientes, cria CLIENTE RASCUNHO (status: "rascunho")
 * - Detecta intenção: ALTA (compra), MÉDIA (qualificação), BAIXA (info)
 * - ALTA: abre oportunidade em etapa "Prospecção" vinculada ao cliente (se não tiver aberta - anti-duplicata), e cria follow-up (ligação tipo "mensagem")
 * - MÉDIA: cria SÓ o follow-up
 * - BAIXA: não cria nada, só registra conversa
 * - Toda movimentação automática fica auditável
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd('POST', '/backend/v1/webhook_whatsapp', (e) => {
  const body = e.requestInfo().body || {}

  // Extração flexível para suportar múltiplos provedores (Zenvia, Twilio, 360dialog, genérico)
  let numeroRaw = body.from || body.From || body.numero || body.sender || body.phone || ''
  let texto =
    body.text ||
    body.Body ||
    body.message ||
    body.texto ||
    (body.message && body.message.text) ||
    ''
  let nomeRemetente =
    body.name || body.profileName || body.sender_name || body.nome || 'Lead WhatsApp'
  let provedor = (body.provider || body.provedor || 'whatsapp').toString().toLowerCase()

  if (typeof texto !== 'string') {
    texto = JSON.stringify(texto)
  }
  texto = texto.trim()

  // Normalização do número de telefone (remover caracteres especiais)
  let numeroLimpo = (numeroRaw + '').replace(/\D/g, '')
  if (!numeroLimpo && body.contacts && body.contacts[0]) {
    numeroLimpo = (body.contacts[0].wa_id || '').replace(/\D/g, '')
    if (body.contacts[0].profile && body.contacts[0].profile.name) {
      nomeRemetente = body.contacts[0].profile.name
    }
  }

  if (!numeroLimpo) {
    return e.json(400, { error: 'Número de telefone não informado' })
  }

  // 1. Procurar cliente com este número
  const clientesCol = $app.findCollectionByNameOrId('clientes')
  let clienteId = null
  let clienteNome = nomeRemetente
  let clienteResponsavelId = null

  try {
    // Busca flexível: telefone contendo o número limpo ou os últimos 8/9 dígitos
    const ultimosDigitos = numeroLimpo.length >= 8 ? numeroLimpo.slice(-8) : numeroLimpo
    const cRecords = $app.findRecordsByFilter(
      'clientes',
      "telefone ~ '" + ultimosDigitos + "'",
      '-created',
      1,
      0,
    )
    if (cRecords && cRecords.length > 0) {
      clienteId = cRecords[0].id
      clienteNome = cRecords[0].getString('nome_contato') || nomeRemetente
      clienteResponsavelId = cRecords[0].getString('responsavel_id') || null
    }
  } catch (err) {
    console.log('Erro ao buscar cliente por telefone:', err)
  }

  // Se cliente não existe, criar CLIENTE RASCUNHO (status: "rascunho")
  if (!clienteId) {
    try {
      const novoCliente = new Record(clientesCol)
      novoCliente.set('nome_contato', nomeRemetente)
      novoCliente.set('telefone', '+' + numeroLimpo)
      novoCliente.set('status', 'rascunho')
      novoCliente.set('observacoes', 'Criado automaticamente via mensagem WhatsApp (Rascunho).')
      $app.save(novoCliente)
      clienteId = novoCliente.id
    } catch (err) {
      console.log('Erro ao criar cliente rascunho:', err)
    }
  }

  // 2. Classificação de Intenção por keywords/contexto
  const textoLower = texto.toLowerCase()
  let intencao = 'baixa'

  const keywordsAlta = [
    'quanto custa',
    'orcamento',
    'orçamento',
    'preco',
    'preço',
    'pedido',
    'quero comprar',
    'faz entrega',
    'ta disponivel',
    'tá disponível',
    'tem disponivel',
    'tem disponível',
    'tenho interesse',
    'pode reservar',
    'reserva',
    'comprar',
    'cotacao',
    'cotação',
    'valor',
    'quanto fica',
  ]

  const keywordsMedia = [
    'qual a diferenca',
    'qual a diferença',
    'tem garantia',
    'em quanto tempo entrega',
    'prazo de entrega',
    'tem de outra cor',
    'outro modelo',
    'qual marca',
    'funciona para',
    'serve para',
    'especificacao',
    'especificação',
  ]

  const keywordsBaixa = [
    'qual o endereco',
    'qual o endereço',
    'horario de funcionamento',
    'horário de funcionamento',
    'horario',
    'atendem em',
    'onde fica',
    'bom dia',
    'boa tarde',
    'boa noite',
    'ola',
    'olá',
  ]

  let detectouAlta = false
  for (let i = 0; i < keywordsAlta.length; i++) {
    if (textoLower.includes(keywordsAlta[i])) {
      detectouAlta = true
      break
    }
  }

  if (detectouAlta) {
    intencao = 'alta'
  } else {
    let detectouMedia = false
    for (let i = 0; i < keywordsMedia.length; i++) {
      if (textoLower.includes(keywordsMedia[i])) {
        detectouMedia = true
        break
      }
    }
    if (detectouMedia) {
      intencao = 'media'
    } else {
      intencao = 'baixa'
    }
  }

  // 3. Localizar ou criar conversa_whatsapp
  const conversasCol = $app.findCollectionByNameOrId('conversas_whatsapp')
  let conversa = null

  try {
    const conversasExistentes = $app.findRecordsByFilter(
      'conversas_whatsapp',
      "numero ~ '" + numeroLimpo.slice(-8) + "'",
      '-created',
      1,
      0,
    )
    if (conversasExistentes && conversasExistentes.length > 0) {
      conversa = conversasExistentes[0]
    }
  } catch (_) {}

  if (!conversa) {
    conversa = new Record(conversasCol)
    conversa.set('numero', '+' + numeroLimpo)
    conversa.set('status', 'aberta')
  }

  if (clienteId) {
    conversa.set('cliente_id', clienteId)
  }
  conversa.set('provedor', provedor)
  conversa.set('ultima_mensagem', texto)
  conversa.set('ultima_intencao', intencao)
  $app.save(conversa)

  // 4. Salvar mensagem_whatsapp
  const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
  const msgRecord = new Record(mensagensCol)
  msgRecord.set('conversa_id', conversa.id)
  msgRecord.set('direcao', 'entrada')
  msgRecord.set('texto', texto)
  msgRecord.set('intencao_detectada', intencao)
  $app.save(msgRecord)

  // 5. Automações de CRM baseadas na intenção
  let auditoria = {
    intencao_detectada: intencao,
    oportunidade_criada: false,
    oportunidade_existente_id: null,
    follow_up_criado: false,
    resumo: '',
  }

  // Atribuição de responsável padrão para tarefas e oportunidades se o cliente não tiver
  let responsavelFinalId = clienteResponsavelId
  if (!responsavelFinalId) {
    try {
      const uVend = $app.findRecordsByFilter(
        'usuarios',
        "ativo = true && (perfil = 'vendedor_1' || perfil = 'vendedor_2' || perfil = 'coordenador_vendas')",
        'created',
        1,
        0,
      )
      if (uVend && uVend.length > 0) {
        responsavelFinalId = uVend[0].id
      }
    } catch (_) {}
  }

  if (intencao === 'alta') {
    // Regra anti-duplicata: se cliente já tem oportunidade aberta, NÃO criar outra
    let opAbertaId = null
    if (clienteId) {
      try {
        const ops = $app.findRecordsByFilter(
          'oportunidades',
          "cliente_id = '" + clienteId + "' && status = 'aberto'",
          '-created',
          1,
          0,
        )
        if (ops && ops.length > 0) {
          opAbertaId = ops[0].id
        }
      } catch (_) {}
    }

    if (!opAbertaId && clienteId) {
      // Obter etapa Prospecção (menor ordem)
      let etapaId = ''
      try {
        const etapas = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 1, 0)
        if (etapas && etapas.length > 0) {
          etapaId = etapas[0].id
        }
      } catch (_) {}

      if (etapaId && responsavelFinalId) {
        try {
          const opsCol = $app.findCollectionByNameOrId('oportunidades')
          const novaOp = new Record(opsCol)
          novaOp.set('cliente_id', clienteId)
          novaOp.set('etapa_id', etapaId)
          novaOp.set('responsavel_id', responsavelFinalId)
          novaOp.set('status', 'aberto')
          novaOp.set('valor', 0)
          novaOp.set('observacoes', 'Oportunidade aberta via IA (Intenção Alta WhatsApp): ' + texto)
          $app.save(novaOp)
          auditoria.oportunidade_criada = true
          auditoria.oportunidade_id = novaOp.id
        } catch (err) {
          console.log('Erro ao criar oportunidade automática:', err)
        }
      }
    } else {
      auditoria.oportunidade_existente_id = opAbertaId
    }

    // Criar registro de follow-up (ligação com tipo "entrada", resultado "atendeu")
    if (clienteId && responsavelFinalId) {
      try {
        const ligacoesCol = $app.findCollectionByNameOrId('ligacoes')
        const novoFollowUp = new Record(ligacoesCol)
        novoFollowUp.set('cliente_id', clienteId)
        novoFollowUp.set('responsavel_id', responsavelFinalId)
        novoFollowUp.set('data_hora', new Date().toISOString())
        novoFollowUp.set('tipo', 'entrada')
        novoFollowUp.set('resultado', 'atendeu')
        novoFollowUp.set(
          'observacoes',
          'Cliente demonstrou interesse via WhatsApp (Alta intenção). Assunto: ' + texto,
        )
        novoFollowUp.set('proxima_acao', 'Responder cotação/pedido no WhatsApp')
        $app.save(novoFollowUp)
        auditoria.follow_up_criado = true
      } catch (err) {
        console.log('Erro ao criar follow-up (alta intenção):', err)
      }
    }

    auditoria.resumo =
      'Intenção Alta detectada: ' +
      (auditoria.oportunidade_criada
        ? 'Oportunidade aberta e follow-up registrado.'
        : 'Follow-up adicionado à oportunidade aberta existente.')
  } else if (intencao === 'media') {
    // Intenção MÉDIA: cria SÓ o follow-up (sem oportunidade)
    if (clienteId && responsavelFinalId) {
      try {
        const ligacoesCol = $app.findCollectionByNameOrId('ligacoes')
        const novoFollowUp = new Record(ligacoesCol)
        novoFollowUp.set('cliente_id', clienteId)
        novoFollowUp.set('responsavel_id', responsavelFinalId)
        novoFollowUp.set('data_hora', new Date().toISOString())
        novoFollowUp.set('tipo', 'entrada')
        novoFollowUp.set('resultado', 'atendeu')
        novoFollowUp.set(
          'observacoes',
          'Dúvida de produto/qualificação via WhatsApp (Média intenção). Assunto: ' + texto,
        )
        novoFollowUp.set('proxima_acao', 'Esclarecer dúvidas técnicas e prazos')
        $app.save(novoFollowUp)
        auditoria.follow_up_criado = true
      } catch (err) {
        console.log('Erro ao criar follow-up (média intenção):', err)
      }
    }
    auditoria.resumo =
      'Intenção Média detectada: Follow-up registrado para o vendedor responder dúvidas.'
  } else {
    auditoria.resumo =
      'Intenção Baixa detectada: Conversa registrada sem criação de oportunidade ou follow-up.'
  }

  return e.json(200, {
    success: true,
    conversa_id: conversa.id,
    cliente_id: clienteId,
    mensagem_id: msgRecord.id,
    auditoria: auditoria,
  })
})
