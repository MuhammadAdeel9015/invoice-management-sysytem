import { createContext, useContext, useMemo, useState } from 'react'
import { login as loginRequest } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem('admin_token')
    let user = null
    try { user = JSON.parse(localStorage.getItem('admin_user') || 'null') } catch { localStorage.removeItem('admin_user') }
    return token && user ? { token, user } : null
  })

  async function signIn(username, password) {
    const data = await loginRequest(username, password)
    if (data.user?.role !== 'admin') {
      throw new Error('This account does not have administrator access.')
    }
    localStorage.setItem('admin_token', data.token)
    localStorage.setItem('admin_user', JSON.stringify(data.user))
    setSession({ token: data.token, user: data.user })
  }

  function signOut() {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    setSession(null)
  }

  const value = useMemo(() => ({ session, signIn, signOut }), [session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}