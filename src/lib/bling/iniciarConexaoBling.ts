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

  // Limpeza preventiva de chaves de storage antes de iniciar fluxo de conexão
  if (typeof window !== 'undefined') {
    try {
      const chavesLimpeza = [
        'crm_colesel45_bling_aguardando',
        'crm_colesel45_bling_oauth_state',
        'crm_colesel45_bling_popup',
        'bling_oauth_state',
        'bling_token',
        'STORAGE_BLING_TOKEN',
      ]
      chavesLimpeza.forEach((k) => {
        localStorage.removeItem(k)
        sessionStorage.removeItem(k)
      })
    } catch {
      /* ignorar restrições de storage */
    }
  }

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
      authorization_url?: string
      url_autorizacao?: string
      url?: string
      state?: string
      message?: string
      configurado?: boolean
    }>('/backend/v1/bling/connect?format=json', {
      method: 'GET',
    })

    // 3. Extrair a URL retornada com suporte prioritário a auth_url (campo exato do backend)
    const rawAuthUrl =
      res?.auth_url || res?.authorization_url || res?.url_autorizacao || res?.url || ''

    // 4. Validar payload e presença da URL
    if (
      !res ||
      !res.success ||
      !rawAuthUrl ||
      typeof rawAuthUrl !== 'string' ||
      !rawAuthUrl.trim()
    ) {
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

    // 5. Validar a URL antes de navegar:
    // - Deve ser URL válida construída via new URL(authUrl);
    // - Aceitar SOMENTE o hostname oficial usado pelo OAuth do Bling no backend (www.bling.com.br);
    // - Começar estritamente com https://;
    // - Conter response_type=code, client_id, redirect_uri e state nos searchParams;
    // - NUNCA aceitar rotas internas do CRM nem URLs relativas.
    let parsed: URL
    try {
      parsed = new URL(rawAuthUrl.trim())
    } catch (_) {
      if (popupRef && !popupRef.closed) {
        try {
          popupRef.close()
        } catch {
          /* intentionally ignored */
        }
      }
      onError?.('URL de autorização inválida retornada pelo servidor.')
      limparRecursos()
      return { cancelar: limparRecursos }
    }

    const protocoloValido = parsed.protocol === 'https:'
    const hostnameValido = parsed.hostname === 'www.bling.com.br'
    const temResponseTypeCode = parsed.searchParams.get('response_type') === 'code'
    const temClientId = Boolean(parsed.searchParams.get('client_id'))
    const temRedirectUri = Boolean(parsed.searchParams.get('redirect_uri'))
    const temState = Boolean(parsed.searchParams.get('state'))

    if (
      !protocoloValido ||
      !hostnameValido ||
      !temResponseTypeCode ||
      !temClientId ||
      !temRedirectUri ||
      !temState
    ) {
      if (popupRef && !popupRef.closed) {
        try {
          popupRef.close()
        } catch {
          /* intentionally ignored */
        }
      }
      const msgInvalida =
        'URL de autorização retornada pelo servidor não pertence ao Bling ERP ou possui parâmetros ausentes.'
      onError?.(msgInvalida)
      limparRecursos()
      return { cancelar: limparRecursos }
    }

    const authUrlValida = parsed.toString()

    // 6. Navegar o popup aberto em about:blank diretamente para a URL oficial do Bling via replace/assign
    // Regra estrita: NUNCA usar como destino window.location.href, "/", "/painel", "/bling", etc.
    if (popupRef && !popupRef.closed) {
      try {
        if (typeof popupRef.location.replace === 'function') {
          popupRef.location.replace(authUrlValida)
        } else {
          popupRef.location.href = authUrlValida
        }
        popupRef.focus()
      } catch (_) {
        // Se cross-origin ou restrição do navegador impedir replace
        try {
          popupRef.location.href = authUrlValida
        } catch {
          /* intentionally ignored */
        }
      }
    } else {
      // Se o popup foi bloqueado pelo navegador, avisar explicitamente e não redirecionar o CRM
      onError?.(
        'O popup de autorização foi bloqueado pelo navegador. Por favor, permita popups para este site e tente novamente.',
      )
      limparRecursos()
      return { cancelar: limparRecursos }
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
