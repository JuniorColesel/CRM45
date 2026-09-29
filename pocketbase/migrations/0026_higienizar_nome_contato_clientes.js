migrate(
  (app) => {
    // 1. Obter todos os registros da coleção 'clientes'
    const records = app.findRecordsByFilter('clientes', '', '', 0, 0)
    const total = records.length

    let countLimpos = 0
    let countPreservados = 0

    // Regex auxiliares
    // Strings que começam com dígito (ex.: "2026-08-01", "12345678000199", "197.80")
    const regexComecaComDigito = /^\d/

    // Strings que contêm apenas números, barras, hífens, pontos, parênteses ou espaços
    // ex: "000.000.000-00", "(42) 9999-9999", "123456/78"
    const regexApenasDigitosEPontuacao = /^[\d\s/\-.()]+$/

    // Datas em formato ISO (YYYY-MM-DD ou YYYY-MM-DD HH:mm:ss...) ou BR (DD/MM/YYYY)
    const regexDataIso = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(.*)$/
    const regexDataBr = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(.*)$/

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const rawNome = record.getString('nome_contato')
      const nomeTrim = (rawNome || '').trim()

      // Se já estava vazio / só espaços, garantir string vazia
      if (!nomeTrim) {
        if (rawNome !== '') {
          record.set('nome_contato', '')
          app.save(record)
          countLimpos++
        } else {
          // Já era vazia
          countPreservados++
        }
        continue
      }

      const nomeUpper = nomeTrim.toUpperCase()
      const cnpjCpfTrim = (record.getString('cnpj_cpf') || '').trim().toUpperCase()
      const nomeEmpresaTrim = (record.getString('nome_empresa') || '').trim().toUpperCase()

      let deveLimpar = false

      // 1) Strings que começam com dígito
      if (regexComecaComDigito.test(nomeTrim)) {
        deveLimpar = true
      }
      // 2) Strings que contêm apenas números, barras, hífens, pontos ou parênteses
      else if (regexApenasDigitosEPontuacao.test(nomeTrim)) {
        deveLimpar = true
      }
      // 3) Strings que são datas em formato ISO ou BR
      else if (regexDataIso.test(nomeTrim) || regexDataBr.test(nomeTrim)) {
        deveLimpar = true
      }
      // 4) Strings que são iguais ao cnpj_cpf ou ao nome_empresa (comparação case-insensitive, com trim)
      else if (
        (cnpjCpfTrim && nomeUpper === cnpjCpfTrim) ||
        (nomeEmpresaTrim && nomeUpper === nomeEmpresaTrim)
      ) {
        deveLimpar = true
      }

      // Regra de segurança/preservação expressa no requisito:
      // "NÃO limpar valores em CAIXA ALTA que sejam só letras — ex.: "POUPANCA E INVESTIMENTO",
      // "COOPERATIVA DE CREDITO" devem permanecer (o usuário vai tratá-los manualmente depois pela tela de Clientes)."
      // "PRESERVA intactos os registros onde nome_contato parece nome de pessoa (contém letras, espaços, acentos, sem padrão numérico dominante)."
      // Se não caiu nos critérios inválidos acima, deve permanecer!

      if (deveLimpar) {
        record.set('nome_contato', '')
        app.save(record)
        countLimpos++
      } else {
        countPreservados++
      }
    }

    console.log(
      `[Higienizacao nome_contato] Total de registros clientes: ${total}. Registros limpos: ${countLimpos}. Registros preservados: ${countPreservados}.`,
    )
  },
  (_app) => {
    // Migração de higienização de dados unidirecional/one-off.
  },
)
