migrate(
  (app) => {
    const usuarios = app.findCollectionByNameOrId('usuarios')

    // Idempotente: não duplicar se já existir pelo email
    try {
      app.findAuthRecordByEmail('usuarios', 'junior.colesel@coleselengenharia.com')
      return // Usuário já existe, nada a fazer
    } catch (_) {
      // Continua se não existir
    }

    const record = new Record(usuarios)
    record.setEmail('junior.colesel@coleselengenharia.com')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('nome', 'Junior Colesel')
    record.set('perfil', 'ceo_financeiro')
    record.set('ativo', true)

    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('usuarios', 'junior.colesel@coleselengenharia.com')
      app.delete(record)
    } catch (_) {}
  },
)
