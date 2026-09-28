/**
 * Endpoint GET /backend/v1/backup/list
 * Lista os backups disponíveis no bucket Cloudflare R2 via ListObjectsV2 (S3 SigV4).
 * Restrito a superusuários e administradores do CRM (ceo_financeiro e coordenador_vendas).
 *
 * ⚠ IMPORTANTE PB HOOKS: Toda lógica inline dentro do callback!
 */

routerAdd(
  'GET',
  '/backend/v1/backup/list',
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
      return e.json(403, { message: 'Acesso negado. Apenas administradores podem listar backups.' })
    }
    // 2. Leitura Segura de Credenciais do R2
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

    // 3. SigV4 Helpers (Pure JS SHA-256 e HMAC-SHA256)
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

    console.log('[BACKUP-LIST] Endpoint configurado:', 'https://' + host)
    console.log('[BACKUP-LIST] Bucket configurado:', bucket)

    const listPath = '/' + bucket
    const emptyPayloadSha256 = bytesToHex(sha256Raw(strToUtf8Bytes('')))
    const listAmzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z'
    const listDateStamp = listAmzDate.slice(0, 8)

    const listCanonicalHeaders =
      'host:' +
      host +
      '\n' +
      'x-amz-content-sha256:' +
      emptyPayloadSha256 +
      '\n' +
      'x-amz-date:' +
      listAmzDate +
      '\n'
    const listSignedHeaders = 'host;x-amz-content-sha256;x-amz-date'

    const listCanonicalReq =
      'GET\n' +
      listPath +
      '\n' +
      '\n' +
      listCanonicalHeaders +
      '\n' +
      listSignedHeaders +
      '\n' +
      emptyPayloadSha256

    const listStringToSign =
      'AWS4-HMAC-SHA256\n' +
      listAmzDate +
      '\n' +
      listDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request\n' +
      bytesToHex(sha256Raw(strToUtf8Bytes(listCanonicalReq)))

    const listSigningKey = getSignatureKey(secretKey, listDateStamp, region, service)
    const listSignatureHex = bytesToHex(
      hmacSha256(listSigningKey, strToUtf8Bytes(listStringToSign)),
    )

    const listAuthHeader =
      'AWS4-HMAC-SHA256 Credential=' +
      accessKey +
      '/' +
      listDateStamp +
      '/' +
      region +
      '/' +
      service +
      '/aws4_request, ' +
      'SignedHeaders=' +
      listSignedHeaders +
      ', ' +
      'Signature=' +
      listSignatureHex

    try {
      const resList = $http.send({
        url: 'https://' + host + listPath,
        method: 'GET',
        headers: {
          Host: host,
          'x-amz-content-sha256': emptyPayloadSha256,
          'x-amz-date': listAmzDate,
          Authorization: listAuthHeader,
        },
        timeout: 30,
      })

      if (resList.statusCode !== 200) {
        const parsedListErr = parseR2Error(resList.raw || '', resList.statusCode)
        console.error(
          `[BACKUP-LIST] Falha ao consultar R2: HTTP ${resList.statusCode} | Code: ${parsedListErr.code} | Msg: ${parsedListErr.detalheOriginal}`,
        )
        return e.json(502, {
          success: false,
          httpStatus: resList.statusCode,
          r2Code: parsedListErr.code,
          message: parsedListErr.mensagemAmigavel,
          detalhes: parsedListErr.detalheOriginal,
        })
      }

      const xmlBody = resList.raw || ''
      const contentsBlocks = xmlBody.split('<Contents>')
      const backups = []

      for (let i = 1; i < contentsBlocks.length; i++) {
        const block = contentsBlocks[i]
        const keyMatch = block.match(/<Key>([^<]+)<\/Key>/)
        const sizeMatch = block.match(/<Size>([^<]+)<\/Size>/)
        const modMatch = block.match(/<LastModified>([^<]+)<\/LastModified>/)
        const etagMatch = block.match(/<ETag>([^<]+)<\/ETag>/)

        if (keyMatch && keyMatch[1]) {
          backups.push({
            nome: keyMatch[1],
            tamanho: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
            modificado: modMatch ? modMatch[1] : '',
            etag: etagMatch ? etagMatch[1].replace(/&quot;/g, '').replace(/"/g, '') : '',
          })
        }
      }

      // Ordenar decrescente por modificado / nome
      backups.sort((a, b) => {
        if (a.modificado && b.modificado) {
          return new Date(b.modificado).getTime() - new Date(a.modificado).getTime()
        }
        return b.nome.localeCompare(a.nome)
      })

      return e.json(200, {
        success: true,
        bucket: bucket,
        endpoint: 'https://' + host,
        total: backups.length,
        backups: backups,
      })
    } catch (errList) {
      return e.json(500, {
        success: false,
        message:
          'Erro ao conectar ao storage Cloudflare R2: ' +
          (errList && errList.message ? errList.message : errList),
      })
    }
  },
  $apis.requireAuth(),
)
