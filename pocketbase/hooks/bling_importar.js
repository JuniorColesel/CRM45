/**
 * Rota proxy e sincronização completa:
 * POST /backend/v1/bling/importar
 * POST /backend/v1/bling/sincronizar
 *
 * REGRA ABSOLUTA: Toda chamada externa à api.bling.com.br usa EXCLUSIVAMENTE o método GET.
 * PROIBIDO POST, PUT, PATCH ou DELETE contra api.bling.com.br.
 *
 * Lê o bling_token exclusivamente do backend (integracoes_config) ou de secrets.
 * O frontend NUNCA envia nem vê a chave da API do Bling.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

// Helper 1: Rota legada de importação pontual de página (read-only)
routerAdd(
  'POST',
  '/backend/v1/bling/importar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas administradores (CEO / Financeiro) podem executar a importação do Bling.',
      })
    }

    // 1. Obter bling_token salvo no banco
    let blingToken = ''
    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        blingToken = records[0].getString('bling_token')
      }
    } catch (_) {}

    if (!blingToken) {
      try {
        blingToken = $secrets.get('BLING_TOKEN') || $secrets.get('BLING_API_KEY') || ''
      } catch (_) {}
    }

    if (!blingToken) {
      return e.json(400, {
        success: false,
        message:
          'Token de API do Bling não configurado no backend. Configure em Configurações → Integrações.',
      })
    }

    const body = e.requestInfo().body || {}
    const tipo = body.tipo || 'contatos'
    const pagina = Number(body.pagina) || 1
    const limite = Number(body.limite) || 50

    let endpointBling = ''
    if (tipo === 'pedidos') {
      endpointBling =
        'https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=' + pagina + '&limite=' + limite
    } else {
      endpointBling =
        'https://api.bling.com.br/Api/v3/contatos?pagina=' + pagina + '&limite=' + limite
    }

    try {
      const res = $http.send({
        url: endpointBling,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + blingToken,
        },
        timeout: 15,
      })

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return e.json(200, {
          success: true,
          tipo: tipo,
          pagina: pagina,
          data: res.json ? res.json.data || res.json : [],
          mensagem: 'Dados obtidos com sucesso do Bling ERP.',
        })
      }

      return e.json(res.statusCode || 502, {
        success: false,
        message: 'A API do Bling retornou status ' + res.statusCode + '.',
        detalhes: res.json
          ? res.json.error || res.json.mensagem || 'Falha na resposta do Bling'
          : 'Erro de comunicação',
      })
    } catch (httpErr) {
      return e.json(502, {
        success: false,
        message: 'Falha ao conectar com o servidor do Bling ERP.',
      })
    }
  },
  $apis.requireAuth(),
)

// Helper 2: Sincronização COMPLETA de Contatos e Pedidos (Somente Leitura no Bling)
routerAdd(
  'POST',
  '/backend/v1/bling/sincronizar',
  (e) => {
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    const perfil = authRecord.getString('perfil')
    if (perfil !== 'ceo_financeiro') {
      return e.json(403, {
        message:
          'Apenas administradores (CEO / Financeiro) podem executar a sincronização do Bling.',
      })
    }

    const iniciadoEm = new Date()
    const t0 = Date.now()

    // 1. Obter bling_token seguro do backend
    let blingToken = ''
    try {
      const records = $app.findRecordsByFilter('integracoes_config', '', '-created', 1, 0)
      if (records && records.length > 0) {
        blingToken = records[0].getString('bling_token')
      }
    } catch (_) {}

    if (!blingToken) {
      try {
        blingToken = $secrets.get('BLING_TOKEN') || $secrets.get('BLING_API_KEY') || ''
      } catch (_) {}
    }

    if (!blingToken) {
      return e.json(400, {
        success: false,
        message:
          'Token do Bling não configurado no backend. Configure em Configurações → Integrações.',
      })
    }

    // Criar registro de log com status 'processando'
    let logRecord = null
    try {
      const syncLogCol = $app.findCollectionByNameOrId('bling_sync_logs')
      logRecord = new Record(syncLogCol)
      logRecord.set('iniciado_em', iniciadoEm.toISOString())
      logRecord.set('usuario', authRecord.id)
      logRecord.set('status', 'processando')
      logRecord.set('clientes_lidos', 0)
      logRecord.set('clientes_criados', 0)
      logRecord.set('clientes_atualizados', 0)
      logRecord.set('clientes_ignorados', 0)
      logRecord.set('pedidos_lidos', 0)
      logRecord.set('erros', [])
      logRecord.set('mensagem_resumo', 'Sincronização iniciada...')
      $app.save(logRecord)
    } catch (errLogInit) {
      // Se falhar criação do log inicial, prossegue
    }

    // Funções auxiliares inline para tratamento dos dados
    function normalizarDoc(doc) {
      if (!doc) return ''
      return String(doc).replace(/[^\w]/g, '').trim().toLowerCase()
    }

    function normalizarEm(em) {
      if (!em) return ''
      return String(em).trim().toLowerCase()
    }

    function isConsumidorFinalNome(nome) {
      if (!nome) return false
      const n = String(nome).trim().toLowerCase()
      return n === 'consumidor final' || n === 'consumidor final.'
    }

    function mapearVendedor(vendedorBling) {
      if (!vendedorBling) return 'Renan'
      const v = String(vendedorBling)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()

      if (v === 'ALICE PAITRA COLESEL' || v === 'ALICE' || v.indexOf('ALICE PAITRA') === 0) {
        return 'Alice'
      }
      if (v === 'RENAN SOUZA' || v === 'RENAN') {
        return 'Renan'
      }
      if (
        v === 'KAROLINE' ||
        v === 'VENDAS 1' ||
        v === 'MARIA CAROLINE SANTOS' ||
        v === 'CONSUMIDOR FINAL' ||
        v === 'CONSUMIDOR FINAL.' ||
        v.indexOf('KAROLINE ') === 0 ||
        v.indexOf('MARIA CAROLINE') === 0
      ) {
        return 'Karoline (Vendas 1)'
      }
      if (v === 'VENDAS 2') {
        return 'Vendas 2'
      }
      // Qualquer outro vendedor -> Renan
      return 'Renan'
    }

    function getBlingGet(url, token, maxTentativas) {
      let tentativas = 0
      const limite = maxTentativas || 3
      while (tentativas < limite) {
        tentativas++
        try {
          const res = $http.send({
            url: url,
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer ' + token,
            },
            timeout: 15,
          })

          // Se 429 (Rate Limit): espera exponencial simples e tenta novamente
          if (res.statusCode === 429 && tentativas < limite) {
            // sleep em goja / pocketbase via loop defensivo ou prossegue
            continue
          }

          if (res.statusCode >= 500 && tentativas < limite) {
            continue
          }

          return res
        } catch (httpErr) {
          if (tentativas >= limite) {
            throw httpErr
          }
        }
      }
      throw new Error('Número máximo de tentativas atingido na chamada GET.')
    }

    const errosGerais = []
    let totalClientesLidos = 0
    let totalClientesCriados = 0
    let totalClientesAtualizados = 0
    let totalClientesIgnorados = 0
    let totalPedidosLidos = 0
    let clientesComComprasAtualizadas = 0

    try {
      // 2. Carregar todos os clientes atuais do CRM para mapeamento em memória
      const clientesExistentes = $app.findRecordsByFilter('clientes', '', '-created', 5000, 0)
      const mapPorBlingId = {}
      const mapPorDoc = {}
      const mapPorEmail = {}
      let recConsumidorFinal = null

      for (let i = 0; i < clientesExistentes.length; i++) {
        const c = clientesExistentes[i]
        const bId = c.getString('bling_id')
        if (bId) mapPorBlingId[bId] = c

        const doc = normalizarDoc(c.getString('cnpj_cpf'))
        if (doc) mapPorDoc[doc] = c

        const em = normalizarEm(c.getString('email'))
        if (em) mapPorEmail[em] = c

        const nomeEmp = c.getString('nome_empresa')
        if (isConsumidorFinalNome(nomeEmp)) {
          recConsumidorFinal = c
        }
      }

      // ==============================================================
      // 3. BUSCA DE CONTATOS DO BLING COM PAGINAÇÃO COMPLETA
      // ==============================================================
      let paginaContatos = 1
      const limiteContatos = 100
      let temMaisContatos = true
      const maxPaginasContatos = 200 // Proteção anti loop infinito

      while (temMaisContatos && paginaContatos <= maxPaginasContatos) {
        const urlContatos =
          'https://api.bling.com.br/Api/v3/contatos?pagina=' +
          paginaContatos +
          '&limite=' +
          limiteContatos

        let resContatos = null
        try {
          resContatos = getBlingGet(urlContatos, blingToken, 3)
        } catch (errReq) {
          errosGerais.push(
            'Erro de rede na página ' +
              paginaContatos +
              ' de contatos: ' +
              String(errReq.message || errReq),
          )
          break
        }

        if (resContatos.statusCode === 401 || resContatos.statusCode === 403) {
          throw new Error(
            'Token do Bling não autorizado ou expirado (status ' + resContatos.statusCode + ').',
          )
        }

        if (resContatos.statusCode !== 200) {
          errosGerais.push(
            'Bling retornou HTTP ' +
              resContatos.statusCode +
              ' ao buscar contatos na página ' +
              paginaContatos,
          )
          break
        }

        const dataJson = resContatos.json || {}
        const listaContatos = dataJson.data || []

        if (!listaContatos || listaContatos.length === 0) {
          temMaisContatos = false
          break
        }

        totalClientesLidos += listaContatos.length

        // Processar cada contato da página
        for (let idx = 0; idx < listaContatos.length; idx++) {
          const item = listaContatos[idx]
          const blingId = item.id ? String(item.id) : ''
          const nomeContatoBling = (item.nome || '').trim()
          const razaoSocialBling = (item.fantasia || item.nome || '').trim()
          const docBling = (item.numeroDocumento || '').trim()
          const docBlingLimpo = normalizarDoc(docBling)
          const emailBling = (item.email || '').trim()
          const emailBlingLimpo = normalizarEm(emailBling)
          const telBling = (item.telefone || item.celular || '').trim()

          let cidadeBling = ''
          let ufBling = ''
          if (item.endereco && item.endereco.geral) {
            cidadeBling = (item.endereco.geral.municipio || '').trim()
            ufBling = (item.endereco.geral.uf || '').trim()
          }

          let vendedorBlingNome = ''
          if (item.vendedor && item.vendedor.nome) {
            vendedorBlingNome = item.vendedor.nome
          }

          const vendedorCrm = mapearVendedor(vendedorBlingNome)
          const isConsumidor =
            isConsumidorFinalNome(razaoSocialBling) || isConsumidorFinalNome(nomeContatoBling)

          // PRIORIDADE DE MATCHING:
          // 1) bling_id
          // 2) CPF/CNPJ normalizado
          // 3) E-mail normalizado
          // 4) Consumidor Final unificado
          let clienteExistente = null

          if (isConsumidor && recConsumidorFinal) {
            clienteExistente = recConsumidorFinal
          } else {
            if (blingId && mapPorBlingId[blingId]) {
              clienteExistente = mapPorBlingId[blingId]
            } else if (docBlingLimpo && mapPorDoc[docBlingLimpo]) {
              clienteExistente = mapPorDoc[docBlingLimpo]
            } else if (emailBlingLimpo && mapPorEmail[emailBlingLimpo]) {
              clienteExistente = mapPorEmail[emailBlingLimpo]
            }
          }

          const clientesCol = $app.findCollectionByNameOrId('clientes')

          if (clienteExistente) {
            // ATUALIZAR mantendo dados locais válidos (não sobrescrever com vazio)
            let alterou = false

            if (blingId && clienteExistente.getString('bling_id') !== blingId) {
              clienteExistente.set('bling_id', blingId)
              alterou = true
            }

            if (docBling && !clienteExistente.getString('cnpj_cpf')) {
              clienteExistente.set('cnpj_cpf', docBling)
              alterou = true
            }

            if (emailBling && !clienteExistente.getString('email')) {
              clienteExistente.set('email', emailBling)
              alterou = true
            }

            if (telBling && !clienteExistente.getString('telefone')) {
              clienteExistente.set('telefone', telBling)
              alterou = true
            }

            if (cidadeBling && !clienteExistente.getString('cidade')) {
              clienteExistente.set('cidade', cidadeBling)
              alterou = true
            }

            if (ufBling && !clienteExistente.getString('estado')) {
              clienteExistente.set('estado', ufBling.substring(0, 2).toUpperCase())
              alterou = true
            }

            // Vendedor: se Consumidor Final -> Karoline (Vendas 1); senão se vendedor estiver vazio ou for renan fallback
            if (isConsumidor) {
              if (clienteExistente.getString('vendedor') !== 'Karoline (Vendas 1)') {
                clienteExistente.set('vendedor', 'Karoline (Vendas 1)')
                alterou = true
              }
            } else if (vendedorBlingNome) {
              clienteExistente.set('vendedor', vendedorCrm)
              alterou = true
            }

            if (alterou) {
              try {
                $app.save(clienteExistente)
                totalClientesAtualizados++
              } catch (errUpd) {
                errosGerais.push(
                  'Erro ao atualizar cliente ' +
                    clienteExistente.id +
                    ': ' +
                    String(errUpd.message || errUpd),
                )
              }
            } else {
              totalClientesIgnorados++
            }

            // Manter índices em memória atualizados
            if (blingId) mapPorBlingId[blingId] = clienteExistente
            if (docBlingLimpo) mapPorDoc[docBlingLimpo] = clienteExistente
            if (emailBlingLimpo) mapPorEmail[emailBlingLimpo] = clienteExistente
            if (isConsumidor) recConsumidorFinal = clienteExistente
          } else {
            // CRIAR NOVO CLIENTE
            const novoCliente = new Record(clientesCol)
            const nomeEmpresaFinal =
              razaoSocialBling ||
              nomeContatoBling ||
              (isConsumidor ? 'Consumidor Final' : 'Cliente Sem Nome')

            novoCliente.set('nome_empresa', nomeEmpresaFinal)
            novoCliente.set('nome_contato', nomeContatoBling || nomeEmpresaFinal)
            if (blingId) novoCliente.set('bling_id', blingId)
            if (docBling) novoCliente.set('cnpj_cpf', docBling)
            if (emailBling) novoCliente.set('email', emailBling)
            if (telBling) novoCliente.set('telefone', telBling)
            if (cidadeBling) novoCliente.set('cidade', cidadeBling)
            if (ufBling) novoCliente.set('estado', ufBling.substring(0, 2).toUpperCase())

            const vendFinal = isConsumidor ? 'Karoline (Vendas 1)' : vendedorCrm
            novoCliente.set('vendedor', vendFinal)
            novoCliente.set('status_cliente', 'para_reativacao')
            novoCliente.set('tipo_contato', 'cliente')
            novoCliente.set('valor_total_vendas', 0)
            novoCliente.set('valor_total_compras', 0)
            novoCliente.set('responsavel_id', authRecord.id)

            try {
              $app.save(novoCliente)
              totalClientesCriados++

              if (blingId) mapPorBlingId[blingId] = novoCliente
              if (docBlingLimpo) mapPorDoc[docBlingLimpo] = novoCliente
              if (emailBlingLimpo) mapPorEmail[emailBlingLimpo] = novoCliente
              if (isConsumidor) recConsumidorFinal = novoCliente
            } catch (errIns) {
              errosGerais.push(
                'Erro ao inserir cliente "' +
                  nomeEmpresaFinal +
                  '": ' +
                  String(errIns.message || errIns),
              )
            }
          }
        }

        if (listaContatos.length < limiteContatos) {
          temMaisContatos = false
        } else {
          paginaContatos++
        }
      }

      // ==============================================================
      // 4. BUSCA DE PEDIDOS DE VENDA DO BLING COM PAGINAÇÃO COMPLETA
      // ==============================================================
      // Idempotência: calcula histórico consolidado de vendas por cliente a partir dos pedidos lidos
      const dadosVendasPorCliente = {} // clienteId -> { primeiraCompra, ultimaCompra, totalVendas, qtdVendas }

      let paginaPedidos = 1
      const limitePedidos = 100
      let temMaisPedidos = true
      const maxPaginasPedidos = 300 // Proteção anti loop

      while (temMaisPedidos && paginaPedidos <= maxPaginasPedidos) {
        const urlPedidos =
          'https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=' +
          paginaPedidos +
          '&limite=' +
          limitePedidos

        let resPedidos = null
        try {
          resPedidos = getBlingGet(urlPedidos, blingToken, 3)
        } catch (errPedReq) {
          errosGerais.push(
            'Erro de rede na página ' +
              paginaPedidos +
              ' de pedidos: ' +
              String(errPedReq.message || errPedReq),
          )
          break
        }

        if (resPedidos.statusCode === 401 || resPedidos.statusCode === 403) {
          throw new Error('Token do Bling não autorizado ou expirado ao ler pedidos.')
        }

        if (resPedidos.statusCode !== 200) {
          errosGerais.push(
            'Bling retornou HTTP ' +
              resPedidos.statusCode +
              ' ao buscar pedidos na página ' +
              paginaPedidos,
          )
          break
        }

        const dataPedidosJson = resPedidos.json || {}
        const listaPedidos = dataPedidosJson.data || []

        if (!listaPedidos || listaPedidos.length === 0) {
          temMaisPedidos = false
          break
        }

        totalPedidosLidos += listaPedidos.length

        for (let p = 0; p < listaPedidos.length; p++) {
          const ped = listaPedidos[p]
          const contatoPed = ped.contato || {}
          const pedBlingId = contatoPed.id ? String(contatoPed.id) : ''
          const pedDoc = normalizarDoc(contatoPed.numeroDocumento || '')
          const pedNome = (contatoPed.nome || '').trim()
          const dataPedidoStr = (ped.data || '').trim() // YYYY-MM-DD
          const totalPedido = Number(ped.total || ped.valor || 0)

          // Matching do cliente para o pedido
          let clienteAlvo = null
          if (pedBlingId && mapPorBlingId[pedBlingId]) {
            clienteAlvo = mapPorBlingId[pedBlingId]
          } else if (pedDoc && mapPorDoc[pedDoc]) {
            clienteAlvo = mapPorDoc[pedDoc]
          } else if (isConsumidorFinalNome(pedNome) && recConsumidorFinal) {
            clienteAlvo = recConsumidorFinal
          }

          if (clienteAlvo) {
            const cid = clienteAlvo.id
            if (!dadosVendasPorCliente[cid]) {
              dadosVendasPorCliente[cid] = {
                cliente: clienteAlvo,
                totalVendas: 0,
                qtdVendas: 0,
                primeiraCompra: dataPedidoStr,
                ultimaCompra: dataPedidoStr,
              }
            }

            const reg = dadosVendasPorCliente[cid]
            reg.totalVendas += totalPedido
            reg.qtdVendas += 1

            if (dataPedidoStr) {
              if (!reg.primeiraCompra || dataPedidoStr < reg.primeiraCompra) {
                reg.primeiraCompra = dataPedidoStr
              }
              if (!reg.ultimaCompra || dataPedidoStr > reg.ultimaCompra) {
                reg.ultimaCompra = dataPedidoStr
              }
            }
          }
        }

        if (listaPedidos.length < limitePedidos) {
          temMaisPedidos = false
        } else {
          paginaPedidos++
        }
      }

      // ==============================================================
      // 5. ATUALIZAR STATUS E HISTÓRICO COMERCIAL NOS CLIENTES (IDEMPOTENTE)
      // ==============================================================
      const agora = new Date()
      const limite6Meses = new Date(agora)
      limite6Meses.setMonth(limite6Meses.getMonth() - 6)

      const chavesClientes = Object.keys(dadosVendasPorCliente)
      for (let k = 0; k < chavesClientes.length; k++) {
        const cId = chavesClientes[k]
        const inf = dadosVendasPorCliente[cId]
        const cliRec = inf.cliente

        let modificado = false

        // Idempotência: fixa o total computado das vendas da API do Bling
        const totalArredondado = Math.round(inf.totalVendas * 100) / 100
        if (cliRec.getInt('valor_total_vendas') !== totalArredondado) {
          cliRec.set('valor_total_vendas', totalArredondado)
          modificado = true
        }

        if (inf.primeiraCompra && cliRec.getString('data_primeira_compra') !== inf.primeiraCompra) {
          cliRec.set('data_primeira_compra', inf.primeiraCompra)
          modificado = true
        }

        if (inf.ultimaCompra) {
          if (cliRec.getString('data_ultima_compra') !== inf.ultimaCompra) {
            cliRec.set('data_ultima_compra', inf.ultimaCompra)
            modificado = true
          }

          // Regra de Status: 6 meses
          const dUltima = new Date(inf.ultimaCompra)
          if (!isNaN(dUltima.getTime())) {
            const statusCalculado = dUltima >= limite6Meses ? 'ativo' : 'para_reativacao'
            if (cliRec.getString('status_cliente') !== statusCalculado) {
              cliRec.set('status_cliente', statusCalculado)
              cliRec.set('status', statusCalculado === 'ativo' ? 'ativo' : 'rascunho')
              modificado = true
            }
          }
        }

        if (modificado) {
          try {
            $app.save(cliRec)
            clientesComComprasAtualizadas++
          } catch (errCliSave) {
            errosGerais.push(
              'Erro ao consolidar compras no cliente ' +
                cId +
                ': ' +
                String(errCliSave.message || errCliSave),
            )
          }
        }
      }

      // ==============================================================
      // 6. FINALIZAR LOG DE SINCRONIZAÇÃO
      // ==============================================================
      const duracaoMs = Date.now() - t0
      const statusFinal =
        errosGerais.length === 0 ? 'sucesso' : totalClientesLidos > 0 ? 'sucesso_parcial' : 'erro'

      const msgResumo =
        'Concluído em ' +
        Math.round(duracaoMs / 1000) +
        's: ' +
        totalClientesLidos +
        ' contatos lidos, ' +
        totalClientesCriados +
        ' criados, ' +
        totalClientesAtualizados +
        ' atualizados, ' +
        totalPedidosLidos +
        ' pedidos lidos, ' +
        clientesComComprasAtualizadas +
        ' clientes com vendas atualizadas. Erros: ' +
        errosGerais.length

      if (logRecord) {
        try {
          logRecord.set('finalizado_em', new Date().toISOString())
          logRecord.set('status', statusFinal)
          logRecord.set('clientes_lidos', totalClientesLidos)
          logRecord.set('clientes_criados', totalClientesCriados)
          logRecord.set('clientes_atualizados', totalClientesAtualizados)
          logRecord.set('clientes_ignorados', totalClientesIgnorados)
          logRecord.set('pedidos_lidos', totalPedidosLidos)
          logRecord.set('erros', errosGerais.slice(0, 50))
          logRecord.set('duracao_ms', duracaoMs)
          logRecord.set('mensagem_resumo', msgResumo)
          $app.save(logRecord)
        } catch (_) {}
      }

      return e.json(200, {
        success: statusFinal !== 'erro',
        status: statusFinal,
        iniciado_em: iniciadoEm.toISOString(),
        finalizado_em: new Date().toISOString(),
        duracao_ms: duracaoMs,
        clientes_consultados: totalClientesLidos,
        clientes_criados: totalClientesCriados,
        clientes_atualizados: totalClientesAtualizados,
        clientes_ignorados: totalClientesIgnorados,
        pedidos_consultados: totalPedidosLidos,
        clientes_com_compras_atualizadas: clientesComComprasAtualizadas,
        erros: errosGerais,
        mensagem: msgResumo,
      })
    } catch (errFatal) {
      const duracaoMs = Date.now() - t0
      const msgErro = String(errFatal.message || errFatal)
      errosGerais.push('Erro crítico: ' + msgErro)

      if (logRecord) {
        try {
          logRecord.set('finalizado_em', new Date().toISOString())
          logRecord.set('status', 'erro')
          logRecord.set('erros', errosGerais)
          logRecord.set('duracao_ms', duracaoMs)
          logRecord.set('mensagem_resumo', 'Falha na sincronização: ' + msgErro)
          $app.save(logRecord)
        } catch (_) {}
      }

      return e.json(500, {
        success: false,
        status: 'erro',
        duracao_ms: duracaoMs,
        mensagem: 'Erro ao executar sincronização do Bling ERP: ' + msgErro,
        erros: errosGerais,
      })
    }
  },
  $apis.requireAuth(),
)
