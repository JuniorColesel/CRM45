/**
 * Endpoint do backend: POST /backend/v1/sugerir_resposta_ia
 *
 * Gera sugestão de resposta via Skip AI Gateway ($ai.chat)
 * Contexto:
 * - Última mensagem do cliente
 * - Últimas 5 mensagens da conversa
 * - Histórico do cliente no CRM (nome, compras anteriores, oportunidade aberta)
 * - Catálogo de produtos (produtos cadastrados)
 * - Prompt de sistema customizado ou padrão
 * - Toggles: permitirPreco (boolean), tomDeVoz (profissional | amigavel | direto), ativo (boolean)
 * - Limite de 5 sugestões por conversa
 * - Registra em sugestoes_ia
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
    const promptPersonalizado = body.prompt_personalizado || ''
    const permitirPreco = body.permitir_preco !== false
    const tomDeVoz = body.tom_de_voz || 'profissional'
    const assistenteAtivo = body.ativo !== false

    if (!conversaId) {
      return e.json(400, { message: 'ID da conversa é obrigatório.' })
    }

    if (!assistenteAtivo) {
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
    } catch (err) {
      console.log('Erro ao checar limite de sugestões:', err)
    }

    // 3. Obter últimas 5 mensagens da conversa
    let historicoMensagens = []
    try {
      const msgs = $app.findRecordsByFilter(
        'mensagens_whatsapp',
        "conversa_id = '" + conversaId + "'",
        '-created',
        5,
        0,
      )
      // Inverter para ficar cronológico
      for (let i = msgs.length - 1; i >= 0; i--) {
        historicoMensagens.push({
          direcao: msgs[i].getString('direcao'),
          texto: msgs[i].getString('texto'),
        })
      }
    } catch (_) {}

    // 4. Obter histórico do cliente no CRM
    let clienteInfo = {
      nome: 'Cliente',
      telefone: conversa.getString('numero'),
      empresa: '',
      compras_anteriores: 'Nenhuma compra registrada',
      oportunidade_aberta: 'Nenhuma',
    }

    const clienteId = conversa.getString('cliente_id')
    if (clienteId) {
      try {
        const clienteRec = $app.findRecordById('clientes', clienteId)
        clienteInfo.nome = clienteRec.getString('nome_contato') || 'Cliente'
        clienteInfo.empresa = clienteRec.getString('nome_empresa') || ''
        const ultCompra = clienteRec.getString('data_ultima_compra')
        if (ultCompra) {
          clienteInfo.compras_anteriores = 'Última compra em ' + ultCompra
        }

        // Checar oportunidade aberta
        const ops = $app.findRecordsByFilter(
          'oportunidades',
          "cliente_id = '" + clienteId + "' && status = 'aberto'",
          '-created',
          1,
          0,
        )
        if (ops && ops.length > 0) {
          clienteInfo.oportunidade_aberta =
            'Em negociação (Valor: R$ ' + ops[0].getInt('valor') + ')'
        }
      } catch (_) {}
    }

    // 5. Catálogo de produtos
    let catalogoTexto = ''
    let totalProdutos = 0
    try {
      const produtos = $app.findRecordsByFilter('produtos', '', 'nome', 50, 0)
      totalProdutos = produtos.length
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

    // 6. Montagem do prompt do sistema
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

7. CONTEXTO: use o histórico do cliente (nome, compras anteriores, oportunidade aberta) quando existir. Personalize para não parecer robô.

8. NUNCA INVENTE: não crie preço, prazo ou estoque. Se não tiver o dado, responda 'vou confirmar e já te retorno' e gere uma tarefa para o vendedor verificar.

9. FORMATE: saída em texto puro, pronto para enviar no WhatsApp (sem markdown, sem emojis em excesso — no máximo 1).`
    }

    // Regra adicional de tom de voz
    let instrucaoTom = 'Tom de voz: Profissional, equilibrado e direto.'
    if (tomDeVoz === 'amigavel') {
      instrucaoTom = 'Tom de voz: Amigável, acolhedor, caloroso e atencioso.'
    } else if (tomDeVoz === 'direto') {
      instrucaoTom = 'Tom de voz: Ultra direto, sucinto e pragmático.'
    }

    // Regra de permissão de preço
    let instrucaoPreco = ''
    if (!permitirPreco) {
      instrucaoPreco =
        'ATENÇÃO: Você NÃO tem permissão para citar preços ou valores financeiros nas respostas. Se o cliente perguntar preço, informe que o consultor vai calcular e enviar o orçamento personalizado.'
    }

    // Contexto enriquecido
    const promptSistemaCompleto = `${promptBase}

${instrucaoTom}
${instrucaoPreco}

DADOS DA COLOSEL / CATÁLOGO DE PRODUTOS:
${catalogoTexto}

HISTÓRICO DO CLIENTE NO CRM:
- Nome: ${clienteInfo.nome}
- Empresa: ${clienteInfo.empresa || 'Pessoa física'}
- Telefone: ${clienteInfo.telefone}
- Histórico de Compras: ${clienteInfo.compras_anteriores}
- Oportunidade Atual: ${clienteInfo.oportunidade_aberta}
`

    // Histórico de mensagens para a IA
    const messages = [{ role: 'system', content: promptSistemaCompleto }]
    for (let i = 0; i < historicoMensagens.length; i++) {
      const m = historicoMensagens[i]
      messages.push({
        role: m.direcao === 'entrada' ? 'user' : 'assistant',
        content: m.texto,
      })
    }

    // Mensagem atual do cliente a responder
    const msgAtual = mensagemCliente || conversa.getString('ultima_mensagem') || 'Olá'
    messages.push({
      role: 'user',
      content: msgAtual,
    })

    // 7. Chamada ao Gateway Nativo Skip AI
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
    } catch (errAi) {
      console.log('Erro ao chamar $ai.chat:', errAi)
      sugestaoTexto =
        'Olá! Recebi sua mensagem, vou consultar a disponibilidade dos materiais com nossa equipe e já te envio o retorno!'
    }

    // Se a IA não teve o dado e respondeu "vou confirmar e já te retorno", gerar tarefa automática
    const sugestaoLower = sugestaoTexto.toLowerCase()
    if (
      sugestaoLower.includes('vou confirmar') ||
      sugestaoLower.includes('já te retorno') ||
      sugestaoLower.includes('ja te retorno') ||
      sugestaoLower.includes('consultar a disponibilidade')
    ) {
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
          $app.save(novaTarefa)
          gerouTarefaConfirmacao = true
        } catch (errT) {
          console.log('Erro ao gerar tarefa de confirmação:', errT)
        }
      }
    }

    // 8. Salvar na tabela sugestoes_ia
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

      // Atualizar última resposta da conversa
      conversa.set('ultima_resposta_ia', sugestaoTexto)
      $app.save(conversa)
    } catch (errSave) {
      console.log('Erro ao salvar sugestao_ia:', errSave)
    }

    // Contar total atual de sugestões nesta conversa
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
