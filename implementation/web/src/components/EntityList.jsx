import { useState, useEffect } from 'preact/hooks'
import { api } from '../api'
import { ServicePopup } from './ServicePopup'

const PAGE_SIZE = 20

export function EntityList({ entityType, statesModel, onEdit, onCreateNew, refreshKey }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [transitioning, setTransitioning] = useState(null)
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [serviceEntity, setServiceEntity] = useState(null)

  useEffect(() => {
    setOffset(0)
  }, [entityType])

  useEffect(() => {
    loadServices()
  }, [entityType])

  async function loadServices() {
    try {
      setServicesLoading(true)
      const res = await api.getEntityServices(entityType)
      setServices(res.services || [])
    } catch {
      setServices([])
    } finally {
      setServicesLoading(false)
    }
  }

  function handleService(item) {
    setServiceEntity(item)
  }

  function handleServiceSuccess() {
    load()
  }

  useEffect(() => {
    load()
  }, [entityType, offset, refreshKey])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.listEntities(entityType, { limit: PAGE_SIZE, offset })
      setItems(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.businessKey}"?`)) return
    setDeleting(item.businessKey)
    try {
      await api.deleteEntity(entityType, item.businessKey, item.revision)
      await load()
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  async function handleTransition(item, transition) {
    setTransitioning(`${item.businessKey}:${transition}`)
    try {
      await api.transition(entityType, item.businessKey, transition)
      await load()
    } catch (err) {
      alert(`Transition failed: ${err.message}`)
    } finally {
      setTransitioning(null)
    }
  }

  const availableTransitions = statesModel?.transitions
    ? Object.keys(statesModel.transitions)
    : []

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div class="panel">
      <div class="panel-header">
        <div class="panel-header-left">
          <h2>{entityType}</h2>
          {!loading && <span class="badge">{total}</span>}
        </div>
        <button class="btn btn-primary" onClick={onCreateNew}>
          + New
        </button>
      </div>

      {error && <div class="alert alert-error">{error}</div>}

      {loading ? (
        <div class="loading-row">Loading…</div>
      ) : items.length === 0 ? (
        <div class="empty-state">
          <p>No {entityType} entities yet.</p>
          <button class="btn btn-primary" onClick={onCreateNew}>Create the first one</button>
        </div>
      ) : (
        <>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Business key</th>
                  <th>Revision</th>
                  {statesModel && <th>State</th>}
                  <th>Updated</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td class="cell-key">{item.businessKey}</td>
                    <td class="cell-rev">{item.revision}</td>
                    {statesModel && (
                      <td>
                        <StateBadges dimensions={item.state?.dimensions} />
                      </td>
                    )}
                    <td class="cell-date">{formatDate(item.timestampUtc)}</td>
                    <td class="cell-actions">
                      {availableTransitions.length > 0 && (
                        <div class="action-group">
                          {availableTransitions.map(t => (
                            <button
                              key={t}
                              class="btn btn-xs btn-outline"
                              disabled={!!transitioning}
                              onClick={() => handleTransition(item, t)}
                              title={`Transition: ${t}`}
                            >
                              {transitioning === `${item.businessKey}:${t}` ? '…' : t}
                            </button>
                          ))}
                        </div>
                      )}
                      <button class="btn btn-xs btn-ghost" onClick={() => onEdit(item)}>
                        Edit
                      </button>
                      {services.length > 0 && (
                        <button
                          class="btn btn-xs btn-outline"
                          disabled={servicesLoading}
                          onClick={() => handleService(item)}
                        >
                          Services
                        </button>
                      )}
                      <button
                        class="btn btn-xs btn-danger"
                        disabled={deleting === item.businessKey}
                        onClick={() => handleDelete(item)}
                      >
                        {deleting === item.businessKey ? '…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div class="pagination">
              <button
                class="btn btn-ghost btn-sm"
                disabled={currentPage === 1}
                onClick={() => setOffset(offset - PAGE_SIZE)}
              >
                ← Prev
              </button>
              <span class="page-info">Page {currentPage} / {totalPages}</span>
              <button
                class="btn btn-ghost btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {serviceEntity && services.length > 0 && (
        <ServicePopup
          entityType={entityType}
          entity={serviceEntity}
          services={services}
          onClose={() => setServiceEntity(null)}
          onSuccess={handleServiceSuccess}
        />
      )}
    </div>
  )
}

function StateBadges({ dimensions }) {
  if (!dimensions) return null
  return (
    <span class="state-badges">
      {Object.entries(dimensions).map(([dim, val]) => (
        <span key={dim} class={`state-badge state-${val}`}>{val}</span>
      ))}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
