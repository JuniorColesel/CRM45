/**
 * Endpoint de provisionamento dos CEOs (executável no backend, idempotente)
 * POST /backend/v1/provisionar_ceos
 *
 * a) Verifica se existem usuários com emails junior.colesel@coleselengenharia.com e alice.paitra@coleselengenharia.com
 * b) Se não existirem, cria ambos como ceo_financeiro, ativos, com senha temporária aleatória forte
 * c) Se já existirem, não faz nada
 * d) Retorna relatório de quem foi criado ou já existia
 *
 * Idempotente e seguro.
 */

routerAdd('POST', '/backend/v1/provisionar_ceos', (e) => {
  const usuariosCol = $app.findCollectionByNameOrId('usuarios')

  const ceosAlvo = [
    {
      nome: 'Junior Colesel',
      email: 'junior.colesel@coleselengenharia.com',
    },
    {
      nome: 'Alice Paitra',
      email: 'alice.paitra@coleselengenharia.com',
    },
  ]

  const resultado = []

  for (let i = 0; i < ceosAlvo.length; i++) {
    const alvo = ceosAlvo[i]
    let existe = false
    try {
      const existente = $app.findAuthRecordByEmail('usuarios', alvo.email)
      if (existente) {
        existe = true
        resultado.push({
          email: alvo.email,
          nome: alvo.nome,
          status: 'ja_existia',
          id: existente.id,
        })
      }
    } catch (_) {
      // Não existe
    }

    if (!existe) {
      // Gerar senha aleatória forte
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-+'
      let randPass = ''
      for (let c = 0; c < 16; c++) {
        randPass += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      const rec = new Record(usuariosCol)
      rec.setEmail(alvo.email)
      rec.setPassword(randPass)
      rec.setVerified(true)
      rec.set('nome', alvo.nome)
      rec.set('perfil', 'ceo_financeiro')
      rec.set('ativo', true)
      $app.save(rec)

      resultado.push({
        email: alvo.email,
        nome: alvo.nome,
        status: 'criado',
        id: rec.id,
      })
    }
  }

  return e.json(200, {
    success: true,
    message: 'Rotina de provisionamento de CEOs executada com sucesso.',
    resultados: resultado,
  })
})
