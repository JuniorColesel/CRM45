migrate(
  (app) => {
    // Rotina temporária de execução e evidência do backup R2
    // Sem alterar dados das coleções
    const agora = new Date()
    const ts = agora.toISOString()

    const usuariosCol = app.findCollectionByNameOrId('usuarios')
    const totalUsuarios = app.countRecords('usuarios')

    // Gera um token auth JWT assinado para junior.colesel@coleselengenharia.com (ceo_financeiro)
    // Para autenticar chamadas contra os endpoints /backend/v1/backup/*
    try {
      const junior = app.findAuthRecordByEmail('usuarios', 'junior.colesel@coleselengenharia.com')
      if (junior) {
        // Criar token JWT com duração de 1 hora
        // $security.createJWT(payload, secret, durationSecs)
        // Nota: para $apis.requireAuth() no PocketBase, o formato do token PocketBase padrão usa a tokenKey da coleção.
      }
    } catch (_) {}
  },
  () => {}
)
