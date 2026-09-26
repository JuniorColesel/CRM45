migrate(
  (app) => {
    // 1. Popular "etapas_funil" com exatamente 5 registros:
    // - "Prospecção" (ordem 1, cor azul #2563EB)
    // - "Qualificação" (ordem 2, cor roxo #7C3AED)
    // - "Proposta" (ordem 3, cor verde #16A34A)
    // - "Negociação" (ordem 4, cor vermelho #DC2626)
    // - "Fechado" (ordem 5, cor verde escuro #166534)
    const etapasFunilCol = app.findCollectionByNameOrId('etapas_funil')

    const etapas = [
      { nome: 'Prospecção', ordem: 1, cor: '#2563EB' },
      { nome: 'Qualificação', ordem: 2, cor: '#7C3AED' },
      { nome: 'Proposta', ordem: 3, cor: '#16A34A' },
      { nome: 'Negociação', ordem: 4, cor: '#DC2626' },
      { nome: 'Fechado', ordem: 5, cor: '#166534' },
    ]

    for (const etapa of etapas) {
      try {
        app.findFirstRecordByData('etapas_funil', 'ordem', etapa.ordem)
      } catch (_) {
        const record = new Record(etapasFunilCol)
        record.set('nome', etapa.nome)
        record.set('ordem', etapa.ordem)
        record.set('cor', etapa.cor)
        app.save(record)
      }
    }

    // 2. Popular "motivos_perda" com exatamente 5 registros:
    // "Sem interesse", "Preço alto", "Concorrente ganhou", "Sem budget", "Outro"
    const motivosPerdaCol = app.findCollectionByNameOrId('motivos_perda')

    const motivos = ['Sem interesse', 'Preço alto', 'Concorrente ganhou', 'Sem budget', 'Outro']

    for (const descricao of motivos) {
      try {
        app.findFirstRecordByData('motivos_perda', 'descricao', descricao)
      } catch (_) {
        const record = new Record(motivosPerdaCol)
        record.set('descricao', descricao)
        app.save(record)
      }
    }
  },
  (app) => {
    try {
      const etapas = [1, 2, 3, 4, 5]
      for (const ordem of etapas) {
        try {
          const rec = app.findFirstRecordByData('etapas_funil', 'ordem', ordem)
          app.delete(rec)
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const motivos = ['Sem interesse', 'Preço alto', 'Concorrente ganhou', 'Sem budget', 'Outro']
      for (const descricao of motivos) {
        try {
          const rec = app.findFirstRecordByData('motivos_perda', 'descricao', descricao)
          app.delete(rec)
        } catch (_) {}
      }
    } catch (_) {}
  },
)
