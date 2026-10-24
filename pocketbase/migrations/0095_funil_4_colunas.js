/**
 * Migração 0095: Reestruturação do Funil Comercial para 4 Colunas Canônicas (Tarefa 9A)
 *
 * Colunas canônicas finais nesta ordem:
 * 1. Aguardando (propostas Aguardando, status aberto)
 * 2. Não aprovado (propostas Não aprovado, status perdido, motivo 'Não aprovada no Bling')
 * 3. Pedidos em aberto (pedidos Em aberto, status ganho)
 * 4. Atendido (pedidos Atendido, status ganho)
 *
 * Etapas antigas mantidas no banco com ordem >= 99 para preservação histórica,
 * enquanto as 4 canônicas recebem ordem 1..4.
 * Oportunidades existentes são reclassificadas para as etapas canônicas.
 * Propostas em rascunho e pedidos cancelados (ou outras situações fora do funil)
 * têm suas oportunidades desvinculadas das 4 colunas canônicas ou marcadas fora do funil.
 *
 * Idempotente, no-op em banco vazio, NUNCA lançar throw.
 */

migrate(
  (app) => {
    try {
      const etapasCol = app.findCollectionByNameOrId('etapas_funil')
      if (!etapasCol) return

      // 1. Mapeamento e criação/renomeação das etapas
      // Buscamos todas as etapas atuais
      const etapasAtuais = app.findRecordsByFilter('etapas_funil', '', 'ordem', 50, 0)
      const mapaPorNome = {}
      const mapaPorId = {}
      for (let i = 0; i < etapasAtuais.length; i++) {
        const e = etapasAtuais[i]
        mapaPorNome[e.getString('nome')] = e
        mapaPorId[e.id] = e
      }

      // Vamos localizar ou renomear para obter exatamente as 4 canônicas:
      // Canônica 1: "Aguardando" (antiga "Negociação" se existir, ou registro existente "Aguardando")
      let recAguardando = mapaPorNome['Aguardando'] || mapaPorNome['Negociação']
      if (recAguardando) {
        recAguardando.set('nome', 'Aguardando')
        recAguardando.set('ordem', 1)
        recAguardando.set('cor', '#EC4899')
        app.save(recAguardando)
      } else {
        recAguardando = new Record(etapasCol)
        recAguardando.set('nome', 'Aguardando')
        recAguardando.set('ordem', 1)
        recAguardando.set('cor', '#EC4899')
        app.save(recAguardando)
      }

      // Canônica 2: "Não aprovado" (antiga "Proposta" se existir, ou "Não aprovado")
      let recNaoAprovado = mapaPorNome['Não aprovado'] || mapaPorNome['Proposta']
      if (recNaoAprovado) {
        recNaoAprovado.set('nome', 'Não aprovado')
        recNaoAprovado.set('ordem', 2)
        recNaoAprovado.set('cor', '#EF4444')
        app.save(recNaoAprovado)
      } else {
        recNaoAprovado = new Record(etapasCol)
        recNaoAprovado.set('nome', 'Não aprovado')
        recNaoAprovado.set('ordem', 2)
        recNaoAprovado.set('cor', '#EF4444')
        app.save(recNaoAprovado)
      }

      // Canônica 3: "Pedidos em aberto" (antiga "Em aberto Bling")
      let recPedidosEmAberto = mapaPorNome['Pedidos em aberto'] || mapaPorNome['Em aberto Bling']
      if (recPedidosEmAberto) {
        recPedidosEmAberto.set('nome', 'Pedidos em aberto')
        recPedidosEmAberto.set('ordem', 3)
        recPedidosEmAberto.set('cor', '#06B6D4')
        app.save(recPedidosEmAberto)
      } else {
        recPedidosEmAberto = new Record(etapasCol)
        recPedidosEmAberto.set('nome', 'Pedidos em aberto')
        recPedidosEmAberto.set('ordem', 3)
        recPedidosEmAberto.set('cor', '#06B6D4')
        app.save(recPedidosEmAberto)
      }

      // Canônica 4: "Atendido" (antiga "Fechado")
      let recAtendido = mapaPorNome['Atendido'] || mapaPorNome['Fechado']
      if (recAtendido) {
        recAtendido.set('nome', 'Atendido')
        recAtendido.set('ordem', 4)
        recAtendido.set('cor', '#10B981')
        app.save(recAtendido)
      } else {
        recAtendido = new Record(etapasCol)
        recAtendido.set('nome', 'Atendido')
        recAtendido.set('ordem', 4)
        recAtendido.set('cor', '#10B981')
        app.save(recAtendido)
      }

      const idAguardando = recAguardando.id
      const idNaoAprovado = recNaoAprovado.id
      const idPedidosEmAberto = recPedidosEmAberto.id
      const idAtendido = recAtendido.id

      // Outras etapas (Prospecção, Qualificação, Perdido, etc) recebem ordem 99+ para ficarem fora do funil canônico
      const etapasRestantes = app.findRecordsByFilter('etapas_funil', '', 'ordem', 50, 0)
      let ordemOutras = 90
      for (let j = 0; j < etapasRestantes.length; j++) {
        const er = etapasRestantes[j]
        if (
          er.id !== idAguardando &&
          er.id !== idNaoAprovado &&
          er.id !== idPedidosEmAberto &&
          er.id !== idAtendido
        ) {
          ordemOutras++
          er.set('ordem', ordemOutras)
          app.save(er)
        }
      }

      // 2. Garantir motivo de perda "Não aprovada no Bling"
      let motivoNaoAprovadaId = ''
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

      // 3. Reclassificar Oportunidades:
      // A) Propostas com situacao 'Aguardando' -> etapa 'Aguardando' (status 'aberto')
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:idAguardando},
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
        .bind({ idAguardando: idAguardando })
        .execute()

      // B) Propostas com situacao 'Não aprovado' / 'nao_aprovada' -> etapa 'Não aprovado' (status 'perdido', motivo 'Não aprovada no Bling')
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:idNaoAprovado},
          status = 'perdido',
          motivo_perda_id = {:motivoNaoAprovada},
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado = 'nao_aprovada'
          )
      `)
        .bind({
          idNaoAprovado: idNaoAprovado,
          motivoNaoAprovada: motivoNaoAprovadaId || '',
        })
        .execute()

      // C) Pedidos situacao.id=6 / 'Em aberto' -> etapa 'Pedidos em aberto' (status 'ganho')
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:idPedidosEmAberto},
          status = 'ganho',
          motivo_perda_id = '',
          data_fechamento = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome = 'Em aberto' OR bp.situacao_bling_id = '6'
          )
      `)
        .bind({ idPedidosEmAberto: idPedidosEmAberto })
        .execute()

      // D) Pedidos situacao.id=9 / 'Atendido' -> etapa 'Atendido' (status 'ganho')
      app
        .db()
        .newQuery(`
        UPDATE oportunidades
        SET
          etapa_id = {:idAtendido},
          status = 'ganho',
          motivo_perda_id = '',
          updated = strftime('%Y-%m-%d %H:%M:%f', 'now')
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome = 'Atendido' OR bp.situacao_bling_id = '9'
          )
      `)
        .bind({ idAtendido: idAtendido })
        .execute()

      // E) Remover propostas Rascunho/Aprovado/Concluído/Pendente do funil ativo
      // Conforme especificação: "TODO o resto FORA do funil: propostas Rascunho/Pendente/Aprovado/Concluído, pedidos 12 Cancelado e demais situações"
      // Também marcar bling_propostas.visivel_funil = 0 para esses casos
      app
        .db()
        .newQuery(`
        UPDATE bling_propostas
        SET visivel_funil = 0
        WHERE status_normalizado NOT IN ('aguardando', 'nao_aprovada')
      `)
        .execute()

      // Para oportunidades criadas por propostas que não sejam Aguardando nem Não aprovado:
      // Excluir as oportunidades materializadas dessas propostas para não poluir o funil
      app
        .db()
        .newQuery(`
        DELETE FROM oportunidades
        WHERE tipo_origem = 'bling_proposta'
          AND bling_proposta_id IN (
            SELECT bp.bling_proposta_id FROM bling_propostas bp
            WHERE bp.status_normalizado NOT IN ('aguardando', 'nao_aprovada')
          )
      `)
        .execute()

      // F) Pedidos Cancelados (12) ou outras situações fora do funil:
      // Deletar oportunidades de pedidos cancelados ou desconhecidos para não ficarem no funil
      app
        .db()
        .newQuery(`
        DELETE FROM oportunidades
        WHERE tipo_origem = 'bling_pedido'
          AND bling_pedido_id IN (
            SELECT bp.bling_pedido_id FROM bling_pedidos bp
            WHERE bp.situacao_bling_nome NOT IN ('Em aberto', 'Atendido')
              AND bp.situacao_bling_id NOT IN ('6', '9')
          )
      `)
        .execute()

      console.log('[MIGRATION 0095] Funil 4 colunas reestruturado com sucesso.')
    } catch (e) {
      console.log(
        '[MIGRATION 0095] Erro defensivo ignorado (sem throw): ' +
          String(e && e.message ? e.message : e),
      )
    }
  },
  (app) => {
    // Reversão no-op
  },
)
