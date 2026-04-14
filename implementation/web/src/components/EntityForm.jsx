import { useState, useEffect } from 'preact/hooks'
import { api } from '../api'
import { SchemaForm } from './SchemaForm'

export function EntityForm({ entityType, entityTypeSchema, record, onSave, onCancel }) {
  const isEdit = !!record
  const [businessKey, setBusinessKey] = useState(record?.businessKey ?? '')
  const [data, setData] = useState(record?.data ?? {})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setBusinessKey(record?.businessKey ?? '')
    setData(record?.data ?? {})
    setError(null)
  }, [record])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let saved
      if (isEdit) {
        saved = await api.updateEntity(entityType, record.businessKey, record.revision, data)
      } else {
        saved = await api.createEntity(entityType, { businessKey: businessKey || undefined, data })
      }
      onSave(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="panel">
      <div class="panel-header">
        <h2>{isEdit ? `Edit — ${record.businessKey}` : `New ${entityType}`}</h2>
        <button class="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>

      {error && <div class="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} class="form-body">
        {!isEdit && (
          <div class="field">
            <label>
              Business key
              <span class="field-hint"> (leave blank to auto-generate)</span>
            </label>
            <input
              type="text"
              value={businessKey}
              onInput={e => setBusinessKey(e.target.value)}
              placeholder="Unique identifier"
            />
          </div>
        )}

        {isEdit && (
          <div class="field">
            <label>Business key</label>
            <input type="text" value={record.businessKey} disabled />
          </div>
        )}

        <div class="field-section-title">Data</div>
        <SchemaForm
          schema={entityTypeSchema}
          value={data}
          onChange={setData}
          disabled={loading}
        />

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
          <button type="button" class="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
