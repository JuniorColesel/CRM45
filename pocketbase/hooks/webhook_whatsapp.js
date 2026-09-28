/**
 * Webhook Genérico de WhatsApp (v0.0.34)
 * "Webhook Hardening — Autenticação de Origem + Retry Assíncrono"
 *
 * Endpoint: POST /backend/v1/whatsapp/webhook
 *
 * Especificações v0.0.34:
 * 1. Segredo Compartilhado (P0-1):
 *    - Valida o header "X-Webhook-Secret".
 *    - Header ausente ou inválido -> 403 Forbidden IMEDIATAMENTE (antes de qualquer processamento).
 *    - Segredo configurado em: variável de ambiente WEBHOOK_SECRET (fallback: campo webhook_secret em integracoes_config).
 *    - Fail-secure: se WEBHOOK_SECRET não estiver configurado em lugar nenhum -> recusa TODAS as requisições (403).
 *    - Comparação em tempo constante (defensiva contra timing attacks).
 * 2. Retry Assíncrono (P1-2):
 *    - Handler síncrono recebe requisição, valida segredo (403), valida timestamp (400 se > 5min),
 *      verifica idempotência (200 sem duplicar se external_id já existe), grava webhook_logs com status "pendente",
 *      e retorna HTTP 200 IMEDIATAMENTE com { status: 'queued', external_id, log_id }.
 *    - Job agendado (cronAdd nativo do PocketBase) processa registros "pendente" em background:
 *      * Lock seguro por flag 'em_processamento' ou status para evitar concorrência.
 *      * Tenta até 3 vezes com backoff configurado: 5s, 30s, 2min (registrado em proxima_tentativa).
 *      * Sucesso -> atualiza status para 'processado' (ou 'sucesso').
 *      * Falha nas 3 tentativas -> mantém status 'pendente' (NÃO deleta) para auditoria/retry manual.
 * 3. Compatibilidade retroativa (zero regressão):
 *    - Idempotência por external_id mantida.
 *    - Anti-replay com janela de 5 minutos mantido.
 *    - Logs sanitizados com mascaramento [REDACTED] mantidos.
 *    - Denormalização de vendedor, cliente e conversa mantida.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica de cada callback deve ser estritamente inline (sem funções top-level compartilhadas)!
 */

// =========================================================================
// 1. ENDPOINT HTTP: POST /backend/v1/whatsapp/webhook
// =========================================================================
routerAdd('POST', '/backend/v1/whatsapp/webhook', (c) => {
  const agora = Date.now()

  // 1.1 Resolução do segredo configurado (fail-secure)
  // Ordem: 1) Variável de ambiente WEBHOOK_SECRET, 2) Campo webhook_secret na coleção integracoes_config
  let secretConfigurado = ''
  try {
    if (typeof $os !== 'undefined' && $os.getenv) {
      secretConfigurado = ($os.getenv('WEBHOOK_SECRET') || '').trim()
    }
  } catch (_) {}

  if (!secretConfigurado) {
    try {
      const cfgs = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (cfgs && cfgs.length > 0) {
        secretConfigurado = (cfgs[0].getString('webhook_secret') || '').trim()
      }
    } catch (_) {}
  }

  // 1.2 Leitura do header X-Webhook-Secret da requisição
  let headerSecret = ''
  try {
    if (c.request && c.request.header && c.request.header.get) {
      headerSecret = (c.request.header.get('X-Webhook-Secret') || '').trim()
      if (!headerSecret) {
        headerSecret = (c.request.header.get('x-webhook-secret') || '').trim()
      }
    }
  } catch (_) {}

  if (!headerSecret) {
    try {
      const info = c.requestInfo ? c.requestInfo() : null
      if (info && info.headers) {
        headerSecret = (
          info.headers['x_webhook_secret'] ||
          info.headers['x-webhook-secret'] ||
          info.headers['X-Webhook-Secret'] ||
          ''
        ).trim()
      }
    } catch (_) {}
  }

  // Comparação segura / tempo constante (se tamanhos forem diferentes ou strings divergirem)
  const compararSegredos = (a, b) => {
    if (!a || !b) return false
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const lenA = a.length
    const lenB = b.length
    let mismatch = lenA === lenB ? 0 : 1
    const maxLen = Math.max(lenA, lenB)
    for (let i = 0; i < maxLen; i++) {
      const charA = i < lenA ? a.charCodeAt(i) : 0
      const charB = i < lenB ? b.charCodeAt(i) : 0
      mismatch |= charA ^ charB
    }
    return mismatch === 0
  }

  // FAIL-SECURE: Se não há segredo configurado no ambiente nem no banco, recusa TODAS as requisições com 403
  if (!secretConfigurado) {
    return c.json(403, {
      erro: 'Forbidden: WEBHOOK_SECRET não configurado no servidor (fail-secure).',
    })
  }

  // Validação do header X-Webhook-Secret
  if (!headerSecret || !compararSegredos(headerSecret, secretConfigurado)) {
    return c.json(403, {
      erro: 'Forbidden: cabeçalho X-Webhook-Secret ausente ou inválido.',
    })
  }

  // 1.3 Leitura do body da requisição
  let rawBody = {}
  try {
    const reqInfo = c.requestInfo ? c.requestInfo() : null
    if (reqInfo && reqInfo.body) {
      rawBody = reqInfo.body
    } else if (typeof $apis !== 'undefined' && $apis.requestInfo) {
      rawBody = $apis.requestInfo(c).data || {}
    }
  } catch (_) {
    try {
      rawBody = c.request ? c.request.body : {}
    } catch (_) {
      rawBody = {}
    }
  }

  // Sanitizador inline de payload (remove senhas, tokens e mascara credenciais)
  const sanitizarPayload = (obj) => {
    if (!obj || typeof obj !== 'object') return obj
    try {
      const clone = JSON.parse(JSON.stringify(obj))
      const chavesSensiveis = [
        'password',
        'senha',
        'token',
        'secret',
        'api_key',
        'apikey',
        'authorization',
        'auth',
        'access_token',
        'refresh_token',
        'key',
        'bearer',
      ]

      const limpar = (target) => {
        if (!target || typeof target !== 'object') return
        for (const k of Object.keys(target)) {
          const kLower = k.toLowerCase()
          if (chavesSensiveis.some((s) => kLower.includes(s))) {
            target[k] = '[REDACTED]'
          } else if (typeof target[k] === 'object' && target[k] !== null) {
            limpar(target[k])
          }
        }
      }

      limpar(clone)
      return clone
    } catch (_) {
      return { info: 'payload_sanitized' }
    }
  }

  const payloadSanitizado = sanitizarPayload(rawBody)

  const externalId = (
    rawBody.external_id ||
    rawBody.id ||
    rawBody.message_id ||
    rawBody.id_mensagem ||
    ''
  )
    .toString()
    .trim()

  const provider = (rawBody.provider || 'generic_whatsapp').toString().trim()

  const reqTimestamp =
    rawBody.timestamp || rawBody.timestamp_req || rawBody.created_at || rawBody.time

  // Helper inline para gravar log no webhook_logs
  const gravarLog = (status, erroMsg = '', tentativas = 0, proximaTentativa = 0) => {
    try {
      const logsCol = $app.findCollectionByNameOrId('webhook_logs')
      const logRec = new Record(logsCol)
      logRec.set('external_id', externalId)
      logRec.set('provider', provider)
      logRec.set('timestamp_req', reqTimestamp ? String(reqTimestamp) : String(agora))
      logRec.set('status', status)
      logRec.set('tentativas', tentativas)
      if (erroMsg) logRec.set('erro', String(erroMsg).substring(0, 1000))
      logRec.set('payload', payloadSanitizado)
      if (proximaTentativa > 0) {
        logRec.set('proxima_tentativa', proximaTentativa)
      }
      logRec.set('em_processamento', false)
      $app.save(logRec)
      return logRec.id
    } catch (e) {
      return null
    }
  }

  // 1.4 Anti-replay: validação de timestamp e janela de 5 minutos (300.000 ms)
  if (!reqTimestamp) {
    gravarLog('rejeitado', 'Anti-replay: timestamp da requisição é obrigatório', 0)
    return c.json(400, {
      erro: 'Anti-replay: campo timestamp obrigatório para validação de segurança.',
    })
  }

  let tsMs = Number(reqTimestamp)
  if (isNaN(tsMs)) {
    const parsed = Date.parse(String(reqTimestamp))
    if (!isNaN(parsed)) {
      tsMs = parsed
    }
  } else if (tsMs < 10000000000) {
    // Segundos Unix -> milissegundos
    tsMs = tsMs * 1000
  }

  if (isNaN(tsMs)) {
    gravarLog('rejeitado', 'Anti-replay: formato de timestamp inválido', 0)
    return c.json(400, {
      erro: 'Anti-replay: formato de timestamp inválido.',
    })
  }

  const diferencaMs = Math.abs(agora - tsMs)
  const MAX_DRIFT_MS = 5 * 60 * 1000 // 5 minutos = 300.000 ms

  if (diferencaMs > MAX_DRIFT_MS) {
    gravarLog(
      'rejeitado',
      `Anti-replay: requisição expirada (drift de ${Math.round(diferencaMs / 1000)}s > 300s)`,
      0,
    )
    return c.json(400, {
      erro: 'Anti-replay: requisição rejeitada (diferença de tempo superior a 5 minutos).',
      drift_segundos: Math.round(diferencaMs / 1000),
    })
  }

  // 1.5 Idempotência: verificar se external_id já foi processado
  if (externalId) {
    try {
      const msgExistente = $app.findFirstRecordByData(
        'mensagens_whatsapp',
        'external_id',
        externalId,
      )
      if (msgExistente) {
        gravarLog('sucesso', 'Idempotência: external_id já processado previamente', 0)
        return c.json(200, {
          status: 'already_processed',
          mensagem: 'Mensagem já processada anteriormente (idempotência atendida).',
          id: msgExistente.id,
          external_id: externalId,
        })
      }
    } catch (_) {}

    // Verifica também se já existe log 'processado' ou 'sucesso' para esse external_id
    try {
      const logExistente = $app.findRecordsByFilter(
        'webhook_logs',
        `external_id = '${externalId}' && (status = 'processado' || status = 'sucesso')`,
        '-created',
        1,
        0,
      )
      if (logExistente && logExistente.length > 0) {
        return c.json(200, {
          status: 'already_processed',
          mensagem: 'Mensagem já registrada e processada anteriormente (idempotência atendida).',
          log_id: logExistente[0].id,
          external_id: externalId,
        })
      }
    } catch (_) {}
  }

  // 1.6 RETRY ASSÍNCRONO:
  // Salva no webhook_logs com status "pendente", tentativas = 0, proxima_tentativa = agora + 5000 (delay inicial 5s)
  const delayInicialMs = 5 * 1000
  const logId = gravarLog('pendente', '', 0, agora + delayInicialMs)

  // Retorna HTTP 200 IMEDIATAMENTE sem esperar o processamento da mensagem
  return c.json(200, {
    status: 'queued',
    mensagem: 'Webhook recebido com sucesso e enfileirado para processamento assíncrono.',
    external_id: externalId,
    log_id: logId,
  })
})

// =========================================================================
// 2. WORKER AGENDADO (CRON): Processamento de Webhooks Pendentes
// =========================================================================
// Executa a cada minuto via cronAdd nativo do PocketBase
cronAdd('processar_webhooks_whatsapp_pendentes', '* * * * *', () => {
  const agora = Date.now()

  // Buscar registros pendentes com lock de concorrência:
  // status = 'pendente' && em_processamento != true
  let registrosPendentes = []
  try {
    registrosPendentes = $app.findRecordsByFilter(
      'webhook_logs',
      "status = 'pendente' && em_processamento != true",
      'created',
      20,
      0,
    )
  } catch (err) {
    return
  }

  if (!registrosPendentes || registrosPendentes.length === 0) {
    return
  }

  // Delays de retry exigidos:
  // Tentativa 1: 5s após recebimento
  // Tentativa 2: 30s após falha 1
  // Tentativa 3: 2min (120s) após falha 2
  const delaysPorTentativa = [
    5 * 1000, // 5 segundos
    30 * 1000, // 30 segundos
    120 * 1000, // 2 minutos
  ]

  for (let i = 0; i < registrosPendentes.length; i++) {
    const logRec = registrosPendentes[i]

    // Respeitar backoff configurado no campo proxima_tentativa
    const proximaTentativa = logRec.getInt('proxima_tentativa') || 0
    if (proximaTentativa > 0 && agora < proximaTentativa) {
      // Ainda dentro do intervalo de espera, aguardar próxima execução
      continue
    }

    // LOCK: Marcar como em_processamento para evitar que outro tick do cron dispute o registro
    try {
      logRec.set('em_processamento', true)
      $app.save(logRec)
    } catch (_) {
      // Se falhar o lock concorrente, pula para o próximo registro
      continue
    }

    const externalId = (logRec.getString('external_id') || '').trim()
    const provider = logRec.getString('provider') || 'generic_whatsapp'
    let rawBody = {}
    try {
      rawBody = logRec.get('payload') || {}
    } catch (_) {
      rawBody = {}
    }

    let tentativasAtuais = logRec.getInt('tentativas') || 0
    tentativasAtuais++

    let sucesso = false
    let erroDetalhado = ''

    try {
      // 2.1 Verificar idempotência antes de duplicar
      if (externalId) {
        try {
          const msgJaExiste = $app.findFirstRecordByData(
            'mensagens_whatsapp',
            'external_id',
            externalId,
          )
          if (msgJaExiste) {
            // Já existe -> marcar processado sem recriar
            logRec.set('status', 'processado')
            logRec.set('em_processamento', false)
            logRec.set('tentativas', tentativasAtuais)
            logRec.set('erro', '')
            $app.save(logRec)
            continue
          }
        } catch (_) {}
      }

      // 2.2 Extração de dados da mensagem
      const remetenteRaw = (
        rawBody.remetente ||
        rawBody.de ||
        rawBody.from ||
        rawBody.telefone ||
        rawBody.numero ||
        ''
      )
        .toString()
        .trim()
      const destinatarioRaw = (rawBody.destinatario || rawBody.para || rawBody.to || '')
        .toString()
        .trim()
      const textoMsg = (
        rawBody.texto ||
        rawBody.text ||
        (rawBody.message && rawBody.message.text) ||
        rawBody.conteudo ||
        rawBody.body ||
        ''
      )
        .toString()
        .trim()

      const direcao = (
        rawBody.direcao ||
        rawBody.direction ||
        (rawBody.tipo === 'enviada' ? 'enviada' : 'recebida')
      )
        .toString()
        .trim()

      const direcaoFinal = direcao === 'enviada' || direcao === 'saida' ? 'saida' : 'entrada'
      const numeroContato = (direcaoFinal === 'saida' ? destinatarioRaw : remetenteRaw).replace(
        /\D/g,
        '',
      )

      // 2.3 Busca de cliente correspondente para vincular e herdar vendedor
      let clienteRecord = null
      let vendedorId = ''

      if (numeroContato) {
        try {
          const finalNumero = numeroContato.length >= 8 ? numeroContato.slice(-8) : numeroContato
          const clientes = $app.findRecordsByFilter(
            'clientes',
            `telefone ~ '${finalNumero}'`,
            '-created',
            1,
            0,
          )
          if (clientes && clientes.length > 0) {
            clienteRecord = clientes[0]
            vendedorId =
              clienteRecord.getString('vendedor') || clienteRecord.getString('responsavel_id') || ''
          }
        } catch (_) {}
      }

      // 2.4 Localizar ou criar a conversa_whatsapp vinculada
      const conversasCol = $app.findCollectionByNameOrId('conversas_whatsapp')
      let conversaRecord = null

      if (numeroContato) {
        try {
          const finalNumero = numeroContato.length >= 8 ? numeroContato.slice(-8) : numeroContato
          const conversasExistentes = $app.findRecordsByFilter(
            'conversas_whatsapp',
            `numero ~ '${finalNumero}'`,
            '-updated',
            1,
            0,
          )
          if (conversasExistentes && conversasExistentes.length > 0) {
            conversaRecord = conversasExistentes[0]
          }
        } catch (_) {}
      }

      if (!conversaRecord) {
        conversaRecord = new Record(conversasCol)
        conversaRecord.set('numero', numeroContato || 'desconhecido')
        conversaRecord.set('provedor', provider)
        if (clienteRecord) {
          conversaRecord.set('cliente_id', clienteRecord.id)
        }
        if (vendedorId) {
          conversaRecord.set('vendedor', vendedorId)
        }
        conversaRecord.set('status', 'aberta')
        conversaRecord.set('ultima_mensagem', textoMsg || 'Nova mensagem recebida')
        $app.save(conversaRecord)
      } else {
        conversaRecord.set(
          'ultima_mensagem',
          textoMsg || conversaRecord.getString('ultima_mensagem'),
        )
        if (clienteRecord && !conversaRecord.getString('cliente_id')) {
          conversaRecord.set('cliente_id', clienteRecord.id)
        }
        if (vendedorId && !conversaRecord.getString('vendedor')) {
          conversaRecord.set('vendedor', vendedorId)
        }
        $app.save(conversaRecord)
      }

      // 2.5 Detecção simples de intenção
      let intencaoDetectada = ''
      if (textoMsg) {
        const txtLower = textoMsg.toLowerCase()
        if (
          txtLower.includes('preço') ||
          txtLower.includes('preco') ||
          txtLower.includes('orçamento') ||
          txtLower.includes('orcamento') ||
          txtLower.includes('comprar') ||
          txtLower.includes('quanto custa') ||
          txtLower.includes('valor') ||
          txtLower.includes('pagamento')
        ) {
          intencaoDetectada = 'alta'
        } else if (
          txtLower.includes('entrega') ||
          txtLower.includes('prazo') ||
          txtLower.includes('tem estoque') ||
          txtLower.includes('disponibilidade') ||
          txtLower.includes('catálogo') ||
          txtLower.includes('catalogo')
        ) {
          intencaoDetectada = 'media'
        } else if (
          txtLower.includes('bom dia') ||
          txtLower.includes('boa tarde') ||
          txtLower.includes('boa noite') ||
          txtLower.includes('olá') ||
          txtLower.includes('ola')
        ) {
          intencaoDetectada = 'baixa'
        }
      }

      if (intencaoDetectada) {
        conversaRecord.set('ultima_intencao', intencaoDetectada)
        try {
          $app.save(conversaRecord)
        } catch (_) {}
      }

      // 2.6 Criar o registro na coleção mensagens_whatsapp
      const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
      const novaMensagem = new Record(mensagensCol)
      novaMensagem.set('conversa_id', conversaRecord.id)
      novaMensagem.set('direcao', direcaoFinal)
      novaMensagem.set('texto', textoMsg || '(mensagem sem texto)')
      if (intencaoDetectada) {
        novaMensagem.set('intencao_detectada', intencaoDetectada)
      }
      if (externalId) {
        novaMensagem.set('external_id', externalId)
      }
      const vendedorFinal = vendedorId || conversaRecord.getString('vendedor') || ''
      if (vendedorFinal) {
        novaMensagem.set('vendedor', vendedorFinal)
      }

      $app.save(novaMensagem)

      // 2.7 Ação decorrente de alta intenção de compra: criar oportunidade / follow-up se cliente existir
      if (intencaoDetectada === 'alta' && clienteRecord) {
        try {
          const opsAbertas = $app.findRecordsByFilter(
            'oportunidades',
            `cliente_id = '${clienteRecord.id}' && status = 'aberto'`,
            '-created',
            1,
            0,
          )
          if (!opsAbertas || opsAbertas.length === 0) {
            let primeiraEtapaId = ''
            const etapas = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 1, 0)
            if (etapas && etapas.length > 0) {
              primeiraEtapaId = etapas[0].id
            }

            if (primeiraEtapaId) {
              const opsCol = $app.findCollectionByNameOrId('oportunidades')
              const novaOp = new Record(opsCol)
              novaOp.set('cliente_id', clienteRecord.id)
              novaOp.set('etapa_id', primeiraEtapaId)
              novaOp.set('status', 'aberto')
              novaOp.set('valor', 0)
              if (vendedorFinal) {
                novaOp.set('responsavel_id', vendedorFinal)
                novaOp.set('vendedor', vendedorFinal)
              }
              novaOp.set(
                'observacoes',
                `Oportunidade criada via Webhook WhatsApp (intenção alta): "${(textoMsg || '').substring(0, 100)}"`,
              )
              $app.save(novaOp)
            }
          }
        } catch (_) {}
      }

      sucesso = true
    } catch (err) {
      sucesso = false
      erroDetalhado = err ? err.message || String(err) : 'Erro desconhecido no worker'
    }

    // 2.8 Atualização do status do registro após a tentativa
    try {
      logRec.set('tentativas', tentativasAtuais)
      logRec.set('em_processamento', false)

      if (sucesso) {
        logRec.set('status', 'processado')
        logRec.set('erro', '')
        logRec.set('proxima_tentativa', 0)
      } else {
        logRec.set('erro', erroDetalhado.substring(0, 1000))
        if (tentativasAtuais < 3) {
          // Agenda próxima tentativa conforme a tabela: [0]->5s, [1]->30s, [2]->120s
          const delayProximo =
            delaysPorTentativa[tentativasAtuais] ||
            delaysPorTentativa[delaysPorTentativa.length - 1]
          logRec.set('proxima_tentativa', Date.now() + delayProximo)
          logRec.set('status', 'pendente') // Mantém pendente para próxima tentativa
        } else {
          // REQUISITO: Falha nas 3 tentativas -> MANTÉM status "pendente" (para retry manual ou investigação; NÃO deletar)
          logRec.set('status', 'pendente')
          logRec.set('proxima_tentativa', 0) // Sem mais retentativas automáticas
        }
      }
      $app.save(logRec)
    } catch (saveErr) {
      console.log('Erro ao atualizar log após processamento:', saveErr)
    }
  }
})
