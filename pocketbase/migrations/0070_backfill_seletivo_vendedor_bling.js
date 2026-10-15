/// <reference path="../pb_data/types.d.ts" />

/**
 * Migração 0070: Backfill seletivo de vendedor e alinhamento de oportunidades Bling
 *
 * Regras (Partes B, H, I):
 * 1. Clientes originados do Bling (com bling_id preenchido) que receberam "Renan" por fallback histórico:
 *    - Se não houver vendedor confirmado do Bling e o registro tiver recebido fallback antigo,
 *      limpar o vendedor para '' ("Sem vendedor").
 *    - Clientes sem bling_id (CRM-native) permanecem INALTERADOS (fonte da verdade é o CRM).
 * 2. Pedidos em bling_pedidos:
 *    - Se vendedor_crm foi mapeado com Renan indevidamente por fallback sem vendedor_bling, limpar.
 * 3. Propostas em bling_propostas:
 *    - Se vendedor_crm foi mapeado com Renan indevidamente por fallback sem vendedor_bling, limpar.
 * 4. Oportunidades com origem = 'bling':
 *    - Se tipo_origem = 'bling_pedido': o vendedor da oportunidade DEVE refletir bling_pedidos.vendedor_crm.
 *      Se o pedido não tiver vendedor comercial mapeado, oportunidade.vendedor fica vazio.
 *    - Se tipo_origem = 'bling_proposta': o vendedor da oportunidade DEVE refletir bling_propostas.vendedor_crm.
 *      Se a proposta não tiver vendedor comercial mapeado, oportunidade.vendedor fica vazio.
 *    - Remover qualquer atribuição indevida do usuário Renan feita por fallback automático.
 */
migrate((app) => {
  // 1. Resolver usuário ID dos vendedores comerciais ativos
  let idAlice = ''
  let idRenan = ''
  let idKaroline = ''
  let idVendas2 = ''

  try {
    const usuarios = app.findRecordsByFilter('usuarios', 'ativo = true', 'nome', 50, 0)
    for (let u = 0; u < usuarios.length; u++) {
      const uRec = usuarios[u]
      const uId = uRec.id
      const uNome = uRec.getString('nome') || ''
      const uEmail = uRec.getString('email') || ''
      const uPerfil = uRec.getString('perfil') || ''

      if (uNome.indexOf('Alice') !== -1 || uEmail.indexOf('alice') !== -1) {
        idAlice = uId
      } else if (uNome.indexOf('Renan') !== -1 || uEmail.indexOf('renan') !== -1) {
        idRenan = uId
      } else if (
        uPerfil === 'vendedor_1' ||
        uNome.indexOf('Vendas 1') !== -1 ||
        uNome.indexOf('Karoline') !== -1
      ) {
        idKaroline = uId
      } else if (uPerfil === 'vendedor_2' || uNome.indexOf('Vendas 2') !== -1) {
        idVendas2 = uId
      }
    }
  } catch (errU) {
    console.error('[MIGRATION-0070] Erro ao buscar usuários:', errU)
  }

  // 2. Clientes Bling com fallback histórico "Renan":
  // Clientes com bling_id != '' que estão com vendedor = 'Renan' sem correspondência direta em bling_pedidos ou bling_propostas
  // onde o vendedor real não seja Renan
  // Limpar clientes com bling_id onde vendedor = 'Renan'
  // mas bling_pedidos.vendedor_crm não seja 'Renan'
  try {
    app
      .db()
      .newQuery(`
      UPDATE clientes
      SET vendedor = ''
      WHERE bling_id != ''
        AND bling_id IS NOT NULL
        AND vendedor = 'Renan'
        AND id NOT IN (
          SELECT DISTINCT bp.cliente_id
          FROM bling_pedidos bp
          WHERE bp.vendedor_crm = 'Renan' AND bp.cliente_id IS NOT NULL AND bp.cliente_id != ''
        )
        AND id NOT IN (
          SELECT DISTINCT bp2.cliente_id
          FROM bling_propostas bp2
          WHERE bp2.vendedor_crm = 'Renan' AND bp2.cliente_id IS NOT NULL AND bp2.cliente_id != ''
        )
    `)
      .execute()
  } catch (errCli) {
    console.error('[MIGRATION-0070] Erro ao limpar fallback Renan em clientes Bling:', errCli)
  }

  // 3. bling_pedidos: garantir que pedidos sem vendedor_bling não tenham vendedor_crm atribuído por fallback
  try {
    app
      .db()
      .newQuery(`
      UPDATE bling_pedidos
      SET vendedor_crm = ''
      WHERE (vendedor_bling = '' OR vendedor_bling IS NULL)
        AND vendedor_crm = 'Renan'
    `)
      .execute()
  } catch (errPed) {
    console.error('[MIGRATION-0070] Erro ao limpar vendedor_crm em bling_pedidos:', errPed)
  }

  // 4. bling_propostas: garantir que propostas sem vendedor_bling não tenham vendedor_crm atribuído por fallback
  try {
    app
      .db()
      .newQuery(`
      UPDATE bling_propostas
      SET vendedor_crm = ''
      WHERE (vendedor_bling = '' OR vendedor_bling IS NULL)
        AND vendedor_crm = 'Renan'
    `)
      .execute()
  } catch (errProp) {
    console.error('[MIGRATION-0070] Erro ao limpar vendedor_crm em bling_propostas:', errProp)
  }

  // 5. Oportunidades de origem Bling:
  // - Oportunidades originadas de pedido Bling (tipo_origem = 'bling_pedido'):
  //   sincronizar vendedor com base estrita no pedido
  if (idRenan) {
    // Limpar vendedor em oportunidades onde o pedido NÃO tem vendedor_crm = 'Renan'
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = ''
      WHERE tipo_origem = 'bling_pedido'
        AND vendedor = {:idRenan}
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.vendedor_crm != 'Renan' OR bp.vendedor_crm = '' OR bp.vendedor_crm IS NULL
        )
    `)
      .bind({ idRenan: idRenan })
      .execute()

    // Idem para propostas
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = ''
      WHERE tipo_origem = 'bling_proposta'
        AND vendedor = {:idRenan}
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.vendedor_crm != 'Renan' OR bp.vendedor_crm = '' OR bp.vendedor_crm IS NULL
        )
    `)
      .bind({ idRenan: idRenan })
      .execute()
  }

  // 6. Atualizar oportunidades Bling cujo pedido ou proposta possua vendedor real mapeado
  const mapaVendedores = [
    { nome: 'Alice', userId: idAlice },
    { nome: 'Renan', userId: idRenan },
    { nome: 'Karoline (Vendas 1)', userId: idKaroline },
    { nome: 'Vendas 2', userId: idVendas2 },
  ]

  for (let m = 0; m < mapaVendedores.length; m++) {
    const itemV = mapaVendedores[m]
    if (!itemV.userId) continue

    // Pedidos
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = {:uId}
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.vendedor_crm = {:vNome}
        )
        AND (vendedor != {:uId} OR vendedor IS NULL OR vendedor = '')
    `)
      .bind({ uId: itemV.userId, vNome: itemV.nome })
      .execute()

    // Propostas
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = {:uId}
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.vendedor_crm = {:vNome}
        )
        AND (vendedor != {:uId} OR vendedor IS NULL OR vendedor = '')
    `)
      .bind({ uId: itemV.userId, vNome: itemV.nome })
      .execute()
  }

  // 7. Qualquer oportunidade Bling cujo documento esteja sem vendedor_crm -> campo vendedor deve ser vazio
  try {
    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = ''
      WHERE tipo_origem = 'bling_pedido'
        AND bling_pedido_id IN (
          SELECT bp.bling_pedido_id FROM bling_pedidos bp
          WHERE bp.vendedor_crm = '' OR bp.vendedor_crm IS NULL
        )
        AND vendedor != '' AND vendedor IS NOT NULL
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE oportunidades
      SET vendedor = ''
      WHERE tipo_origem = 'bling_proposta'
        AND bling_proposta_id IN (
          SELECT bp.bling_proposta_id FROM bling_propostas bp
          WHERE bp.vendedor_crm = '' OR bp.vendedor_crm IS NULL
        )
        AND vendedor != '' AND vendedor IS NOT NULL
    `)
      .execute()
  } catch (errLimp) {
    console.error('[MIGRATION-0070] Erro ao limpar oportunidades sem vendedor:', errLimp)
  }
})
