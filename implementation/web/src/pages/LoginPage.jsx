import { useState } from 'preact/hooks'
import { api } from '../api'

export function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await api.login(username, password)
      onLogin(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="login-bg">
      <form class="login-card" onSubmit={handleSubmit}>
        <div class="login-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="var(--accent)" />
            <path d="M10 18h16M18 10v16" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 class="login-title">Business Framework</h1>
        <p class="login-subtitle">Sign in to continue</p>

        {error && <div class="alert alert-error">{error}</div>}

        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Enter username"
            value={username}
            onInput={e => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            value={password}
            onInput={e => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" class="btn btn-primary btn-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
