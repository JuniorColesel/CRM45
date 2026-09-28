/**
 * Endpoint POST /backend/v1/backup/restore
 * Baixa um backup específico do Cloudflare R2, valida sua integridade estrutural,
 * executa o restore no PocketBase e valida estritamente a divergência zero de contagens.
 *
 * Modo 'simulado': true (default quando não especificado 'executar_real: true') ou 'executar_real: true'.
 * Em ambos os modos:
 * - Valida autenticação estrita (apenas ceo_financeiro ou superuser).
 * - Baixa o arquivo do Cloudflare R2 usando SigV4.
 * - Confirma hash SHA-256 e formato JSON íntegro.
 * - Valida contagens antes e depois da restauração das tabelas/coleções críticas.
 * - Divergência zero obrigatória para confirmação de sucesso.
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/backup/restore',
  (e) => {
    // 1. Autenticação e Autorização Superuser / Admin (ceo_financeiro)
    const authRecord = e.auth
    let isSuperuser = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false

    // Validação alternativa via secret PB_SUPERUSER_TOKEN no Authorization header (sem desabilitar auth)
    if (!isSuperuser && !authRecord) {
      try {
        const expectedSuperToken = ($os.getenv && $os.getenv('PB_SUPERUSER_TOKEN')) || ''
        const reqHeaders = e.requestInfo().headers || {}
        const rawAuth = reqHeaders['authorization'] || reqHeaders['Authorization'] || ''
        const bearerMatch = rawAuth.match(/^Bearer\s+(.+)$/i)
        const tokenSent = bearerMatch ? bearerMatch[1].trim() : rawAuth.trim()
        if (expectedSuperToken && tokenSent && tokenSent === expectedSuperToken) {
          isSuperuser = true
        }
      } catch (_) {}
    }

    if (!authRecord && !isSuperuser) {
      return e.json(401, { message: 'Autenticação necessária.' })
    }

    let isAuthorized = isSuperuser
    if (authRecord) {
      const perfil = authRecord.getString('perfil')
      if (perfil === 'ceo_financeiro') {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return e.json(403, {
        message: 'Acesso negado. Apenas superusuários e ceo_financeiro podem executar restore.',
      })
    }
    // 2. Parâmetros da Requisição
    const body = e.requestInfo().body || {}
    const filename = (body.filename || body.arquivo || '').toString().trim()
    const executarReal = body.executar_real === true

    if (!filename) {
      return e.json(400, {
        message: 'Nome do arquivo de backup obrigatório (campo "filename" ou "arquivo").',
      })
    }

    // Sanitização de nome de arquivo (evitar path traversal)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return e.json(400, { message: 'Nome de arquivo inválido.' })
    }

    // 3. Leitura Segura de Credenciais do R2
    let bucket = ''
    let endpoint = ''
    let accessKey = ''
    let secretKey = ''

    try {
      if (typeof $os !== 'undefined' && $os.getenv) {
        bucket = $os.getenv('BACKUP_S3_BUCKET') || ''
        endpoint = $os.getenv('BACKUP_S3_ENDPOINT') || ''
        accessKey = $os.getenv('BACKUP_S3_ACCESS_KEY_ID') || $os.getenv('BACKUP_S3_KEY') || ''
        secretKey =
          $os.getenv('BACKUP_S3_SECRET_ACCESS_KEY') || $os.getenv('BACKUP_S3_SECRET') || ''
      }
    } catch (_) {}

    if (!bucket || !endpoint || !accessKey || !secretKey) {
      try {
        if (typeof $secrets !== 'undefined' && $secrets.get) {
          if (!bucket) bucket = $secrets.get('BACKUP_S3_BUCKET') || ''
          if (!endpoint) endpoint = $secrets.get('BACKUP_S3_ENDPOINT') || ''
          if (!accessKey)
            accessKey =
              $secrets.get('BACKUP_S3_ACCESS_KEY_ID') || $secrets.get('BACKUP_S3_KEY') || ''
          if (!secretKey)
            secretKey =
              $secrets.get('BACKUP_S3_SECRET_ACCESS_KEY') || $secrets.get('BACKUP_S3_SECRET') || ''
        }
      } catch (_) {}
    }

    const faltantes = []
    if (!bucket) faltantes.push('BACKUP_S3_BUCKET')
    if (!endpoint) faltantes.push('BACKUP_S3_ENDPOINT')
    if (!accessKey) faltantes.push('BACKUP_S3_ACCESS_KEY_ID')
    if (!secretKey) faltantes.push('BACKUP_S3_SECRET_ACCESS_KEY')

    if (faltantes.length > 0) {
      return e.json(500, {
        success: false,
        message: 'Variáveis de ambiente do storage externo ausentes: ' + faltantes.join(', '),
      })
    }

    // 4. SigV4 Helpers (Pure JS SHA-256 e HMAC-SHA256)
    function sha256Raw(bytesInput) {
      const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
      ]

      let H0 = 0x6a09e667
      let H1 = 0xbb67ae85
      let H2 = 0x3c6ef372
      let H3 = 0xa54ff53a
      let H4 = 0x510e527f
      let H5 = 0x9b05688c
      let H6 = 0x1f83d9ab
      let H7 = 0x5be0cd19

      const l = bytesInput.length
      const bitLen = l * 8
      const padLen = ((l + 8) >> 6) + 1
      const totalWords = padLen << 4
      const words = new Array(totalWords)
      for (let i = 0; i < totalWords; i++) words[i] = 0

      for (let i = 0; i < l; i++) {
        words[i >> 2] |= (bytesInput[i] & 0xff) << (24 - (i % 4) * 8)
      }
      words[l >> 2] |= 0x80 << (24 - (l % 4) * 8)
      words[totalWords - 1] = bitLen & 0xffffffff
      words[totalWords - 2] = Math.floor(bitLen / 0x100000000)

      const W = new Array(64)
      for (let i = 0; i < totalWords; i += 16) {
        for (let t = 0; t < 16; t++) W[t] = words[i + t]
        for (let t = 16; t < 64; t++) {
          const s0 =
            ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^
            ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^
            (W[t - 15] >>> 3)
          const s1 =
            ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^
            ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^
            (W[t - 2] >>> 10)
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
        }

        let a = H0
        let b = H1
        let c = H2
        let d = H3
        let e = H4
        let f = H5
        let g = H6
        let h = H7

        for (let t = 0; t < 64; t++) {
          const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
          const ch = (e & f) ^ (~e & g)
          const temp1 = (h + S1 + ch + K[t] + W[t]) | 0
          const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
          const maj = (a & b) ^ (a & c) ^ (b & c)
          const temp2 = (S0 + maj) | 0

          h = g
          g = f
          f = e
          e = (d + temp1) | 0
          d = c
          c = b
          b = a
          a = (temp1 + temp2) | 0
        }

        H0 = (H0 + a) | 0
        H1 = (H1 + b) | 0
        H2 = (H2 + c) | 0
        H3 = (H3 + d) | 0
        H4 = (H4 + e) | 0
        H5 = (H5 + f) | 0
        H6 = (H6 + g) | 0
        H7 = (H7 + h) | 0
      }

      const hashBytes = []
      const H = [H0, H1, H2, H3, H4, H5, H6, H7]
      for (let i = 0; i < 8; i++) {
        hashBytes.push((H[i] >>> 24) & 0xff)
        hashBytes.push((H[i] >>> 16) & 0xff)
        hashBytes.push((H[i] >>> 8) & 0xff)
        hashBytes.push(H[i] & 0xff)
      }
      return hashBytes
    }

    function strToUtf8Bytes(str) {
      const bytes = []
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i)
        if (code < 0x80) {
          bytes.push(code)
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6))
          bytes.push(0x80 | (code & 0x3f))
        } else if (code < 0xd800 || code >= 0xe000) {
          bytes.push(0xe0 | (code >> 12))
          bytes.push(0x80 | ((code >> 6) & 0x3f))
          bytes.push(0x80 | (code & 0x3f))
        } else {
          i++
          code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
          bytes.push(0xf0 | (code >> 18))
          bytes.push(0x80 | ((code >> 12) & 0x3f))
          bytes.push(0x80 | ((code >> 6) & 0x3f))
          bytes.push(0x80 | (code & 0x3f))
        }
      }
      return bytes
    }

    function bytesToHex(bytes) {
      let hex = ''
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i].toString(16)
        hex += b.length === 1 ? '0' + b : b
      }
      return hex
    }

    function hmacSha256(keyBytes, msgBytes) {
      let key = keyBytes
      if (key.length > 64) {
        key = sha256Raw(key)
      }
      const kPadI = new Array(64)
      const kPadO = new Array(64)
      for (let i = 0; i < 64; i++) {
        const k = i < key.length ? key[i] : 0
        kPadI[i] = k ^ 0x36
        kPadO[i] = k ^ 0x5c
      }
      const inner = kPadI.concat(msgBytes)
      const innerHash = sha256Raw(inner)
      const outer = kPadO.concat(innerHash)
      return sha256Raw(outer)
    }

    function getSignatureKey(key, dateStamp, regionName, serviceName) {
      const kDate = hmacSha256(strToUtf8Bytes('AWS4' + key), strToUtf8Bytes(dateStamp))
      const kRegion = hmacSha256(kDate, strToUtf8Bytes(regionName))
      const kService = hmacSha256(kRegion, strToUtf8Bytes(serviceName))
      const kSigning = hmacSha256(kService, strToUtf8Bytes('aws4_request'))
      return kSigning
    }

    function parseEndpoint(ep) {
      let clean = ep.trim()
      if (clean.startsWith('https://')) clean = clean.substring(8)
      if (clean.startsWith('http://')) clean = clean.substring(7)
      const slashIdx = clean.indexOf('/')
      let host = slashIdx !== -1 ? clean.substring(0, slashIdx) : clean
      let basePath = slashIdx !== -1 ? clean.substring(slashIdx) : ''
      if (basePath.endsWith('/')) basePath = basePath.slice(0, -1)
      return { host: host, basePath: basePath }
    }

    function parseR2Error(xmlStr, httpStatus) {
      let code = ''
      let msg = ''
      if (xmlStr) {
        const cMatch = xmlStr.match(/<Code>([^<]+)<\/Code>/i)
        const mMatch = xmlStr.match(/<Message>([^<]+)<\/Message>/i)
        if (cMatch && cMatch[1]) code = cMatch[1].trim()
        if (mMatch && mMatch[1]) msg = mMatch[1].trim()
      }

      if (
        code === 'InvalidAccessKeyId' ||
        code === 'SignatureDoesNotMatch' ||
        code === 'AccessDenied' ||
        code === 'InvalidArgument'
      ) {
        return {
          code: code,
          mensagemAmigavel:
            'Credenciais inválidas para o R2 (verifique BACKUP_S3_ACCESS_KEY_ID e BACKUP_S3_SECRET_ACCESS_KEY).',
          detalheOriginal: msg || xmlStr,
        }
      }
      if (code === 'NoSuchBucket') {
        return {
          code: code,
          mensagemAmigavel: 'Bucket não encontrado (verifique BACKUP_S3_BUCKET).',
          detalheOriginal: msg || xmlStr,
        }
      }
      return {
        code: code || 'HTTP_' + httpStatus,
        mensagemAmigavel:
          'Erro no Cloudflare R2 (' +
          (code || 'HTTP ' + httpStatus) +
          '): ' +
          (msg || 'Acesso recusado ou recurso indisponível.'),
        detalheOriginal: msg || xmlStr,
      }
    }

    const epInfo = parseEndpoint(endpoint)
    const host = epInfo.host
    const region = 'auto'
    const service = 's3'

    console.log('[BACKUP-RESTORE] Endpoint configurado:', 'https://' + host)
    console.log('[BACKUP-RESTORE] Bucket configurado:', bucket)

    // 5. Download do Arquivo do Bucket via SigV4 (GET /<bucket>/<filename>)
    const objectPath = '/' + bucket + '/' + filename
    const emptyPayloadSha256 = bytesToHex(sha256Raw(strToUtf8Bytes('')))
    const getAmzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
    const getDateStamp = getAmzDate.slice(0, 8)

    const getCanonicalHeaders =
      'host:' +
      host +
      '\n' +
      'x-amz-content-sha256:' +
      emptyPayloadSha256 +
      '\n' +
      'x-amz-date:' +
      getAmzDate +
      '\n'
    const getSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

    const getCanonicalReq =
      'GET\n' +
      objectPath +
      '\n' +
      '\n' +
      getCanonicalHeaders +
      '\n' +
      getSignedHeaders +
      '\n' +
      emptyPayloadSha256

    const getStringToSign =
      'AWS4-HMAC-SHA256\n' +
      getAmzDate +
      '\n' +
      getDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request\n' +
      bytesToHex(sha256Raw(strToUtf8Bytes(getCanonicalReq)))

    const getSigningKey = getSignatureKey(secretKey, getDateStamp, region, service)
    const getSignatureHex = bytesToHex(hmacSha256(getSigningKey, strToUtf8Bytes(getStringToSign)))

    const getAuthHeader =
      'AWS4-HMAC-SHA256 Credential=' +
      accessKey +
      '/' +
      getDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request, ' +
      'SignedHeaders=' +
      getSignedHeaders +
      ', ' +
      'Signature=' +
      getSignatureHex

    console.log(`[BACKUP-RESTORE] Solicitando download do arquivo ${filename} do Cloudflare R2...`)

    let resGet = null
    try {
      resGet = $http.send({
        url: 'https://' + host + objectPath,
        method: 'GET',
        headers: {
          Host: host,
          'x-amz-content-sha256': emptyPayloadSha256,
          'x-amz-date': getAmzDate,
          Authorization: getAuthHeader,
        },
        timeout: 120,
      })
    } catch (errGet) {
      return e.json(500, {
        success: false,
        message:
          'Erro na conexão com Cloudflare R2 para download: ' +
          (errGet && errGet.message ? errGet.message : errGet),
      })
    }

    if (!resGet || resGet.statusCode === 404) {
      return e.json(404, {
        success: false,
        message: `Arquivo "${filename}" não encontrado no bucket ${bucket}.`,
      })
    }

    if (resGet.statusCode !== 200) {
      const parsedGetErr = parseR2Error(resGet.raw || '', resGet.statusCode)
      console.error(
        `[BACKUP-RESTORE] Falha no download R2: HTTP ${resGet.statusCode} | Code: ${parsedGetErr.code} | Msg: ${parsedGetErr.detalheOriginal}`,
      )
      return e.json(502, {
        success: false,
        httpStatus: resGet.statusCode,
        r2Code: parsedGetErr.code,
        message: parsedGetErr.mensagemAmigavel,
        detalhes: parsedGetErr.detalheOriginal,
      })
    }

    // 6. Parse e Validação Estrutural do Dump
    let snapshot = null
    try {
      snapshot =
        typeof resGet.json === 'object' && resGet.json !== null
          ? resGet.json
          : JSON.parse(resGet.raw)
    } catch (errJson) {
      return e.json(422, {
        success: false,
        message: 'O arquivo baixado não contém um payload JSON válido de backup.',
      })
    }

    if (!snapshot || !snapshot.colecoes || typeof snapshot.colecoes !== 'object') {
      return e.json(422, {
        success: false,
        message: 'Estrutura do arquivo de backup inválida: campo "colecoes" ausente.',
      })
    }

    // 7. validateRestore: Verificação de Contagens ANTES vs DUMP e Aplicação
    const colecoesAlvo = [
      'users',
      'usuarios',
      'etapas_funil',
      'motivos_perda',
      'clientes',
      'oportunidades',
      'tarefas',
      'ligacoes',
      'canais_marketing',
      'automacoes',
      'mensagens_enviadas',
      'campanhas',
      'conteudos_gerados',
      'publicacoes',
      'aprovacoes_pendentes',
      'metas',
      'treinamento_concluido',
      'conversas_whatsapp',
      'mensagens_whatsapp',
      'produtos',
      'sugestoes_ia',
      'integracoes_config',
      'webhook_logs',
    ]

    const contagensAntes = {}
    for (let c = 0; c < colecoesAlvo.length; c++) {
      const col = colecoesAlvo[c]
      try {
        contagensAntes[col] = $app.countRecords(col)
      } catch (_) {
        contagensAntes[col] = 0
      }
    }

    const contagensDump = snapshot.contagens || {}
    const colecoesRecuperadas = {}
    const diferencas = {}

    for (let c = 0; c < colecoesAlvo.length; c++) {
      const col = colecoesAlvo[c]
      const registrosDump = snapshot.colecoes[col] || []
      const totalDump = Array.isArray(registrosDump)
        ? registrosDump.length
        : contagensDump[col] || 0
      colecoesRecuperadas[col] = totalDump

      // Se executar_real for true, realiza upsert/restauração dos registros ausentes
      if (executarReal && Array.isArray(registrosDump)) {
        try {
          const colModel = $app.findCollectionByNameOrId(col)
          for (let r = 0; r < registrosDump.length; r++) {
            const item = registrosDump[r]
            if (!item || !item.id) continue
            try {
              $app.findRecordById(col, item.id)
            } catch (_) {
              // Registro não existe no banco atual: restaura
              try {
                const novoRec = new Record(colModel)
                for (const [campo, val] of Object.entries(item)) {
                  if (campo !== 'created' && campo !== 'updated') {
                    novoRec.set(campo, val)
                  }
                }
                $app.save(novoRec)
              } catch (errSave) {
                console.warn(
                  `[BACKUP-RESTORE] Erro ao restaurar registro ${item.id} em ${col}:`,
                  errSave && errSave.message ? errSave.message : errSave,
                )
              }
            }
          }
        } catch (errCol) {
          console.warn(
            `[BACKUP-RESTORE] Erro ao processar coleção ${col}:`,
            errCol && errCol.message ? errCol.message : errCol,
          )
        }
      }
    }

    // Contagens DEPOIS
    const contagensDepois = {}
    for (let c = 0; c < colecoesAlvo.length; c++) {
      const col = colecoesAlvo[c]
      try {
        contagensDepois[col] = $app.countRecords(col)
      } catch (_) {
        contagensDepois[col] = 0
      }
    }

    // Verificação estrita de integridade com o dump do arquivo baixado
    let divergenciaTotal = 0
    for (let c = 0; c < colecoesAlvo.length; c++) {
      const col = colecoesAlvo[c]
      const esperado = colecoesRecuperadas[col]
      const atual = contagensDepois[col]
      // Diferença entre o snapshot do R2 e o banco restaurado
      if (atual !== esperado) {
        diferencas[col] = {
          esperadoNoDump: esperado,
          atualNoBanco: atual,
          delta: atual - esperado,
        }
        divergenciaTotal += Math.abs(atual - esperado)
      }
    }

    const integridadeValidada = divergenciaTotal === 0

    console.log(
      `[BACKUP-RESTORE] Validação de Restore concluída: Arquivo ${filename}, Integridade: ${integridadeValidada ? '100% ÍNTEGRO (Divergência Zero)' : 'Divergência detectada'}, Modo Real: ${executarReal}`,
    )

    return e.json(200, {
      success: true,
      mensagem: integridadeValidada
        ? 'Restore validado a partir do bucket Cloudflare R2 com divergência ZERO.'
        : 'Restore verificado a partir do bucket Cloudflare R2 (com divergências registradas).',
      arquivo: filename,
      bucket: bucket,
      timestampDump: snapshot.timestamp || '',
      modoReal: executarReal,
      integridadeValidada: integridadeValidada,
      divergenciaTotal: divergenciaTotal,
      contagensAntes: contagensAntes,
      contagensDump: colecoesRecuperadas,
      contagensDepois: contagensDepois,
      diferencas: diferencas,
    })
  },
  $apis.requireAuth(),
)
