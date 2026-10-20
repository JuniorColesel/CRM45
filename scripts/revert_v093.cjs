const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('=== INICIANDO REVERSÃO PARA v0.0.93 ===')
try {
  const commitId = 'c5b3cb0cb272f6507daffff6be6d2db9851c08e4'
  console.log('Verificando git status...')
  const st = execSync('git status --short', { encoding: 'utf-8' })
  console.log('Git status:\n' + st)

  console.log('Verificando commit v0.0.93...')
  const showCommit = execSync(`git log -1 --stat ${commitId}`, { encoding: 'utf-8' })
  console.log('Commit v0.0.93:\n' + showCommit)

  console.log('Executando git checkout no commit v0.0.93...')
  // Limpar mudanças no working tree e restaurar tudo exatamente do commit v0.0.93
  execSync(`git checkout -f ${commitId} -- .`, { encoding: 'utf-8' })

  // Limpar arquivos não rastreados que possam ter sido criados depois
  execSync(`git clean -fd`, { encoding: 'utf-8' })

  console.log('Reversão concluída com sucesso!')
  const finalStatus = execSync('git status --short', { encoding: 'utf-8' })
  console.log('Status final:\n' + finalStatus)
} catch (err) {
  console.error('ERRO na reversão:', err)
  process.exit(1)
}
