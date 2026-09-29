migrate(
  (app) => {
    // Atualiza todos os registros da tabela usuarios para emailVisibility = 1 (true)
    // Como 'usuarios' é auth collection do PocketBase, emailVisibility controla
    // se o campo email é serializado na resposta de list/view para outros usuários autenticados.
    // Criar/editar/listar usuários já é restrito a ceo_financeiro por RLS/regras da coleção.
    app.db().newQuery('UPDATE usuarios SET emailVisibility = 1').execute()
  },
  (app) => {
    // Reversão opcional (não estritamente necessária)
    app.db().newQuery('UPDATE usuarios SET emailVisibility = 0').execute()
  },
)
