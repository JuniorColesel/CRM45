import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export interface IniciarConexaoBlingOptions {
  /**
   * Chamado a cada polling quando o status é atualizado
   */
  onStatusChange?: (status: {
    conectado: boolean
    status: string
    ultimo_erro?: string | null
  }) => void
  /**
   * Chamado quando a conexão é detectada com sucesso
   */
  onSuccess?: () => void
  /**
   * Chamado quando ocorre erro ou timeout
   */
  onError?: (mensagem: string) => void
  /**
   * Intervalo de polling em milissegundos (padrão: 2000ms)
   */
  pollIntervalMs?: number
  /**
   * Timeout máximo total do polling em milissegundos (padrão: 5 minutos = 300.000ms)
   */
  maxTimeoutMs?: number
}

export interface IniciarConexaoBlingRetorno {
  /**
   * Interrompe o polling e limpa os recursos alocados
   */
  cancelar: () => void
}

/**
 * Inicia o fluxo OAuth oficial com o Bling ERP:
 *
 * 1. Abre popup neutro (about:blank) para evitar bloqueio por bloqueador de popups;
 * 2. Solicita a URL oficial de autorização ao backend via GET /backend/v1/bling/connect?format=json;
 * 3. Valida a resposta do backend (success: true e auth_url presente);
 * 4. Valida que a auth_url aponta estritamente para o domínio oficial de autorização do Bling (www.bling.com.br);
 *    GARANTIA DE SEGURANÇA: O popup NUNCA é navegado para páginas do CRM (/integracoes, /bling, etc);
 * 5. Navega a janela do popup para a URL do Bling;
 * 6. Inicia polling periódico de status contra /backend/v1/bling/status;
 * 7. Para o polling assim que status === 'conectado' for detectado;
 * 8. Trata timeout de autorização (5 minutos padrão);
 * 9. Trata popup bloqueado ou fechamento manual da janela pelo usuário;
 * 10. Fornece método de cancelamento / limpeza para uso no unmount de componentes React.
 */
export async function iniciarConexaoBling(
  options: IniciarConexaoBlingOptions = {},
): Promise<IniciarConexaoBlingRetorno> {
  const {
    onStatusChange,
    onSuccess,
    onError,
    pollIntervalMs = 2000,
    maxTimeoutMs = 5 * 60 * 1000,
  } = options

  let pollingTimer: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let popupRef: Window | null = null
  let finalizado = false

  const limparRecursos = () => {
    finalizado = true
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  // 1. Abrir popup neutro em about:blank (ação síncrona dentro do clique do usuário)
  const width = 650
  const height = 750
  const left = typeof window !== 'undefined' ? Math.max(0, (window.screen.width - width) / 2) : 0
  const top = typeof window !== 'undefined' ? Math.max(0, (window.screen.height - height) / 2) : 0

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      popupRef = window.open(
        'about:blank',
        'oauth_bling_popup',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no`,
      )
    } catch (_) {
      popupRef = null
    }
  }

  // Se o popup abriu, exibir mensagem neutra temporária enquanto backend responde
  if (popupRef && popupRef.document) {
    try {
      popupRef.document.title = 'Conectando ao Bling ERP...'
      popupRef.document.body.innerHTML = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F8FAFC; color: #0F172A; text-align: center; padding: 20px; box-sizing: border-box;">
          <div>
            <div style="width: 40px; height: 40px; border: 3px solid #E2E8F0; border-top-color: #16A34A; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px auto;"></div>
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">Iniciando conexão segura com o Bling...</h3>
            <p style="margin: 0; font-size: 13px; color: #64748B;">Aguarde o redirecionamento para o ambiente oficial de autorização do Bling ERP.</p>
          </div>
          <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        </div>
      `
    } catch (_) {
      // Falha silenciosa em caso de restrição do navegador
    }
  }

  try {
    // 2. Chamar o backend para gerar state e URL oficial
    const res = await pb.send<{
      success: boolean
      auth_url?: string
      state?: string
      message?: string
      configurado?: boolean
    }>('/backend/v1/bling/connect?format=json', {
      method: 'GET',
    })

    // 3. Validar resposta
    if (!res || !res.success || !res.auth_url) {
      if (popupRef && !popupRef.closed) {
        try {
          popupRef.close()
        } catch {
          /* intentionally ignored */
        }
      }
      const msgErro =
        res?.message ||
        'Segredos do Bling (BLING_CLIENT_ID / BLING_CLIENT_SECRET) não configurados no servidor.'
      onError?.(msgErro)
      limparRecursos()
      return { cancelar: limparRecursos }
    }

    // 4. Validar que a auth_url é do Bling oficial e NÃO do CRM local
    const urlStr = res.auth_url
    const isBlingOficial =
      urlStr.startsWith('https://www.bling.com.br/') || urlStr.startsWith('https://bling.com.br/')

    if (!isBlingOficial) {
      if (popupRef && !popupRef.closed) {
        try {
          popupRef.close()
        } catch {
          /* intentionally ignored */
        }
      }
      const msgInvalida = 'URL de autorização retornada pelo servidor não pertence ao Bling ERP.'
      onError?.(msgInvalida)
      limparRecursos()
      return { cancelar: limparRecursos }
    }

    // 5. Navegar o popup para a URL do Bling (ou redirecionar na aba se bloqueado)
    if (popupRef && !popupRef.closed) {
      try {
        popupRef.location.href = urlStr
        popupRef.focus()
      } catch (_) {
        if (typeof window !== 'undefined') {
          window.location.href = urlStr
        }
      }
    } else {
      // 9. Popup bloqueado: navega na própria janela
      if (typeof window !== 'undefined') {
        window.location.href = urlStr
      }
    }

    // 6. Iniciar polling de status no backend
    const verificarStatus = async () => {
      if (finalizado) return
      try {
        const statusRes = await pb.send<{
          conectado: boolean
          status: string
          ultimo_erro?: string | null
        }>('/backend/v1/bling/status', {
          method: 'GET',
        })

        if (finalizado) return

        if (statusRes) {
          onStatusChange?.({
            conectado: Boolean(statusRes.conectado),
            status: statusRes.status || 'desconectado',
            ultimo_erro: statusRes.ultimo_erro,
          })

          // 7. Parar polling assim que a conexão for detectada
          if (statusRes.conectado || statusRes.status === 'conectado') {
            limparRecursos()
            if (popupRef && !popupRef.closed) {
              try {
                popupRef.close()
              } catch {
                /* intentionally ignored */
              }
            }
            onSuccess?.()
            return
          }
        }
      } catch (_) {
        // Ignora erros transitórios de rede durante o polling
      }
    }

    pollingTimer = setInterval(verificarStatus, pollIntervalMs)

    // 8. Tratar timeout máximo (5 minutos)
    timeoutTimer = setTimeout(() => {
      if (!finalizado) {
        limparRecursos()
        onError?.('Tempo limite excedido aguardando autorização no Bling ERP (5 minutos).')
      }
    }, maxTimeoutMs)

    // Primeira checagem rápida após 1 segundo
    setTimeout(verificarStatus, 1000)

    return {
      cancelar: () => {
        limparRecursos()
        if (popupRef && !popupRef.closed) {
          try {
            popupRef.close()
          } catch {
            /* intentionally ignored */
          }
        }
      },
    }
  } catch (err) {
    if (popupRef && !popupRef.closed) {
      try {
        popupRef.close()
      } catch {
        /* intentionally ignored */
      }
    }
    const msg = getErrorMessage(err)
    onError?.(msg)
    limparRecursos()
    return { cancelar: limparRecursos }
  }
}
