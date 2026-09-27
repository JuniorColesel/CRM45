/**
 * Endpoint do backend: POST /backend/v1/criar_usuario
 *
 * Requisitos:
 * a) Gera uma senha aleatória forte (mínimo 12 caracteres, com letras maiúsculas/minúsculas, números e símbolos)
 * b) Cria o usuário de autenticação (usuário PocketBase auth na coleção 'usuarios') com essa senha
 * c) Insere o registro na coleção usuarios
 * d) Retorna a senha gerada APENAS uma vez, no response da chamada
 * e) Só pode ser chamada pelo perfil ceo_financeiro
 *
 * ⚠ Regras de hooks do PocketBase:
 * - Não usar funções ou variáveis de nível de módulo dentro dos callbacks de routerAdd
 * - Toda a lógica deve ficar inline dentro do callback
 */

routerAdd(
  'POST',
  '/backend/v1/criar_usuario',
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
        message: 'Apenas usuários com perfil ceo_financeiro podem criar novos usuários.',
      })
    }

    // 3. Obter payload da requisição
    const body = e.requestInfo().body || {}
    const nome = (body.nome || '').toString().trim()
    const email = (body.email || '').toString().trim().toLowerCase()
    const perfil = (body.perfil || '').toString().trim()
    const ativo = body.ativo !== false

    if (!nome) {
      return e.json(400, { message: 'O campo "nome" é obrigatório.' })
    }
    if (!email) {
      return e.json(400, { message: 'O campo "email" é obrigatório.' })
    }
    if (!perfil) {
      return e.json(400, { message: 'O campo "perfil" é obrigatório.' })
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

    // 4. Verificar se o email já existe na coleção usuarios
    try {
      const usuarioExistente = $app.findAuthRecordByEmail('usuarios', email)
      if (usuarioExistente) {
        return e.json(400, { message: 'Já existe um usuário cadastrado com este e-mail.' })
      }
    } catch (_) {
      // Não encontrado, prosseguir
    }

    // 5. Gerar senha aleatória forte (mínimo 12 caracteres, com maiúsculas, minúsculas, números e símbolos)
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const lowers = 'abcdefghijkmnopqrstuvwxyz'
    const numbers = '23456789'
    const symbols = '!@#$%&*_-+'
    const allChars = uppers + lowers + numbers + symbols

    let generatedPassword = ''
    for (let i = 0; i < 2; i++) {
      generatedPassword += uppers.charAt(Math.floor(Math.random() * uppers.length))
      generatedPassword += lowers.charAt(Math.floor(Math.random() * lowers.length))
      generatedPassword += numbers.charAt(Math.floor(Math.random() * numbers.length))
      generatedPassword += symbols.charAt(Math.floor(Math.random() * symbols.length))
    }
    while (generatedPassword.length < 16) {
      generatedPassword += allChars.charAt(Math.floor(Math.random() * allChars.length))
    }
    const passArray = generatedPassword.split('')
    for (let i = passArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = passArray[i]
      passArray[i] = passArray[j]
      passArray[j] = tmp
    }
    const senhaFinal = passArray.join('')

    // 6. Criar o registro na coleção usuarios
    const usuariosCol = $app.findCollectionByNameOrId('usuarios')
    const record = new Record(usuariosCol)
    record.setEmail(email)
    record.setPassword(senhaFinal)
    record.setVerified(true)
    record.set('nome', nome)
    record.set('perfil', perfil)
    record.set('ativo', ativo)

    try {
      $app.save(record)
    } catch (err) {
      return e.json(500, {
        message: 'Erro ao salvar usuário no banco: ' + (err && err.message ? err.message : err),
      })
    }

    // 7. Retornar os dados do usuário e a senha gerada APENAS nesta resposta
    return e.json(201, {
      success: true,
      usuario: {
        id: record.id,
        nome: record.getString('nome'),
        email: record.email(),
        perfil: record.getString('perfil'),
        ativo: record.getBool('ativo'),
        created: record.getString('created'),
        updated: record.getString('updated'),
      },
      senha_gerada: senhaFinal,
    })
  },
  $apis.requireAuth(),
)
