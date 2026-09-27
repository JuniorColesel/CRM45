import pb from '@/lib/pocketbase/client'

export const VERSAO_TREINAMENTO_ATUAL = '1.0'

export interface TreinamentoConcluidoRecord {
  id: string
  usuario_id: string
  concluido_em: string
  versao_treinamento: string
  created: string
  updated: string
}

const getStorageKey = (usuarioId: string) => `treinamento_concluido_${usuarioId}`

/**
 * Verifica se o usuário concluiu o treinamento na versão indicada.
 * Prioriza o PocketBase com consulta à coleção `treinamento_concluido`.
 * Caso ocorra erro ou falha de rede/permissão, consulta o fallback no localStorage.
 */
export async function verificarTreinamentoConcluido(
  usuarioId: string,
  versao: string = VERSAO_TREINAMENTO_ATUAL,
): Promise<boolean> {
  if (!usuarioId) return false

  // 1. Tentar ler do localStorage primeiro como conferência rápida
  const localVal = localStorage.getItem(getStorageKey(usuarioId))
  let localConcluido = false
  if (localVal) {
    try {
      const parsed = JSON.parse(localVal)
      if (parsed?.versao === versao || parsed?.concluido === true) {
        localConcluido = true
      }
    } catch {
      if (localVal === 'true' || localVal === versao) {
        localConcluido = true
      }
    }
  }

  // 2. Se autenticado, checa no PocketBase
  if (pb.authStore.isValid && pb.authStore.record?.id === usuarioId) {
    try {
      const records = await pb
        .collection('treinamento_concluido')
        .getList<TreinamentoConcluidoRecord>(1, 1, {
          filter: `usuario_id = "${usuarioId}" && versao_treinamento = "${versao}"`,
          sort: '-created',
        })

      if (records.items && records.items.length > 0) {
        // Garante sincronia do localStorage
        localStorage.setItem(
          getStorageKey(usuarioId),
          JSON.stringify({
            concluido: true,
            versao,
            concluido_em: records.items[0].concluido_em || records.items[0].created,
          }),
        )
        return true
      }
      // Se não encontrou no banco, mas tem no localStorage, podemos manter ou respeitar local
      return localConcluido
    } catch (err) {
      console.warn('Erro ao verificar treinamento_concluido no PocketBase, usando fallback:', err)
      return localConcluido
    }
  }

  return localConcluido
}

/**
 * Registra a conclusão do treinamento no PocketBase e no localStorage.
 */
export async function registrarTreinamentoConcluido(
  usuarioId: string,
  versao: string = VERSAO_TREINAMENTO_ATUAL,
): Promise<TreinamentoConcluidoRecord | null> {
  if (!usuarioId) return null

  const nowIso = new Date().toISOString()

  // Atualiza imediatamente o localStorage (fallback e cache instantâneo)
  try {
    localStorage.setItem(
      getStorageKey(usuarioId),
      JSON.stringify({
        concluido: true,
        versao,
        concluido_em: nowIso,
      }),
    )
  } catch (err) {
    console.warn('Erro ao salvar no localStorage:', err)
  }

  // Salva no banco de dados
  if (pb.authStore.isValid) {
    try {
      // Verifica se já existe para evitar duplicatas desnecessárias
      const existing = await pb
        .collection('treinamento_concluido')
        .getList<TreinamentoConcluidoRecord>(1, 1, {
          filter: `usuario_id = "${usuarioId}" && versao_treinamento = "${versao}"`,
        })

      if (existing.items && existing.items.length > 0) {
        return existing.items[0]
      }

      const record = await pb
        .collection('treinamento_concluido')
        .create<TreinamentoConcluidoRecord>({
          usuario_id: usuarioId,
          concluido_em: nowIso,
          versao_treinamento: versao,
        })
      return record
    } catch (err) {
      console.warn('Erro ao salvar treinamento_concluido no PocketBase:', err)
      return null
    }
  }

  return null
}
