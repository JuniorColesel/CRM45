import React, { createContext, useContext, useEffect, useState } from 'react'
import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export type PerfilUsuario =
  | 'ceo_financeiro'
  | 'coordenador_vendas'
  | 'compras_grandes_clientes'
  | 'estoque'
  | 'vendedor_1'
  | 'vendedor_2'

export interface Usuario extends RecordModel {
  nome: string
  email: string
  perfil: PerfilUsuario
  ativo: boolean
  criado_em?: string
}

interface AuthContextType {
  user: Usuario | null
  loading: boolean
  login: (email: string, senha: string) => Promise<Usuario>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(() => {
    return pb.authStore.isValid && pb.authStore.record
      ? (pb.authStore.record as unknown as Usuario)
      : null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Escuta mudanças de authStore do PocketBase
    const unsubscribe = pb.authStore.onChange((_token, model) => {
      setUser((model as unknown as Usuario) || null)
    })

    // Valida o token existente no carregamento se houver sessão armazenada
    if (pb.authStore.isValid) {
      pb.collection('usuarios')
        .authRefresh()
        .then((authData) => {
          setUser((authData.record as unknown as Usuario) || null)
        })
        .catch(() => {
          pb.authStore.clear()
          setUser(null)
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, senha: string): Promise<Usuario> => {
    const authData = await pb.collection('usuarios').authWithPassword(email, senha)
    const record = authData.record as unknown as Usuario
    setUser(record)
    return record
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
