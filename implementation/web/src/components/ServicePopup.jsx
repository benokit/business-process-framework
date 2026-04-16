import { useState, useEffect } from 'preact/hooks'
import { api } from '../api'
import { SchemaForm } from './SchemaForm'

function formatLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function ServicePopup({ entityType, entity, services, onClose, onSuccess }) {
  const [selectedService, setSelectedService] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState(null)
  const [formData, setFormData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (services?.length > 0) setSelectedService(services[0])
  }, [services])

  useEffect(() => {
    if (selectedService?.interface) {
      const methods = Object.keys(selectedService.interface)
      if (methods.length > 0) setSelectedMethod(methods[0])
    }
    setError(null)
    setResult(null)
  }, [selectedService])

  useEffect(() => {
    setFormData({})
    setError(null)
    setResult(null)
  }, [selectedMethod])

  const methodInterface = selectedService?.interface?.[selectedMethod]
  const inputSchema = methodInterface?.input
  const hasInputFields = inputSchema && typeof inputSchema === 'object' && !Array.isArray(inputSchema)
  const methodOptions = selectedService?.interface ? Object.keys(selectedService.interface) : []

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedService || !selectedMethod) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await api.executeService(
        entityType,
        entity.businessKey,
        entity.revision,
        selectedMethod,
        formData
      )
      setResult(res)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal" onClick={e => e.stopPropagation()}>
        <div class="modal-header">
          <div>
            <h3>Execute action</h3>
            <div class="modal-subtitle">{entity.businessKey} &middot; rev {entity.revision}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onClick={onClose}>&#x2715;</button>
        </div>

        {result ? (
          <>
            <div class="modal-body">
              <div class="service-result-notice">Action completed successfully.</div>
              {result && Object.keys(result).length > 0 && (
                <div class="form-group">
                  <label>Result</label>
                  <pre class="result-json">{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
            <div class="modal-footer">
              <button class="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div class="modal-body">
              {services.length > 1 && (
                <div class="form-group">
                  <label>Service</label>
                  <select
                    class="select-input"
                    value={selectedService?.id || ''}
                    onChange={e => setSelectedService(services.find(s => s.id === e.target.value))}
                    disabled={submitting}
                  >
                    {services.map(svc => (
                      <option key={svc.id} value={svc.id}>{formatLabel(svc.id)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div class="form-group">
                <label>Method</label>
                <select
                  class="select-input"
                  value={selectedMethod || ''}
                  onChange={e => setSelectedMethod(e.target.value)}
                  disabled={submitting}
                >
                  {methodOptions.map(m => (
                    <option key={m} value={m}>{formatLabel(m)}</option>
                  ))}
                </select>
              </div>

              {hasInputFields ? (
                <div class="form-group">
                  <label>Input</label>
                  <div class="form-group-body">
                    <SchemaForm
                      schema={{ $data: inputSchema }}
                      value={formData}
                      onChange={setFormData}
                      disabled={submitting}
                    />
                  </div>
                </div>
              ) : (
                <p class="service-no-input">No input required for this method.</p>
              )}

              {error && <div class="alert alert-error">{error}</div>}
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" disabled={submitting || !selectedMethod}>
                {submitting ? 'Executing…' : 'Execute'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
