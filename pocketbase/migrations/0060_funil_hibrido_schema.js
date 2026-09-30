/**
 * Migração 0060: Funil Híbrido - Campos de Origem, Unicidade e Motivos de Perda Bling
 *
 * 1. Expandir coleção 'oportunidades':
 *    - origem: select (crm, bling) - default 'crm'
 *    - tipo_origem: select (crm, bling_proposta, bling_pedido) - default 'crm'
 *    - bling_proposta_id: text (unique sparse)
 *    - bling_pedido_id: text (unique sparse)
 *    - data_origem: date
 *
 * 2. Índices de unicidade em oportunidades:
 *    - idx_oportunidades_origem: CREATE INDEX idx_oportunidades_origem ON oportunidades (origem)
 *    - idx_oportunidades_tipo_origem: CREATE INDEX idx_oportunidades_tipo_origem ON oportunidades (tipo_origem)
 *    - idx_oportunidades_bling_proposta_id: CREATE UNIQUE INDEX idx_oportunidades_bling_proposta_id ON oportunidades (bling_proposta_id) WHERE bling_proposta_id != '' AND bling_proposta_id IS NOT NULL
 *    - idx_oportunidades_bling_pedido_id: CREATE UNIQUE INDEX idx_oportunidades_bling_pedido_id ON oportunidades (bling_pedido_id) WHERE bling_pedido_id != '' AND bling_pedido_id IS NOT NULL
 *
 * 3. Motivos de perda Bling pré-cadastrados (se não existirem):
 *    - "Não aprovada no Bling"
 *    - "Cancelado no Bling"
 *
 * 4. Inicializar oportunidades existentes como origem='crm', tipo_origem='crm'
 */

migrate(
  (app) => {
    // 1. Atualizar coleção oportunidades
    const opCol = app.findCollectionByNameOrId('oportunidades')

    if (!opCol.fields.getByName('origem')) {
      opCol.fields.add(
        new SelectField({
          name: 'origem',
          values: ['crm', 'bling'],
          maxSelect: 1,
        }),
      )
    }

    if (!opCol.fields.getByName('tipo_origem')) {
      opCol.fields.add(
        new SelectField({
          name: 'tipo_origem',
          values: ['crm', 'bling_proposta', 'bling_pedido'],
          maxSelect: 1,
        }),
      )
    }

    if (!opCol.fields.getByName('bling_proposta_id')) {
      opCol.fields.add(
        new TextField({
          name: 'bling_proposta_id',
        }),
      )
    }

    if (!opCol.fields.getByName('bling_pedido_id')) {
      opCol.fields.add(
        new TextField({
          name: 'bling_pedido_id',
        }),
      )
    }

    if (!opCol.fields.getByName('data_origem')) {
      opCol.fields.add(
        new DateField({
          name: 'data_origem',
        }),
      )
    }

    // Índices
    const indicesExistentes = opCol.indexes || []
    const novosIndices = [
      'CREATE INDEX idx_oportunidades_origem ON oportunidades (origem)',
      'CREATE INDEX idx_oportunidades_tipo_origem ON oportunidades (tipo_origem)',
      "CREATE UNIQUE INDEX idx_oportunidades_bling_proposta ON oportunidades (bling_proposta_id) WHERE bling_proposta_id != '' AND bling_proposta_id IS NOT NULL",
      "CREATE UNIQUE INDEX idx_oportunidades_bling_pedido ON oportunidades (bling_pedido_id) WHERE bling_pedido_id != '' AND bling_pedido_id IS NOT NULL",
    ]

    for (let i = 0; i < novosIndices.length; i++) {
      const idxSql = novosIndices[i]
      const idxNome = idxSql.split(' ')[2]
      let jaExiste = false
      for (let j = 0; j < indicesExistentes.length; j++) {
        if (indicesExistentes[j].indexOf(idxNome) !== -1) {
          jaExiste = true
          break
        }
      }
      if (!jaExiste) {
        indicesExistentes.push(idxSql)
      }
    }
    opCol.indexes = indicesExistentes

    app.save(opCol)

    // Atualizar regras de update e delete para proteger registros origem=bling contra mutação via API direta
    // Apenas CEO/Financeiro pode atualizar ou excluir, E somente se a oportunidade não for de origem Bling
    opCol.updateRule =
      "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro' && (origem = '' || origem = 'crm')"
    opCol.deleteRule =
      "@request.auth.id != '' && @request.auth.perfil = 'ceo_financeiro' && (origem = '' || origem = 'crm')"
    app.save(opCol)

    // Inicializar oportunidades antigas sem origem
    try {
      app
        .db()
        .newQuery("UPDATE oportunidades SET origem = 'crm' WHERE origem IS NULL OR origem = ''")
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE oportunidades SET tipo_origem = 'crm' WHERE tipo_origem IS NULL OR tipo_origem = ''",
        )
        .execute()
    } catch (_) {}

    // 2. Criar motivos de perda Bling se não existirem
    try {
      const motivosCol = app.findCollectionByNameOrId('motivos_perda')
      const motivosPadrao = ['Não aprovada no Bling', 'Cancelado no Bling']

      for (let m = 0; m < motivosPadrao.length; m++) {
        const desc = motivosPadrao[m]
        let existe = null
        try {
          existe = app.findFirstRecordByData('motivos_perda', 'descricao', desc)
        } catch (_) {}

        if (!existe) {
          const novoMotivo = new Record(motivosCol)
          novoMotivo.set('descricao', desc)
          app.save(novoMotivo)
        }
      }
    } catch (_) {}
  },
  (app) => {
    // Reversão
    try {
      const opCol = app.findCollectionByNameOrId('oportunidades')
      const campos = [
        'origem',
        'tipo_origem',
        'bling_proposta_id',
        'bling_pedido_id',
        'data_origem',
      ]
      for (let i = 0; i < campos.length; i++) {
        try {
          opCol.fields.removeByName(campos[i])
        } catch (_) {}
      }
      app.save(opCol)
    } catch (_) {}
  },
)
