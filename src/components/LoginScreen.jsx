import { useState } from 'react'
import { useServer } from '../context/ServerContext.jsx'

// Shown instead of the dashboard when the server has a password set and this
// browser isn't signed in.
export default function LoginScreen() {
  const { login } = useServer()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      await login(password)
    } catch (err) {
      setError(err.message || 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card glass" onSubmit={submit}>
        <div className="brand-logo login-logo">🗂️</div>
        <h1>HomeDash</h1>
        <p className="muted">This dashboard is password protected.</p>
        <input
          className="input"
          type="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="err-msg">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
