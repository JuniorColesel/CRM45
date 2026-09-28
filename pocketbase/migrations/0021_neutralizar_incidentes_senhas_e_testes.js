migrate(
  (app) => {
    // Diagnóstico seguro e neutralização inicial das migrações 0016-0020
    // 1. Limpar registros de teste em webhook_logs criados por test_env_vars / 0020
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM webhook_logs WHERE provider = 'env_test' OR external_id LIKE 'test-env-%'",
        )
        .execute()
    } catch (_) {}

    // 2. Inspecionar e neutralizar senhas das contas CEO
    // Gerar senhas aleatórias fortes e únicas para Alice Paitra e Junior Colesel
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-+'

    function gerarSenhaForte() {
      let pass = ''
      for (let i = 0; i < 24; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return pass
    }

    // Atualizar Junior Colesel
    try {
      const jr = app.findAuthRecordByEmail('usuarios', 'junior.colesel@coleselengenharia.com')
      if (jr) {
        jr.setPassword(gerarSenhaForte())
        // Invalidar tokens/sessões anteriores forçando novo tokenKey
        jr.set('tokenKey', $security.randomString(30))
        app.save(jr)
      }
    } catch (_) {}

    // Atualizar Alice Paitra
    try {
      const alice = app.findAuthRecordByEmail('usuarios', 'alice.paitra@coleselengenharia.com')
      if (alice) {
        alice.setPassword(gerarSenhaForte())
        // Invalidar tokens/sessões anteriores forçando novo tokenKey
        alice.set('tokenKey', $security.randomString(30))
        app.save(alice)
      }
    } catch (_) {}
  },
  (app) => {
    // No-op rollback
  },
)
