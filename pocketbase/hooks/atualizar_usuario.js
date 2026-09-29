/**
 * Endpoint do backend: POST /backend/v1/atualizar_usuario
 *
 * Atualiza um usuário existente na coleção 'usuarios' (auth collection do PocketBase).
 *
 * Motivo e Funcionamento:
 * - Em auth collections do PocketBase, requisições de PATCH feitas diretamente pelo cliente
 *   autenticado exigem o campo 'oldPassword' se 'password'/'passwordConfirm' forem fornecidos,
 *   além de disparar validações adicionais de email caso pertença a outro usuário.
 * - Este endpoint é executado pelo $app em contexto de superusuário no backend.
 * - EXIGE autenticação ($apis.requireAuth()).
 * - Apenas 'ceo_financeiro' tem permissão para atualizar dados de outros usuários (ou redefinir senha/perfil).
 * - Usuário não pode desativar seu próprio usuário por este endpoint.
 * - Atualiza nome, email, perfil, status (ativo) e redefine senha de forma segura caso fornecida (mínimo 8 caracteres).
 * - Garante emailVisibility = true e verified = true para evitar perda de visibilidade na API.
 */

routerAdd(
  'POST',
  '/backend/v1/atualizar_usuario',
  (e) => {
    // 1. Verificar autenticação
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { message: 'Usuário não autenticado.' })
    }

    // 2. Verificar se o perfil é ceo_financeiro
    const perfilSolicitante = authRecord.getString('perfil')
    if (perfilSolicitante !== 'ceo_financeiro') {
      return e.json(403, {
        message: 'Apenas usuários com perfil ceo_financeiro podem editar usuários.',
      })
    }

    // 3. Obter payload da requisição
    const body = e.requestInfo().body || {}
    const id = (body.id || '').toString().trim()
    const nome = (body.nome || '').toString().trim()
    const email = (body.email || '').toString().trim().toLowerCase()
    const perfil = (body.perfil || '').toString().trim()
    const ativo = body.ativo !== false
    const password = body.password ? body.password.toString() : ''
    const passwordConfirm = body.passwordConfirm ? body.passwordConfirm.toString() : ''

    if (!id) {
      return e.json(400, { message: 'O campo "id" do usuário é obrigatório.' })
    }
    if (!nome) {
      return e.json(400, { message: 'O campo "nome" é obrigatório.' })
    }
    if (!email) {
      return e.json(400, { message: 'O campo "email" é obrigatório.' })
    }
    if (!perfil) {
      return e.json(400, { message: 'O campo "perfil" é obrigatório.' })
    }

    // Regra: Não permitir que o usuário logado desative seu próprio acesso
    if (authRecord.id === id && !ativo) {
      return e.json(400, { message: 'Você não pode desativar seu próprio usuário.' })
    }

    const perfisValidos = [
      'ceo_financeiro',
      'coordenador_vendas',
      'compras_grandes_clientes',
      'estoque',
      'vendedor_1',
      'vendedor_2',
    ]
    if (!perfisValidos.includes(perfil)) {
      return e.json(400, { message: 'Perfil inválido: ' + perfil })
    }

    // 4. Localizar o registro a ser editado
    let record = null
    try {
      record = $app.findFirstRecordByData('usuarios', 'id', id)
    } catch (_) {
      return e.json(404, { message: 'Usuário não encontrado.' })
    }

    // 5. Verificar duplicidade de e-mail se foi alterado
    const emailAtual = (record.email() || '').trim().toLowerCase()
    if (email !== emailAtual) {
      try {
        const existente = $app.findAuthRecordByEmail('usuarios', email)
        if (existente && existente.id !== id) {
          return e.json(400, { message: 'Já existe um usuário cadastrado com este e-mail.' })
        }
      } catch (_) {
        // Email livre
      }
    }

    // 6. Validar senha se informada
    if (password || passwordConfirm) {
      if (password.length < 8) {
        return e.json(400, { message: 'A nova senha deve ter no mínimo 8 caracteres.' })
      }
      if (password !== passwordConfirm) {
        return e.json(400, { message: 'A confirmação de senha não confere.' })
      }
    }

    // 7. Aplicar modificações via $app (contexto superusuário)
    record.set('nome', nome)
    record.set('perfil', perfil)
    record.set('ativo', ativo)
    record.setEmail(email)
    record.setEmailVisibility(true)
    record.setVerified(true)

    if (password) {
      record.setPassword(password)
    }

    try {
      $app.save(record)
    } catch (err) {
      return e.json(500, {
        message: 'Erro ao atualizar usuário no banco: ' + (err && err.message ? err.message : err),
      })
    }

    // 8. Retornar resposta consistente
    return e.json(200, {
      success: true,
      message: 'Usuário atualizado com sucesso.',
      usuario: {
        id: record.id,
        nome: record.getString('nome'),
        email: record.email(),
        perfil: record.getString('perfil'),
        ativo: record.getBool('ativo'),
        created: record.getString('created'),
        updated: record.getString('updated'),
      },
    })
  },
  $apis.requireAuth(),
)
