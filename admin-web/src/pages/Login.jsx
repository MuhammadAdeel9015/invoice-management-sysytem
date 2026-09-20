import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../services/api'

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (session) navigate('/dashboard', { replace: true }) }, [session, navigate])
  if (session) return <Navigate to="/dashboard" replace />

  async function submit(event) {
    event.preventDefault(); setError('')
    if (!username.trim() || !password) return setError('Enter both username and password.')
    setBusy(true)
    try { await signIn(username.trim(), password); navigate(location.state?.from?.pathname || '/dashboard', { replace: true }) } catch (err) { setError(err.message || errorMessage(err, 'Unable to sign in. Check your credentials.')) } finally { setBusy(false) }
  }

  return <main className="login-page"><section className="login-art"><div className="login-art-copy"><span className="kicker">Office Invoices</span><h1>Make every receipt count.</h1><p>A focused workspace for reviewing spend, people, and invoice activity.</p><div className="login-art-line" /></div></section><section className="login-panel"><div className="login-form-wrap"><div className="brand compact"><div className="brand-mark">OI</div><div><strong>Office Invoices</strong><span>Administrator access</span></div></div><div className="login-heading"><p className="eyebrow">Secure portal</p><h2>Welcome back</h2><p>Sign in with an administrator account to continue.</p></div><form onSubmit={submit} className="form-stack"><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="admin" /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Enter password" /></label>{error && <div className="inline-error">{error}</div>}<button className="button button-primary button-block" disabled={busy}>{busy ? 'Signing in...' : 'Sign in to admin'}</button></form><p className="login-note">Administrator access is verified by the existing backend role system.</p></div></section></main>
}