const BASE = '/api'

let token = localStorage.getItem('token')

export function setToken(t) {
  token = t
  if (t) localStorage.setItem('token', t)
  else localStorage.removeItem('token')
}

export function getToken() {
  return token
}

async function request(method, path, body, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders
  }
  const opts = { method, headers }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)

  if (!res.ok) {
    let message = res.statusText
    try {
      const payload = await res.json()
      message = payload?.error ?? payload?.message ?? JSON.stringify(payload)
    } catch {
      message = await res.text().catch(() => res.statusText)
    }
    throw new Error(message)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  login: (username, password) =>
    request('POST', '/login', { username, password }),

  listEntityTypes: () =>
    request('GET', '/entity-types'),

  listEntities: (entityType, { limit = 50, offset = 0 } = {}) =>
    request('GET', `/entities/${entityType}?limit=${limit}&offset=${offset}`),

  getEntity: (entityType, businessKey) =>
    request('GET', `/entities/${entityType}/${encodeURIComponent(businessKey)}`),

  createEntity: (entityType, { businessKey, data, initialState }) =>
    request('POST', `/entities/${entityType}`, { businessKey, data, initialState }),

  updateEntity: (entityType, businessKey, revision, data) =>
    request('PUT', `/entities/${entityType}/${encodeURIComponent(businessKey)}`, { data }, {
      'If-Match': `"${revision}"`
    }),

  deleteEntity: (entityType, businessKey, revision) =>
    request('DELETE', `/entities/${entityType}/${encodeURIComponent(businessKey)}`, undefined, {
      'If-Match': `"${revision}"`
    }),

  transition: (entityType, businessKey, transition) =>
    request('POST', `/entities/${entityType}/${encodeURIComponent(businessKey)}/transitions/${transition}`)
}
