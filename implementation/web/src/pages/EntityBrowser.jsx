import { useState, useEffect } from 'preact/hooks'
import { api, getToken } from '../api'
import { EntityList } from '../components/EntityList'
import { EntityForm } from '../components/EntityForm'

export function EntityBrowser({ onLogout }) {
  const [entityTypes, setEntityTypes] = useState([])
  const [typesError, setTypesError] = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'create' | 'edit'
  const [editRecord, setEditRecord] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    api.listEntityTypes()
      .then(res => {
        setEntityTypes(res.items)
        if (res.items.length > 0) setSelectedType(res.items[0])
      })
      .catch(err => setTypesError(err.message))
  }, [])

  function selectType(type) {
    setSelectedType(type)
    setView('list')
    setEditRecord(null)
    setSidebarOpen(false)
  }

  function handleEdit(record) {
    setEditRecord(record)
    setView('edit')
  }

  function handleSave() {
    setView('list')
    setEditRecord(null)
    setRefreshKey(k => k + 1)
  }

  function handleCancel() {
    setView('list')
    setEditRecord(null)
  }

  const username = parseTokenUsername(getToken())

  return (
    <div class="app-layout">
      {/* Mobile sidebar toggle */}
      <button
        class="sidebar-toggle"
        onClick={() => setSidebarOpen(o => !o)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* Sidebar */}
      <aside class={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div class="sidebar-header">
          <span class="sidebar-logo">BPF</span>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Entity Types</div>
          {typesError ? (
            <div class="nav-error">{typesError}</div>
          ) : entityTypes.length === 0 ? (
            <div class="nav-empty">Loading…</div>
          ) : (
            entityTypes.map(type => (
              <button
                key={type.id}
                class={`nav-item ${selectedType?.id === type.id ? 'active' : ''}`}
                onClick={() => selectType(type)}
              >
                <span class="nav-item-icon">◈</span>
                {type.id}
              </button>
            ))
          )}
        </nav>

        <div class="sidebar-footer">
          {username && <div class="sidebar-user">{username}</div>}
          <button class="btn btn-ghost btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div class="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main class="main-content">
        {!selectedType ? (
          <div class="empty-state center">
            <p>Select an entity type from the sidebar.</p>
          </div>
        ) : view === 'list' ? (
          <EntityList
            entityType={selectedType.id}
            statesModel={selectedType.statesModel}
            onEdit={handleEdit}
            onCreateNew={() => setView('create')}
            refreshKey={refreshKey}
          />
        ) : (
          <EntityForm
            entityType={selectedType.id}
            entityTypeSchema={selectedType.dataSchema}
            record={view === 'edit' ? editRecord : null}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </main>
    </div>
  )
}

function parseTokenUsername(token) {
  if (!token) return null
  try {
    // JWT uses base64url — replace chars before atob
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return payload.username ?? payload.sub ?? null
  } catch {
    return null
  }
}
