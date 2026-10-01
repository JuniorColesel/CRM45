/**
 * Endpoint do backend: POST /backend/v1/reavaliar_intencao
 *
 * Permite ao vendedor corrigir manualmente a intenção detectada pela IA
 * na conversa ou mensagem, ajustando o follow-up / oportunidade se necessário.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/reavaliar_intencao',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id
    const novaIntencao = body.nova_intencao // 'alta' | 'media' | 'baixa'
    const criarOportunidade = body.criar_oportunidade === true
    const criarFollowUp = body.criar_follow_up === true
    const observacao = (body.observacao || '').trim()

    if (!conversaId) {
      return e.json(400, { message: 'ID da conversa é obrigatório.' })
    }

    if (!['alta', 'media', 'baixa'].includes(novaIntencao)) {
      return e.json(400, { message: 'Intenção inválida: deve ser alta, media ou baixa.' })
    }

    // 1. Obter conversa
    let conversa = null
    try {
      conversa = $app.findRecordById('conversas_whatsapp', conversaId)
    } catch (_) {
      return e.json(404, { message: 'Conversa não encontrada.' })
    }

    conversa.set('ultima_intencao', novaIntencao)
    $app.save(conversa)

    const clienteId = conversa.getString('cliente_id')

    // 2. Ações opcionais solicitadas pelo vendedor ao reavaliar
    let opCriadaId = null
    let followUpCriado = false

    if (criarOportunidade && clienteId) {
      // Regra anti-duplicata
      let jaTemAberta = false
      try {
        const ops = $app.findRecordsByFilter(
          'oportunidades',
          "cliente_id = '" + clienteId + "' && status = 'aberto'",
          '-created',
          1,
          0,
        )
        if (ops && ops.length > 0) {
          jaTemAberta = true
        }
      } catch (_) {}

      if (!jaTemAberta) {
        try {
          let etapaId = ''
          const etapas = $app.findRecordsByFilter('etapas_funil', '', 'ordem', 1, 0)
          if (etapas && etapas.length > 0) {
            etapaId = etapas[0].id
          }

          // Buscar etapa Prospecção
          let etapaProspId = etapaId
          try {
            const et = $app.findFirstRecordByData('etapas_funil', 'nome', 'Prospecção')
            if (et) etapaProspId = et.id
          } catch (_) {}

          if (etapaProspId) {
            const opsCol = $app.findCollectionByNameOrId('oportunidades')
            const novaOp = new Record(opsCol)
            const hojeStr = new Date().toISOString().slice(0, 10)
            novaOp.set('cliente_id', clienteId)
            novaOp.set(
              'titulo',
              'Lead WhatsApp: ' + (conversa.getString('telefone_formatado') || 'Lead Reavaliado'),
            )
            novaOp.set('etapa_id', etapaProspId)
            novaOp.set('responsavel_id', authRecord.id)
            novaOp.set('vendedor', authRecord.id)
            novaOp.set('origem', 'crm')
            novaOp.set('tipo_origem', 'crm')
            novaOp.set('data_origem', hojeStr)
            novaOp.set('status', 'aberto')
            novaOp.set('valor', 0)
            novaOp.set(
              'observacoes',
              'Oportunidade gerada por correção manual de intenção (' +
                novaIntencao +
                '): ' +
                observacao,
            )
            $app.save(novaOp)
            opCriadaId = novaOp.id
          }
        } catch (err) {
          console.log('Erro ao criar oportunidade na reavaliação:', err)
        }
      }
    }

    if (criarFollowUp && clienteId) {
      try {
        const ligacoesCol = $app.findCollectionByNameOrId('ligacoes')
        const novoFollowUp = new Record(ligacoesCol)
        novoFollowUp.set('cliente_id', clienteId)
        novoFollowUp.set('responsavel_id', authRecord.id)
        novoFollowUp.set('data_hora', new Date().toISOString())
        novoFollowUp.set('tipo', 'entrada')
        novoFollowUp.set('resultado', 'atendeu')
        novoFollowUp.set(
          'observacoes',
          'Follow-up gerado por reavaliação de intenção (' + novaIntencao + '): ' + observacao,
        )
        novoFollowUp.set('proxima_acao', 'Acompanhar interesse via WhatsApp')
        $app.save(novoFollowUp)
        followUpCriado = true
      } catch (err) {
        console.log('Erro ao criar follow up na reavaliação:', err)
      }
    }

    return e.json(200, {
      success: true,
      conversa_id: conversa.id,
      nova_intencao: novaIntencao,
      oportunidade_criada_id: opCriadaId,
      follow_up_criado: followUpCriado,
    })
  },
  $apis.requireAuth(),
)
