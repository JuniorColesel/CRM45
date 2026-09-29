/**
 * Endpoint POST /backend/v1/backup/create
 * Cria backup completo do banco de dados (23 coleções), envia ao Cloudflare R2
 * via AWS Signature V4 e executa a rotação de arquivos com mais de 30 dias.
 * Restrito a superusuários e administradores do CRM (ceo_financeiro e coordenador_vendas).
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'POST',
  '/backend/v1/backup/create',
  (e) => {
    // 1. Autenticação e Autorização Admin
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

    let isAdmin = isSuperuser
    if (authRecord) {
      const perfil = authRecord.getString('perfil')
      if (perfil === 'ceo_financeiro' || perfil === 'coordenador_vendas') {
        isAdmin = true
      }
    }

    if (!isAdmin) {
      return e.json(403, { message: 'Acesso negado. Apenas administradores podem criar backups.' })
    }
    // 2. Leitura Segura de Credenciais do R2 ($os.getenv / $secrets.get)
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

    // 3. Gerar Dump Estruturado de Todas as Coleções de Negócio do CRM
    const inicioMs = Date.now()
    const agora = new Date()
    const timestampIso = agora.toISOString()

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
      'meta_participantes',
      'treinamento_concluido',
      'conversas_whatsapp',
      'mensagens_whatsapp',
      'produtos',
      'sugestoes_ia',
      'integracoes_config',
      'webhook_logs',
    ]

    const dadosDump = {}
    const contagens = {}
    let totalRegistros = 0

    for (let i = 0; i < colecoesAlvo.length; i++) {
      const nomeCol = colecoesAlvo[i]
      try {
        const totalCol = $app.countRecords(nomeCol)
        contagens[nomeCol] = totalCol
        totalRegistros += totalCol

        const registros = []
        const batchSize = 200
        let offset = 0
        while (offset < totalCol) {
          const batch = $app.findRecordsByFilter(nomeCol, '', 'id', batchSize, offset)
          for (let j = 0; j < batch.length; j++) {
            registros.push(batch[j].publicExport())
          }
          offset += batch.length
          if (batch.length === 0) break
        }
        dadosDump[nomeCol] = registros
      } catch (errCol) {
        contagens[nomeCol] = 0
        dadosDump[nomeCol] = []
      }
    }

    const dataFormatada = agora.toISOString().replace(/[-:T]/g, '').slice(0, 15)
    const nomeArquivo = `backup-${agora.toISOString().slice(0, 10)}-${dataFormatada.slice(8, 14)}.json`

    const payloadObjeto = {
      versao: '0.0.37',
      app: 'crm-colesel-45',
      timestamp: timestampIso,
      totalColecoes: colecoesAlvo.length,
      totalRegistros: totalRegistros,
      contagens: contagens,
      colecoes: dadosDump,
    }

    const payloadString = JSON.stringify(payloadObjeto)
    const tamanhoBytes = payloadString.length

    // 4. Funções Criptográficas SigV4 (Pure JS SHA-256 e HMAC-SHA256 para compatibilidade total com Goja/PB)
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

    const dateStamp = timestampIso.slice(0, 10).replace(/-/g, '')
    const amzDate = timestampIso.replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'

    console.log('[BACKUP-CREATE] Endpoint configurado:', 'https://' + host)
    console.log('[BACKUP-CREATE] Bucket configurado:', bucket)

    // 4.1 Pré-voo de conexão no R2 (ListObjectsV2 com max-keys=1)
    try {
      const prePath = '/' + bucket
      const preQuery = 'list-type=2&max-keys=1'
      const preEmptySha = bytesToHex(sha256Raw(strToUtf8Bytes('')))
      const preCanonicalHeaders =
        'host:' +
        host +
        '\n' +
        'x-amz-content-sha256:' +
        preEmptySha +
        '\n' +
        'x-amz-date:' +
        amzDate +
        '\n'
      const preSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'
      const preCanonicalReq =
        'GET\n' +
        prePath +
        '\n' +
        preQuery +
        '\n' +
        preCanonicalHeaders +
        '\n' +
        preSignedHeaders +
        '\n' +
        preEmptySha

      const preStringToSign =
        'AWS4-HMAC-SHA256\n' +
        amzDate +
        '\n' +
        dateStamp +
        '/' +
        region +
        '/' +
        service +
        '/aws4_request\n' +
        bytesToHex(sha256Raw(strToUtf8Bytes(preCanonicalReq)))

      const preSigningKey = getSignatureKey(secretKey, dateStamp, region, service)
      const preSigHex = bytesToHex(hmacSha256(preSigningKey, strToUtf8Bytes(preStringToSign)))

      const preAuthHeader =
        'AWS4-HMAC-SHA256 Credential=' +
        accessKey +
        '/' +
        dateStamp +
        '/' +
        region +
        '/' +
        service +
        '/aws4_request, SignedHeaders=' +
        preSignedHeaders +
        ', Signature=' +
        preSigHex

      const resPre = $http.send({
        url: 'https://' + host + prePath + '?' + preQuery,
        method: 'GET',
        headers: {
          Host: host,
          'x-amz-content-sha256': preEmptySha,
          'x-amz-date': amzDate,
          Authorization: preAuthHeader,
        },
        timeout: 20,
      })

      if (resPre.statusCode < 200 || resPre.statusCode >= 300) {
        const parsedPreErr = parseR2Error(resPre.raw || '', resPre.statusCode)
        console.error(
          `[BACKUP-CREATE] Pré-voo R2 rejeitado: HTTP ${resPre.statusCode} | Code: ${parsedPreErr.code} | Msg: ${parsedPreErr.detalheOriginal}`,
        )
        return e.json(502, {
          success: false,
          etapa: 'pre-voo',
          httpStatus: resPre.statusCode,
          r2Code: parsedPreErr.code,
          message: parsedPreErr.mensagemAmigavel,
          detalhes: parsedPreErr.detalheOriginal,
        })
      }
      console.log('[BACKUP-CREATE] Pré-voo de conexão com Cloudflare R2 aprovado (HTTP 200).')
    } catch (errPre) {
      console.error(
        '[BACKUP-CREATE] Falha de rede no pré-voo R2:',
        errPre && errPre.message ? errPre.message : errPre,
      )
      return e.json(500, {
        success: false,
        etapa: 'pre-voo',
        message:
          'Erro na conexão com Cloudflare R2 durante pré-voo: ' +
          (errPre && errPre.message ? errPre.message : errPre),
      })
    }

    // 4.2 Upload do Backup (PUT /<bucket>/<nomeArquivo>)
    const objectPath = '/' + bucket + '/' + nomeArquivo
    const payloadBytes = strToUtf8Bytes(payloadString)
    const contentSha256 = bytesToHex(sha256Raw(payloadBytes))

    const canonicalHeaders =
      'content-type:application/json\n' +
      'host:' +
      host +
      '\n' +
      'x-amz-content-sha256:' +
      contentSha256 +
      '\n' +
      'x-amz-date:' +
      amzDate +
      '\n'

    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

    const canonicalRequest =
      'PUT\n' +
      objectPath +
      '\n' +
      '\n' +
      canonicalHeaders +
      '\n' +
      signedHeaders +
      '\n' +
      contentSha256

    const stringToSign =
      'AWS4-HMAC-SHA256\n' +
      amzDate +
      '\n' +
      dateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request\n' +
      bytesToHex(sha256Raw(strToUtf8Bytes(canonicalRequest)))

    const signingKey = getSignatureKey(secretKey, dateStamp, region, service)
    const signatureHex = bytesToHex(hmacSha256(signingKey, strToUtf8Bytes(stringToSign)))

    const authHeader =
      'AWS4-HMAC-SHA256 Credential=' +
      accessKey +
      '/' +
      dateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request, ' +
      'SignedHeaders=' +
      signedHeaders +
      ', ' +
      'Signature=' +
      signatureHex

    const targetUrl = 'https://' + host + objectPath
    console.log(
      `[BACKUP-CREATE] Enviando dump para Cloudflare R2: ${nomeArquivo} (Tamanho: ${tamanhoBytes} bytes)`,
    )

    let uploadOk = false
    let httpStatusUpload = 0
    let uploadRawResponse = ''

    try {
      const resPut = $http.send({
        url: targetUrl,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Host: host,
          'x-amz-content-sha256': contentSha256,
          'x-amz-date': amzDate,
          Authorization: authHeader,
        },
        body: payloadString,
        timeout: 120,
      })
      httpStatusUpload = resPut.statusCode
      uploadRawResponse = resPut.raw || ''
      if (resPut.statusCode >= 200 && resPut.statusCode < 300) {
        uploadOk = true
        console.log(`[BACKUP-CREATE] SUCESSO: Dump enviado com HTTP ${resPut.statusCode}`)
      } else {
        const parsedErr = parseR2Error(uploadRawResponse, resPut.statusCode)
        console.error(
          `[BACKUP-CREATE] Falha no upload: HTTP ${resPut.statusCode} | Code: ${parsedErr.code} | Msg: ${parsedErr.detalheOriginal}`,
        )
      }
    } catch (errUpload) {
      return e.json(500, {
        success: false,
        message:
          'Erro na conexão com Cloudflare R2: ' +
          (errUpload && errUpload.message ? errUpload.message : errUpload),
      })
    }

    if (!uploadOk) {
      const parsedErr = parseR2Error(uploadRawResponse, httpStatusUpload)
      const duracaoFalhaMs = Date.now() - inicioMs
      try {
        const logsCol = $app.findCollectionByNameOrId('backup_logs')
        const logRec = new Record(logsCol)
        logRec.set('data_hora', timestampIso)
        if (authRecord) logRec.set('usuario_id', authRecord.id)
        logRec.set('tipo', 'manual')
        logRec.set('resultado', 'falha')
        logRec.set('duracao_ms', duracaoFalhaMs)
        logRec.set(
          'detalhes',
          `Falha HTTP ${httpStatusUpload} no upload para R2: ${parsedErr.mensagemAmigavel} (${parsedErr.detalheOriginal})`,
        )
        logRec.set('arquivos_gerados', [])
        $app.save(logRec)
      } catch (_) {}

      return e.json(502, {
        success: false,
        httpStatus: httpStatusUpload,
        r2Code: parsedErr.code,
        message: parsedErr.mensagemAmigavel,
        detalhes: parsedErr.detalheOriginal,
      })
    }

    // 5. Executar Rotação Efetiva (DeleteObject de arquivos > 30 dias)
    let rotacionados = 0
    try {
      const rotListPath = '/' + bucket
      const rotEmptySha = bytesToHex(sha256Raw(strToUtf8Bytes('')))
      const rotAmzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
      const rotDateStamp = rotAmzDate.slice(0, 8)

      const rotCanonicalHeaders =
        'host:' +
        host +
        '\n' +
        'x-amz-content-sha256:' +
        rotEmptySha +
        '\n' +
        'x-amz-date:' +
        rotAmzDate +
        '\n'
      const rotSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

      const rotCanonicalReq =
        'GET\n' +
        rotListPath +
        '\n' +
        '\n' +
        rotCanonicalHeaders +
        '\n' +
        rotSignedHeaders +
        '\n' +
        rotEmptySha

      const rotStringToSign =
        'AWS4-HMAC-SHA256\n' +
        rotAmzDate +
        '\n' +
        rotDateStamp +
        '/' +
        region +
        '/' +
        service +
        '/aws4_request\n' +
        bytesToHex(sha256Raw(strToUtf8Bytes(rotCanonicalReq)))

      const rotSigningKey = getSignatureKey(secretKey, rotDateStamp, region, service)
      const rotSignatureHex = bytesToHex(hmacSha256(rotSigningKey, strToUtf8Bytes(rotStringToSign)))

      const rotAuthHeader =
        'AWS4-HMAC-SHA256 Credential=' +
        accessKey +
        '/' +
        rotDateStamp +
        '/' +
        region +
        '/' +
        service +
        '/aws4_request, ' +
        'SignedHeaders=' +
        rotSignedHeaders +
        ', ' +
        'Signature=' +
        rotSignatureHex

      const resList = $http.send({
        url: 'https://' + host + rotListPath,
        method: 'GET',
        headers: {
          Host: host,
          'x-amz-content-sha256': rotEmptySha,
          'x-amz-date': rotAmzDate,
          Authorization: rotAuthHeader,
        },
        timeout: 30,
      })

      if (resList.statusCode === 200) {
        const xmlBody = resList.raw || ''
        const keyMatches = xmlBody.match(/<Key>([^<]+)<\/Key>/g) || []
        const lastModMatches = xmlBody.match(/<LastModified>([^<]+)<\/LastModified>/g) || []

        const limiteRetencaoMs = 30 * 24 * 60 * 60 * 1000
        const agoraMs = Date.now()

        for (let k = 0; k < keyMatches.length; k++) {
          const itemKey = keyMatches[k].replace('<Key>', '').replace('</Key>', '')
          const itemLastMod = lastModMatches[k]
            ? lastModMatches[k].replace('<LastModified>', '').replace('</LastModified>', '')
            : ''

          let dataObjetoMs = 0
          if (itemLastMod) {
            dataObjetoMs = new Date(itemLastMod).getTime()
          } else {
            const parts = itemKey.match(/backup-(\d{4}-\d{2}-\d{2})/)
            if (parts && parts[1]) {
              dataObjetoMs = new Date(parts[1]).getTime()
            }
          }

          if (dataObjetoMs > 0 && agoraMs - dataObjetoMs > limiteRetencaoMs) {
            const delPath = '/' + bucket + '/' + itemKey
            const delAmzDate =
              new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
            const delDateStamp = delAmzDate.slice(0, 8)
            const delEmptySha = bytesToHex(sha256Raw(strToUtf8Bytes('')))
            const delCanonicalHeaders =
              'host:' +
              host +
              '\n' +
              'x-amz-content-sha256:' +
              delEmptySha +
              '\n' +
              'x-amz-date:' +
              delAmzDate +
              '\n'
            const delSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

            const delCanonicalReq =
              'DELETE\n' +
              delPath +
              '\n' +
              '\n' +
              delCanonicalHeaders +
              '\n' +
              delSignedHeaders +
              '\n' +
              delEmptySha

            const delStringToSign =
              'AWS4-HMAC-SHA256\n' +
              delAmzDate +
              '\n' +
              delDateStamp +
              '/' +
              region +
              '/' +
              service +
              '/aws4_request\n' +
              bytesToHex(sha256Raw(strToUtf8Bytes(delCanonicalReq)))

            const delSigningKey = getSignatureKey(secretKey, delDateStamp, region, service)
            const delSignatureHex = bytesToHex(
              hmacSha256(delSigningKey, strToUtf8Bytes(delStringToSign)),
            )

            const delAuthHeader =
              'AWS4-HMAC-SHA256 Credential=' +
              accessKey +
              '/' +
              delDateStamp +
              '/' +
              region +
              '/' +
              service +
              '/aws4_request, ' +
              'SignedHeaders=' +
              delSignedHeaders +
              ', ' +
              'Signature=' +
              delSignatureHex

            const resDel = $http.send({
              url: 'https://' + host + delPath,
              method: 'DELETE',
              headers: {
                Host: host,
                'x-amz-content-sha256': delEmptySha,
                'x-amz-date': delAmzDate,
                Authorization: delAuthHeader,
              },
              timeout: 30,
            })

            if (resDel.statusCode === 204 || resDel.statusCode === 200) {
              rotacionados++
            }
          }
        }
      }
    } catch (errRot) {
      console.warn(
        '[BACKUP-CREATE] Aviso durante rotação:',
        errRot && errRot.message ? errRot.message : errRot,
      )
    }

    const duracaoTotalMs = Date.now() - inicioMs

    // 6. Registrar execução em backup_logs
    try {
      const logsCol = $app.findCollectionByNameOrId('backup_logs')
      const logRec = new Record(logsCol)
      logRec.set('data_hora', timestampIso)
      if (authRecord) logRec.set('usuario_id', authRecord.id)
      logRec.set('tipo', 'manual')
      logRec.set('resultado', 'sucesso')
      logRec.set('duracao_ms', duracaoTotalMs)
      logRec.set(
        'detalhes',
        `Backup manual sob demanda criado com sucesso (${totalRegistros} registros em ${colecoesAlvo.length} coleções, ${rotacionados} item(ns) rotacionados)`,
      )
      logRec.set('arquivos_gerados', [
        {
          nome: nomeArquivo,
          tamanhoBytes: tamanhoBytes,
          bucket: bucket,
          totalRegistros: totalRegistros,
        },
      ])
      $app.save(logRec)
    } catch (errLog) {
      console.warn(
        '[BACKUP-CREATE] Aviso ao gravar backup_logs:',
        errLog && errLog.message ? errLog.message : errLog,
      )
    }

    return e.json(200, {
      success: true,
      mensagem: 'Backup criado com sucesso e despachado para Cloudflare R2.',
      arquivo: nomeArquivo,
      bucket: bucket,
      tamanhoBytes: tamanhoBytes,
      totalColecoes: colecoesAlvo.length,
      totalRegistros: totalRegistros,
      contagens: contagens,
      itensRotacionados: rotacionados,
      duracaoMs: duracaoTotalMs,
      timestamp: timestampIso,
    })
  },
  $apis.requireAuth(),
)
