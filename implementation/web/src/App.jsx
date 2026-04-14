import { useState } from 'preact/hooks'
import { getToken, setToken } from './api'
import { LoginPage } from './pages/LoginPage'
import { EntityBrowser } from './pages/EntityBrowser'

export function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken())

  function handleLogin(token) {
    setToken(token)
    setAuthenticated(true)
  }

  function handleLogout() {
    setToken(null)
    setAuthenticated(false)
  }

  if (!authenticated) {
    return <LoginPage onLogin={handleLogin} />
  }

  return <EntityBrowser onLogout={handleLogout} />
}
