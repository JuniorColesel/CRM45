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
    const isSuperuser = e.hasSuperuserAuth ? e.hasSuperuserAuth() : false

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
        accessKey = $os.getenv('BACKUP_S3_KEY') || ''
        secretKey = $os.getenv('BACKUP_S3_SECRET') || ''
      }
    } catch (_) {}

    if (!bucket || !endpoint || !accessKey || !secretKey) {
      try {
        if (typeof $secrets !== 'undefined' && $secrets.get) {
          if (!bucket) bucket = $secrets.get('BACKUP_S3_BUCKET') || ''
          if (!endpoint) endpoint = $secrets.get('BACKUP_S3_ENDPOINT') || ''
          if (!accessKey) accessKey = $secrets.get('BACKUP_S3_KEY') || ''
          if (!secretKey) secretKey = $secrets.get('BACKUP_S3_SECRET') || ''
        }
      } catch (_) {}
    }

    const faltantes = []
    if (!bucket) faltantes.push('BACKUP_S3_BUCKET')
    if (!endpoint) faltantes.push('BACKUP_S3_ENDPOINT')
    if (!accessKey) faltantes.push('BACKUP_S3_KEY')
    if (!secretKey) faltantes.push('BACKUP_S3_SECRET')

    if (faltantes.length > 0) {
      return e.json(500, {
        success: false,
        message: 'Variáveis de ambiente do storage externo ausentes: ' + faltantes.join(', '),
      })
    }

    // 3. SigV4 Helpers
    function hexToBytes(hex) {
      const bytes = []
      for (let c = 0; c < hex.length; c += 2) {
        bytes.push(parseInt(hex.substr(c, 2), 16))
      }
      return bytes
    }

    function hmacSha256Raw(text, keyBytesOrStr) {
      return $security.hs256(text, keyBytesOrStr)
    }

    function getSignatureKey(key, dateStamp, regionName, serviceName) {
      const kDateHex = hmacSha256Raw(dateStamp, 'AWS4' + key)
      const kRegionHex = hmacSha256Raw(
        regionName,
        String.fromCharCode.apply(null, hexToBytes(kDateHex)),
      )
      const kServiceHex = hmacSha256Raw(
        serviceName,
        String.fromCharCode.apply(null, hexToBytes(kRegionHex)),
      )
      const kSigningHex = hmacSha256Raw(
        'aws4_request',
        String.fromCharCode.apply(null, hexToBytes(kServiceHex)),
      )
      return hexToBytes(kSigningHex)
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

    const epInfo = parseEndpoint(endpoint)
    const host = epInfo.host
    const region = 'auto'
    const service = 's3'

    const listPath = '/' + bucket
    const emptyPayloadSha256 = $security.sha256('')
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
      $security.sha256(listCanonicalReq)

    const listSigningKey = getSignatureKey(secretKey, listDateStamp, region, service)
    const listSignatureHex = hmacSha256Raw(
      listStringToSign,
      String.fromCharCode.apply(null, listSigningKey),
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
        return e.json(502, {
          success: false,
          message: 'Falha ao consultar Cloudflare R2: HTTP ' + resList.statusCode,
          detalhes: resList.raw || '',
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
