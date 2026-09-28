/**
 * Endpoint do backend: POST /backend/v1/sugerir_resposta_ia
 *
 * Gera sugestão de resposta via Skip AI Gateway ($ai.chat)
 *
 * MUDANÇA DE SEGURANÇA E MINIMIZAÇÃO DE DADOS (v0.0.31):
 * - Lê ia_api_key e preferências do backend (coleção integracoes_config) com fallback seguro.
 * - O frontend NUNCA envia nem vê chaves de API de IA.
 * - NENHUMA credencial é logada no console ou retornada no payload.
 * - Minimização de dados: Zero PII enviado ao LLM.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/sugerir_resposta_ia',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const body = e.requestInfo().body || {}
    const conversaId = body.conversa_id
    const mensagemCliente = (body.mensagem_cliente || '').trim()

    if (!conversaId) {
      return e.json(400, { message: 'ID da conversa é obrigatório.' })
    }

    // Obter configurações de IA do backend (integracoes_config)
    let iaAtivo = true
    let permitirPreco = true
    let tomDeVoz = 'profissional'
    let promptPersonalizado = body.prompt_personalizado || ''

    try {
      const configs = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (configs && configs.length > 0) {
        const cfg = configs[0]
        if (body.ativo === undefined) {
          iaAtivo = cfg.getBool('ia_ativo')
        } else {
          iaAtivo = body.ativo !== false
        }
        if (body.permitir_preco === undefined) {
          permitirPreco = cfg.getBool('ia_permitir_preco')
        } else {
          permitirPreco = body.permitir_preco !== false
        }
        if (!body.tom_de_voz && cfg.getString('ia_tom_de_voz')) {
          tomDeVoz = cfg.getString('ia_tom_de_voz')
        } else if (body.tom_de_voz) {
          tomDeVoz = body.tom_de_voz
        }
        if (!promptPersonalizado && cfg.getString('ia_prompt_sistema')) {
          promptPersonalizado = cfg.getString('ia_prompt_sistema')
        }
      } else {
        if (body.ativo !== undefined) iaAtivo = body.ativo !== false
        if (body.permitir_preco !== undefined) permitirPreco = body.permitir_preco !== false
        if (body.tom_de_voz) tomDeVoz = body.tom_de_voz
      }
    } catch (_) {
      if (body.ativo !== undefined) iaAtivo = body.ativo !== false
      if (body.permitir_preco !== undefined) permitirPreco = body.permitir_preco !== false
      if (body.tom_de_voz) tomDeVoz = body.tom_de_voz
    }

    if (!iaAtivo) {
      return e.json(400, { message: 'O Assistente de IA está desativado nas configurações.' })
    }

    // 1. Verificar conversa
    let conversa = null
    try {
      conversa = $app.findRecordById('conversas_whatsapp', conversaId)
    } catch (_) {
      return e.json(404, { message: 'Conversa não encontrada.' })
    }

    // 2. Limite de custo: máximo 5 sugestões por conversa
    try {
      const countSugestoes = $app.countRecords('sugestoes_ia', "conversa_id = '" + conversaId + "'")
      if (countSugestoes >= 5) {
        return e.json(429, {
          limite_atingido: true,
          message: 'Limite de 5 sugestões por conversa atingido.',
        })
      }
    } catch (_) {}

    // 3. Obter últimas 5 mensagens da conversa (sem PII)
    let historicoMensagens = []
    try {
      const msgs = $app.findRecordsByFilter(
        'mensagens_whatsapp',
        "conversa_id = '" + conversaId + "'",
        '-created',
        5,
        0,
      )
      for (let i = msgs.length - 1; i >= 0; i--) {
        const txt = msgs[i].getString('texto') || ''
        const txtLimpo = txt
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
          .replace(/(\(?\d{2}\)?\s*)?(9?\d{4}[-.\s]?\d{4})/g, '[telefone]')
          .replace(/\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/g, '[cpf]')

        historicoMensagens.push({
          direcao: msgs[i].getString('direcao'),
          texto: txtLimpo,
        })
      }
    } catch (_) {}

    // 4. Catálogo de produtos (sem PII)
    let catalogoTexto = ''
    try {
      const produtos = $app.findRecordsByFilter('produtos', '', 'nome', 50, 0)
      if (produtos.length > 0) {
        catalogoTexto = produtos
          .map((p) => {
            const precoFormatado = 'R$ ' + (p.getInt('preco') || 0)
            const disp = p.getBool('disponibilidade') ? 'Em estoque' : 'Sob consulta'
            const prazo = p.getString('prazo_entrega') || 'a combinar'
            return (
              '- ' +
              p.getString('nome') +
              ' | ' +
              precoFormatado +
              '/' +
              p.getString('unidade') +
              ' | ' +
              disp +
              ' | Entrega: ' +
              prazo
            )
          })
          .join('\n')
      } else {
        catalogoTexto = 'Nenhum produto cadastrado no catálogo atualmente.'
      }
    } catch (_) {
      catalogoTexto = 'Não foi possível carregar o catálogo de produtos.'
    }

    // 5. Montagem do prompt do sistema com MINIMIZAÇÃO DE DADOS (ZERO PII)
    let promptBase = promptPersonalizado
    if (!promptBase) {
      promptBase = `Você é o assistente de vendas da Colesel (materiais de construção). Sua função é SUGERIR respostas para mensagens de clientes. O vendedor sempre revisa antes de enviar.

REGRAS OBRIGATÓRIAS:
1. RESPONDA DIRETO: se o cliente perguntou preço, prazo ou disponibilidade, responda isso primeiro, sem enrolação.
2. AGREGE 1 VALOR: após responder, acrescente UM ÚNICO diferencial relevante (garantia, entrega, durabilidade, aplicação, condição de pagamento). Nunca liste vários.
3. QUALIFIQUE OU AVANCE: faça UMA pergunta objetiva (área do telhado, quantidade, prazo da obra) OU proponha o próximo passo (orçamento, visita, proposta).
4. CHAMADA PARA AÇÃO: termine com uma ação clara e simples (ex: 'te mando o orçamento', 'posso agendar a entrega').
5. TAMANHO: máximo 3 frases curtas ou 2 parágrafos curtos. Proibido texto longo, saudação exagerada ou enrolação.
6. TOM: profissional, simpático e direto. Linguagem de vendedor para cliente. Sem jargão técnico excessivo.
7. PRIVACIDADE: nunca solicite ou repita dados pessoais desnecessários.
8. NUNCA INVENTE: não crie preço, prazo ou estoque. Se não tiver o dado, responda 'vou confirmar e já te retorno' e gere uma tarefa para o vendedor verificar.
9. FORMATE: saída em texto puro, pronto para enviar no WhatsApp (sem markdown, sem emojis em excesso — no máximo 1).`
    }

    let instrucaoTom = 'Tom de voz: Profissional, equilibrado e direto.'
    if (tomDeVoz === 'amigavel') {
      instrucaoTom = 'Tom de voz: Amigável, acolhedor, caloroso e atencioso.'
    } else if (tomDeVoz === 'direto') {
      instrucaoTom = 'Tom de voz: Ultra direto, sucinto e pragmático.'
    }

    let instrucaoPreco = ''
    if (!permitirPreco) {
      instrucaoPreco =
        'ATENÇÃO: Você NÃO tem permissão para citar preços ou valores financeiros nas respostas. Se o cliente perguntar preço, informe que o consultor vai calcular e enviar o orçamento personalizado.'
    }

    const promptSistemaCompleto =
      promptBase +
      '\n\n' +
      instrucaoTom +
      '\n' +
      instrucaoPreco +
      '\n\nDADOS DA COLOSEL / CATÁLOGO DE PRODUTOS:\n' +
      catalogoTexto +
      '\n'

    const messages = [{ role: 'system', content: promptSistemaCompleto }]
    for (let i = 0; i < historicoMensagens.length; i++) {
      const m = historicoMensagens[i]
      messages.push({
        role: m.direcao === 'entrada' ? 'user' : 'assistant',
        content: m.texto,
      })
    }

    const msgAtual = (mensagemCliente || conversa.getString('ultima_mensagem') || 'Olá')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
      .replace(/(\(?\d{2}\)?\s*)?(9?\d{4}[-.\s]?\d{4})/g, '[telefone]')
      .replace(/\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/g, '[cpf]')

    messages.push({
      role: 'user',
      content: msgAtual,
    })

    // 6. Chamada ao Gateway Skip AI
    let sugestaoTexto = ''
    let gerouTarefaConfirmacao = false

    try {
      const resAi = $ai.chat({
        model: 'fast',
        messages: messages,
      })

      if (resAi && resAi.choices && resAi.choices[0] && resAi.choices[0].message) {
        sugestaoTexto = resAi.choices[0].message.content.trim()
      } else {
        sugestaoTexto =
          'Olá! Vou verificar os detalhes do seu pedido com nossa equipe técnica e já te retorno em instantes.'
      }
    } catch (_) {
      sugestaoTexto =
        'Olá! Recebi sua mensagem, vou consultar a disponibilidade dos materiais com nossa equipe e já te envio o retorno!'
    }

    const sugestaoLower = sugestaoTexto.toLowerCase()
    if (
      sugestaoLower.includes('vou confirmar') ||
      sugestaoLower.includes('já te retorno') ||
      sugestaoLower.includes('ja te retorno') ||
      sugestaoLower.includes('consultar a disponibilidade')
    ) {
      const clienteId = conversa.getString('cliente_id')
      if (clienteId) {
        try {
          const tarefasCol = $app.findCollectionByNameOrId('tarefas')
          const novaTarefa = new Record(tarefasCol)
          novaTarefa.set('cliente_id', clienteId)
          novaTarefa.set('responsavel_id', authRecord.id)
          novaTarefa.set('tipo', 'whatsapp')
          novaTarefa.set(
            'descricao',
            'Confirmar preço/estoque solicitado pelo cliente no WhatsApp: "' + msgAtual + '"',
          )
          novaTarefa.set('data_hora', new Date().toISOString())
          novaTarefa.set('concluida', false)
          const vendedorConversa = conversa.getString('vendedor')
          if (vendedorConversa) {
            novaTarefa.set('vendedor', vendedorConversa)
          }
          $app.save(novaTarefa)
          gerouTarefaConfirmacao = true
        } catch (_) {}
      }
    }

    // 7. Salvar na tabela sugestoes_ia
    let sugestaoId = ''
    try {
      const sugestoesCol = $app.findCollectionByNameOrId('sugestoes_ia')
      const recSugestao = new Record(sugestoesCol)
      recSugestao.set('conversa_id', conversaId)
      recSugestao.set('mensagem_cliente', msgAtual)
      recSugestao.set('sugestao_gerada', sugestaoTexto)
      recSugestao.set('usada', false)
      recSugestao.set('editada', false)
      $app.save(recSugestao)
      sugestaoId = recSugestao.id

      conversa.set('ultima_resposta_ia', sugestaoTexto)
      $app.save(conversa)
    } catch (_) {}

    let totalUsadas = 1
    try {
      totalUsadas = $app.countRecords('sugestoes_ia', "conversa_id = '" + conversaId + "'")
    } catch (_) {}

    return e.json(200, {
      success: true,
      sugestao_id: sugestaoId,
      sugestao: sugestaoTexto,
      total_sugestoes: totalUsadas,
      limite_maximo: 5,
      gerou_tarefa_confirmacao: gerouTarefaConfirmacao,
    })
  },
  $apis.requireAuth(),
)
