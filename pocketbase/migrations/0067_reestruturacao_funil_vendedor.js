/**
 * Migração 0067: Reestruturação do Funil Comercial - Etapas Bling, Vendedor e Perdido
 *
 * 1. Garante existência e ordem das 7 etapas visuais do Funil Comercial:
 *    1. Prospecção (ordem 1, #3B82F6)
 *    2. Qualificação (ordem 2, #8B5CF6)
 *    3. Proposta (ordem 3, #F59E0B)
 *    4. Negociação (ordem 4, #EC4899)
 *    5. Em aberto Bling (ordem 5, #06B6D4)
 *    6. Fechado (ordem 6, #10B981)
 *    7. Perdido (ordem 7, #EF4444)
 *
 * 2. Garante motivos de perda:
 *    - "Cancelado no Bling"
 *    - "Não aprovada no Bling"
 *
 * 3. Reclassifica oportunidades existentes do Bling para a nova estrutura:
 *    - Pedido 'Em aberto' (situação 6) -> etapa 'Em aberto Bling', status 'ganho'
 *    - Pedido 'Atendido' (situação 9) -> etapa 'Fechado', status 'ganho'
 *    - Pedido 'Cancelado' (situação 12) -> etapa 'Perdido', status 'perdido', motivo 'Cancelado no Bling'
 *    - Proposta 'rascunho' -> etapa 'Proposta', status 'aberto'
 *    - Proposta 'aguardando' -> etapa 'Negociação', status 'aberto'
 *    - Proposta 'nao_aprovada' -> etapa 'Perdido', status 'perdido', motivo 'Não aprovada no Bling'
 *
 * 4. Propaga vendedor:
 *    - Se oportunidade.vendedor estiver vazio, busca de cliente.vendedor / bling_pedidos / bling_propostas
 *      e mapeia para o usuarioId correspondente.
 */

migrate(
  (app) => {
    // 1. Configurar as 7 etapas
    const etapasDef = [
      { nome: 'Prospecção', ordem: 1, cor: '#3B82F6' },
      { nome: 'Qualificação', ordem: 2, cor: '#8B5CF6' },
      { nome: 'Proposta', ordem: 3, cor: '#F59E0B' },
      { nome: 'Negociação', ordem: 4, cor: '#EC4899' },
      { nome: 'Em aberto Bling', ordem: 5, cor: '#06B6D4' },
      { nome: 'Fechado', ordem: 6, cor: '#10B981' },
      { nome: 'Perdido', ordem: 7, cor: '#EF4444' },
    ]

    const etapasCol = app.findCollectionByNameOrId('etapas_funil')
    const mapaEtapasId = {}

    for (let i = 0; i < etapasDef.length; i++) {
      const def = etapasDef[i]
      let rec = null
      try {
        rec = app.findFirstRecordByData('etapas_funil', 'nome', def.nome)
      } catch (_) {}

      if (!rec) {
        rec = new Record(etapasCol)
        rec.set('nome', def.nome)
      }
      rec.set('ordem', def.ordem)
      rec.set('cor', def.cor)
      app.save(rec)
      mapaEtapasId[def.nome] = rec.id
    }

    const etapaEmAbertoBlingId = mapaEtapasId['Em aberto Bling']
    const etapaFechadoId = mapaEtapasId['Fechado']
    const etapaPerdidoId = mapaEtapasId['Perdido']
    const etapaPropostaId = mapaEtapasId['Proposta']
    const etapaNegociacaoId = mapaEtapasId['Negociação']

    // 2. Garantir motivos de perda
    let motivoNaoAprovadaId = ''
    let motivoCanceladoId = ''
    try {
      const mna = app.findFirstRecordByData('motivos_perda', 'descricao', 'Não aprovada no Bling')
      if (mna) motivoNaoAprovadaId = mna.id
    } catch (_) {}
    if (!motivoNaoAprovadaId) {
      try {
        const mpCol = app.findCollectionByNameOrId('motivos_perda')
        const recM = new Record(mpCol)
        recM.set('descricao', 'Não aprovada no Bling')
        app.save(recM)
        motivoNaoAprovadaId = recM.id
      } catch (_) {}
    }

    try {
      const mc = app.findFirstRecordByData('motivos_perda', 'descricao', 'Cancelado no Bling')
      if (mc) motivoCanceladoId = mc.id
    } catch (_) {}
    if (!motivoCanceladoId) {
      try {
        const mpCol = app.findCollectionByNameOrId('motivos_perda')
        const recM = new Record(mpCol)
        recM.set('descricao', 'Cancelado no Bling')
        app.save(recM)
        motivoCanceladoId = recM.id
      } catch (_) {}
    }

    // 3. Reclassificar oportunidades existentes
    // NOTA SQLite PocketBase: campos de texto/relation sem valor usam '' (string vazia) em vez de NULL
    // 3.1 Pedidos 'Em aberto' -> Etapa 'Em aberto Bling' (status 'ganho', sem data_fechamento forçada)
    if (etapaEmAbertoBlingId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaEmAberto},
          status = 'ganho',
          data_fechamento = '',
          motivo_perda_id = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6'
          )
      `)
        .bind({ etapaEmAberto: etapaEmAbertoBlingId })
        .execute()
    }

    // 3.2 Pedidos 'Atendido' -> Etapa 'Fechado' (status 'ganho')
    if (etapaFechadoId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaFechado},
          status = 'ganho',
          motivo_perda_id = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9'
          )
      `)
        .bind({ etapaFechado: etapaFechadoId })
        .execute()
    }

    // 3.3 Pedidos 'Cancelado' -> Etapa 'Perdido' (status 'perdido', motivo 'Cancelado no Bling')
    if (etapaPerdidoId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaPerdido},
          status = 'perdido',
          motivo_perda_id = {:motivoCancelado},
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome = 'Cancelado' OR bp.situacao_bling_id = '12'
          )
      `)
        .bind({ etapaPerdido: etapaPerdidoId, motivoCancelado: motivoCanceladoId || '' })
        .execute()
    }

    // 3.4 Propostas 'rascunho' -> Etapa 'Proposta' (status 'aberto')
    if (etapaPropostaId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaProposta},
          status = 'aberto',
          motivo_perda_id = '',
          data_fechamento = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado = 'rascunho'
          )
      `)
        .bind({ etapaProposta: etapaPropostaId })
        .execute()
    }

    // 3.5 Propostas 'aguardando' -> Etapa 'Negociação' (status 'aberto')
    if (etapaNegociacaoId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaNegociacao},
          status = 'aberto',
          motivo_perda_id = '',
          data_fechamento = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado = 'aguardando'
          )
      `)
        .bind({ etapaNegociacao: etapaNegociacaoId })
        .execute()
    }

    // 3.6 Propostas 'nao_aprovada' -> Etapa 'Perdido' (status 'perdido', motivo 'Não aprovada no Bling')
    if (etapaPerdidoId) {
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:etapaPerdido},
          status = 'perdido',
          motivo_perda_id = {:motivoNaoAprovada},
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado = 'nao_aprovada'
          )
      `)
        .bind({ etapaPerdido: etapaPerdidoId, motivoNaoAprovada: motivoNaoAprovadaId || '' })
        .execute()
    }

    // 4. Mapear vendedor comercial para o campo 'vendedor' da oportunidade
    // Se o cliente associado tem vendedor, associamos o usuarioId correspondente
    try {
      const usuarios = app.findRecordsByFilter('usuarios', 'ativo = true', 'nome', 50, 0)
      const mapVendedorUser = {}
      for (let u = 0; u < usuarios.length; u++) {
        const uRec = usuarios[u]
        const uId = uRec.id
        const uNome = uRec.getString('nome') || ''
        const uEmail = uRec.getString('email') || ''
        const uPerfil = uRec.getString('perfil') || ''

        if (uNome.indexOf('Alice') !== -1 || uEmail.indexOf('alice') !== -1) {
          mapVendedorUser['Alice'] = uId
        } else if (uNome.indexOf('Renan') !== -1 || uEmail.indexOf('renan') !== -1) {
          mapVendedorUser['Renan'] = uId
        } else if (
          uPerfil === 'vendedor_1' ||
          uNome.indexOf('Vendas 1') !== -1 ||
          uNome.indexOf('Karoline') !== -1
        ) {
          mapVendedorUser['Karoline (Vendas 1)'] = uId
        } else if (uPerfil === 'vendedor_2' || uNome.indexOf('Vendas 2') !== -1) {
          mapVendedorUser['Vendas 2'] = uId
        }
      }

      for (const [vNome, uId] of Object.entries(mapVendedorUser)) {
        if (!uId) continue
        // Atualiza oportunidades onde cliente.vendedor = vNome e oportunidades.vendedor está vazio
        app
          .db()
          .newQuery(`
          UPDATE oportunidades
          SET vendedor = {:userId}
          WHERE (vendedor = '' OR vendedor IS NULL)
            AND cliente_id IN (
              SELECT c.id FROM clientes c WHERE c.vendedor = {:vNome}
            )
        `)
          .bind({ userId: uId, vNome: vNome })
          .execute()

        // Também atualiza se bling_pedidos tem vendedor_crm = vNome
        app
          .db()
          .newQuery(`
          UPDATE oportunidades
          SET vendedor = {:userId}
          WHERE (vendedor = '' OR vendedor IS NULL)
            AND bling_pedido_id IN (
              SELECT bp.bling_pedido_id FROM bling_pedidos bp WHERE bp.vendedor_crm = {:vNome}
            )
        `)
          .bind({ userId: uId, vNome: vNome })
          .execute()

        // Também atualiza se bling_propostas tem vendedor_crm = vNome
        app
          .db()
          .newQuery(`
          UPDATE oportunidades
          SET vendedor = {:userId}
          WHERE (vendedor = '' OR vendedor IS NULL)
            AND bling_proposta_id IN (
              SELECT bp.bling_proposta_id FROM bling_propostas bp WHERE bp.vendedor_crm = {:vNome}
            )
        `)
          .bind({ userId: uId, vNome: vNome })
          .execute()
      }
    } catch (errVend) {
      console.log('[MIGRATION 0067] Aviso no mapeamento de vendedor: ' + String(errVend))
    }
  },
  (app) => {
    // Reversão segura
  },
)
