/**
 * Webhook Genérico de WhatsApp (v0.0.31)
 *
 * Endpoint: /backend/v1/whatsapp/webhook
 *
 * Especificações:
 * 1. Idempotência: campo "external_id" único em mensagens_whatsapp. Se mensagem com external_id já existe,
 *    retorna 200 { status: 'already_processed', message_id: ... } sem processar ou duplicar.
 * 2. Anti-replay: timestamp na requisição. Rejeitar com HTTP 400 se |agora - timestamp| > 5 minutos (300 segundos).
 * 3. Retry/fila: se o processamento falhar, registrar log como "pendente" em webhook_logs e tentar novamente (máx 3 tentativas).
 * 4. Logs: registrar toda requisição (timestamp, external_id, status: sucesso|pendente|rejeitado|falhou, tentativas, erro, payload sanitizado) em webhook_logs.
 * 5. Denormalização: ao criar mensagem e conversa, atribuir o campo "vendedor" derivado do cliente ou responsável.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd('POST', '/backend/v1/whatsapp/webhook', (c) => {
  const agora = Date.now()
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

  // Sanitizador de payload inline: remove chaves, tokens, senhas, secrets e mascara dados sensíveis
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

  // 1. Extração de campos genéricos
  // Suporta formatos: { external_id, timestamp, de, para, texto, ... } ou { id, created_at, from, to, message: { text } }
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

  // Timestamp para validação anti-replay (pode vir em milissegundos, segundos ou ISO string)
  const reqTimestamp =
    rawBody.timestamp || rawBody.timestamp_req || rawBody.created_at || rawBody.time

  // Helper para salvar log no webhook_logs
  const gravarLog = (status, erroMsg = '', tentativas = 1) => {
    try {
      const logsCol = $app.findCollectionByNameOrId('webhook_logs')
      const logRec = new Record(logsCol)
      logRec.set('external_id', externalId)
      logRec.set('provider', provider)
      logRec.set('timestamp_req', reqTimestamp ? String(reqTimestamp) : String(agora))
      logRec.set('status', status) // 'sucesso' | 'pendente' | 'rejeitado' | 'falhou'
      logRec.set('tentativas', tentativas)
      if (erroMsg) logRec.set('erro', String(erroMsg).substring(0, 1000))
      logRec.set('payload', payloadSanitizado)
      $app.save(logRec)
      return logRec.id
    } catch (e) {
      // Falha defensiva de log não interrompe resposta HTTP
      return null
    }
  }

  // 2. Anti-replay: timestamp obrigatório e validação de janela de 5 minutos (300.000 ms)
  if (!reqTimestamp) {
    gravarLog('rejeitado', 'Anti-replay: timestamp da requisição é obrigatório', 1)
    return c.json(400, {
      erro: 'Anti-replay: campo timestamp obrigatório para validação de segurança.',
    })
  }

  let tsMs = Number(reqTimestamp)
  if (isNaN(tsMs)) {
    // Tenta interpretar como ISO date
    const parsed = Date.parse(String(reqTimestamp))
    if (!isNaN(parsed)) {
      tsMs = parsed
    }
  } else if (tsMs < 10000000000) {
    // Timestamp em segundos (Unix Epoch)
    tsMs = tsMs * 1000
  }

  if (isNaN(tsMs)) {
    gravarLog('rejeitado', 'Anti-replay: formato de timestamp inválido', 1)
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
      1,
    )
    return c.json(400, {
      erro: 'Anti-replay: requisição rejeitada (diferença de tempo superior a 5 minutos).',
      drift_segundos: Math.round(diferencaMs / 1000),
    })
  }

  // 3. Idempotência: verificar se external_id já foi processado
  if (externalId) {
    try {
      const msgExistente = $app.findFirstRecordByData(
        'mensagens_whatsapp',
        'external_id',
        externalId,
      )
      if (msgExistente) {
        gravarLog('sucesso', 'Idempotência: external_id já processado previamente', 1)
        return c.json(200, {
          status: 'already_processed',
          mensagem: 'Mensagem já processada anteriormente (idempotência atendida).',
          id: msgExistente.id,
          external_id: externalId,
        })
      }
    } catch (_) {
      // Não encontrada: continua processamento normalmente
    }
  }

  // 4. Execução do processamento com Retry / Fila (até 3 tentativas)
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

  // Direção normalizada para enum do schema: "entrada" | "saida"
  const direcaoFinal = direcao === 'enviada' || direcao === 'saida' ? 'saida' : 'entrada'

  const numeroContato = (direcaoFinal === 'saida' ? destinatarioRaw : remetenteRaw).replace(
    /\D/g,
    '',
  )

  let tentativas = 0
  let processadoSucesso = false
  let ultimoErro = null
  let mensagemCriadaId = null

  while (tentativas < 3 && !processadoSucesso) {
    tentativas++
    try {
      // Localizar cliente correspondente pelo telefone para vincular e herdar vendedor
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

      // Localizar ou criar a conversa_whatsapp vinculada
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
        // Atualiza conversa com a última mensagem
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

      // Criar o registro na coleção mensagens_whatsapp
      const mensagensCol = $app.findCollectionByNameOrId('mensagens_whatsapp')
      const novaMensagem = new Record(mensagensCol)
      novaMensagem.set('conversa_id', conversaRecord.id)
      novaMensagem.set('direcao', direcaoFinal)
      novaMensagem.set('texto', textoMsg || '(mensagem sem texto)')
      if (externalId) {
        novaMensagem.set('external_id', externalId)
      }
      const vendedorFinal = vendedorId || conversaRecord.getString('vendedor') || ''
      if (vendedorFinal) {
        novaMensagem.set('vendedor', vendedorFinal)
      }

      $app.save(novaMensagem)
      mensagemCriadaId = novaMensagem.id
      processadoSucesso = true
    } catch (err) {
      ultimoErro = err
    }
  }

  // 5. Verificação do resultado após tentativas
  if (processadoSucesso) {
    gravarLog('sucesso', '', tentativas)
    return c.json(200, {
      status: 'sucesso',
      external_id: externalId,
      mensagem_id: mensagemCriadaId,
      tentativas: tentativas,
    })
  } else {
    // Falha em todas as tentativas: marcar como "pendente" para fila/reprocessamento
    const erroDesc = ultimoErro
      ? ultimoErro.message || String(ultimoErro)
      : 'Erro desconhecido no processamento'
    gravarLog('pendente', erroDesc, tentativas)

    return c.json(500, {
      status: 'pendente',
      erro: 'Falha temporária no processamento após tentativas. Marcado como pendente para reprocessamento.',
      tentativas: tentativas,
      detalhe: erroDesc,
    })
  }
})
