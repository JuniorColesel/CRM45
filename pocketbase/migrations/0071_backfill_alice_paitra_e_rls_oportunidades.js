/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0071: Backfill Único do Legado para Alice Paitra e Correção de RLS de Oportunidades
 *
 * PARTE B — BACKFILL ÚNICO DO LEGADO PARA ALICE PAITRA:
 * - Registros históricos que estão "Sem vendedor" (vendedor vazio ou nulo) na base existente NO MOMENTO DA EXECUÇÃO
 *   são atribuídos à vendedora "Alice Paitra" (ou "Alice" nos selects textuais de clientes).
 * - Escopo:
 *   1. clientes (com bling_id ou históricos) onde vendedor IS NULL OR vendedor = '' -> vendedor = 'Alice'
 *   2. bling_pedidos onde vendedor_crm IS NULL OR vendedor_crm = '' -> vendedor_crm = 'Alice', responsavel_id = Alice.id
 *   3. bling_propostas onde vendedor_crm IS NULL OR vendedor_crm = '' -> vendedor_crm = 'Alice', responsavel_id = Alice.id
 *   4. oportunidades derivadas ou históricas onde vendedor IS NULL OR vendedor = '' -> vendedor = Alice.id
 * - NÃO sobrescreve registros que já possuem vendedor confiável (Renan, Karoline, Vendas 2, etc).
 * - Registros de auditoria: grava contagens reais antes/depois no console/log.
 *
 * PARTE C — PERMISSÕES DO FUNIL CRM-NATIVE (RLS no PocketBase):
 * - ceo_financeiro: pode editar e excluir oportunidades CRM-native
 * - coordenador_vendas: pode editar e excluir oportunidades CRM-native da equipe
 * - vendedor_1 / vendedor_2: pode editar oportunidade CRM-native atribuída a ele (responsavel_id = @request.auth.id || vendedor = @request.auth.id)
 * - Oportunidades Bling: SOMENTE LEITURA para todos (origem != 'bling' && tipo_origem != 'bling_pedido' && tipo_origem != 'bling_proposta')
 */
migrate((app) => {
  // 1. Identificar ID do usuário Alice Paitra
  let idAlice = '7nngwxctdc2209b' // ID conhecido de Alice Paitra
  try {
    const usuarios = app.findRecordsByFilter('usuarios', 'ativo = true', 'nome', 50, 0)
    for (let u = 0; u < usuarios.length; u++) {
      const uRec = usuarios[u]
      const uNome = uRec.getString('nome') || ''
      const uEmail = uRec.getString('email') || ''
      if (uNome.indexOf('Alice') !== -1 || uEmail.indexOf('alice') !== -1) {
        idAlice = uRec.id
        break
      }
    }
  } catch (errU) {
    console.error('[MIGRATION-0071] Erro ao buscar usuário Alice:', errU)
  }

  // -------------------------------------------------------------
  // PARTE B: BACKFILL ÚNICO HISTÓRICO PARA ALICE PAITRA
  // -------------------------------------------------------------
  let clientesSemVendedorAntes = 0
  let pedidosSemVendedorAntes = 0
  let propostasSemVendedorAntes = 0
  let opsSemVendedorAntes = 0

  let clientesAtribuidosAlice = 0
  let pedidosAtribuidosAlice = 0
  let propostasAtribuidasAlice = 0
  let opsAtribuidasAlice = 0

  try {
    // 1. Clientes sem vendedor
    const rowCliAntes = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery("SELECT count(*) as total FROM clientes WHERE vendedor IS NULL OR vendedor = ''")
      .one(rowCliAntes)
    clientesSemVendedorAntes = Number(rowCliAntes.total) || 0

    const resCli = app
      .db()
      .newQuery("UPDATE clientes SET vendedor = 'Alice' WHERE vendedor IS NULL OR vendedor = ''")
      .execute()
    clientesAtribuidosAlice = resCli && resCli.rowsAffected ? resCli.rowsAffected() : 0

    // 2. bling_pedidos sem vendedor_crm
    const rowPedAntes = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(
        "SELECT count(*) as total FROM bling_pedidos WHERE vendedor_crm IS NULL OR vendedor_crm = ''",
      )
      .one(rowPedAntes)
    pedidosSemVendedorAntes = Number(rowPedAntes.total) || 0

    const resPed = app
      .db()
      .newQuery(`
      UPDATE bling_pedidos
      SET vendedor_crm = 'Alice',
          responsavel_id = CASE WHEN responsavel_id IS NULL OR responsavel_id = '' THEN {:idAlice} ELSE responsavel_id END
      WHERE vendedor_crm IS NULL OR vendedor_crm = ''
    `)
      .bind({ idAlice })
      .execute()
    pedidosAtribuidosAlice = resPed && resPed.rowsAffected ? resPed.rowsAffected() : 0

    // 3. bling_propostas sem vendedor_crm
    const rowPropAntes = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(
        "SELECT count(*) as total FROM bling_propostas WHERE vendedor_crm IS NULL OR vendedor_crm = ''",
      )
      .one(rowPropAntes)
    propostasSemVendedorAntes = Number(rowPropAntes.total) || 0

    const resProp = app
      .db()
      .newQuery(`
      UPDATE bling_propostas
      SET vendedor_crm = 'Alice',
          responsavel_id = CASE WHEN responsavel_id IS NULL OR responsavel_id = '' THEN {:idAlice} ELSE responsavel_id END
      WHERE vendedor_crm IS NULL OR vendedor_crm = ''
    `)
      .bind({ idAlice })
      .execute()
    propostasAtribuidasAlice = resProp && resProp.rowsAffected ? resProp.rowsAffected() : 0

    // 4. Oportunidades sem vendedor
    const rowOpsAntes = new DynamicModel({ total: 0 })
    app
      .db()
      .newQuery(
        "SELECT count(*) as total FROM oportunidades WHERE vendedor IS NULL OR vendedor = ''",
      )
      .one(rowOpsAntes)
    opsSemVendedorAntes = Number(rowOpsAntes.total) || 0

    const resOps = app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = {:idAlice}
      WHERE vendedor IS NULL OR vendedor = ''
    `)
      .bind({ idAlice })
      .execute()
    opsAtribuidasAlice = resOps && resOps.rowsAffected ? resOps.rowsAffected() : 0

    console.log('[MIGRATION-0071] Backfill Alice executado com sucesso:')
    console.log(
      `- Clientes sem vendedor antes: ${clientesSemVendedorAntes} -> Atribuídos: ${clientesAtribuidosAlice}`,
    )
    console.log(
      `- Pedidos Bling sem vendedor antes: ${pedidosSemVendedorAntes} -> Atribuídos: ${pedidosAtribuidosAlice}`,
    )
    console.log(
      `- Propostas Bling sem vendedor antes: ${propostasSemVendedorAntes} -> Atribuídos: ${propostasAtribuidasAlice}`,
    )
    console.log(
      `- Oportunidades sem vendedor antes: ${opsSemVendedorAntes} -> Atribuídos: ${opsAtribuidasAlice}`,
    )
  } catch (errBackfill) {
    console.error('[MIGRATION-0071] Erro durante o backfill Alice:', errBackfill)
  }

  // -------------------------------------------------------------
  // PARTE C: ATUALIZAR RLS DE OPORTUNIDADES
  // -------------------------------------------------------------
  try {
    const opCol = app.findCollectionByNameOrId('oportunidades')

    // Regra de UPDATE:
    // 1. Bloqueia registros com origem Bling: (origem = '' || origem = 'crm') && tipo_origem != 'bling_pedido' && tipo_origem != 'bling_proposta'
    // 2. Permite ceo_financeiro e coordenador_vendas
    // 3. Permite o próprio responsável ou vendedor da oportunidade
    const crmOrigemRule =
      "(origem = '' || origem = 'crm') && tipo_origem != 'bling_pedido' && tipo_origem != 'bling_proposta'"
    const perfilRule =
      "@request.auth.perfil = 'ceo_financeiro' || @request.auth.perfil = 'coordenador_vendas' || responsavel_id = @request.auth.id || vendedor = @request.auth.id"

    opCol.updateRule = `@request.auth.id != '' && (${crmOrigemRule}) && (${perfilRule})`

    // Regra de DELETE:
    // Apenas ceo_financeiro, coordenador_vendas ou o próprio dono podem excluir, e somente se for CRM-native
    opCol.deleteRule = `@request.auth.id != '' && (${crmOrigemRule}) && (${perfilRule})`

    // Regra de CREATE:
    // Qualquer usuário autenticado que não seja estoque
    opCol.createRule = "@request.auth.id != '' && @request.auth.perfil != 'estoque'"

    app.save(opCol)
    console.log('[MIGRATION-0071] Regras RLS de oportunidades atualizadas com sucesso.')
  } catch (errRls) {
    console.error('[MIGRATION-0071] Erro ao atualizar regras RLS de oportunidades:', errRls)
  }
})
