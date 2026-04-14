/**
 * Parses a CJSL schema object into an array of field descriptors.
 * CJSL key rules: "!field" = required, "field" = optional,
 * "field[]" = array, "field{}" = map, "!field=" = fixed value
 */
export function parseSchemaFields(schema) {
  if (!schema || typeof schema !== 'object') return null

  return Object.entries(schema)
    .filter(([key]) => !key.startsWith('$')) // skip one-of / allOf meta-keys
    .map(([key, type]) => {
      const required = key.startsWith('!')
      let name = key.replace(/^!/, '')
      const fixed = name.endsWith('=')
      const isArray = name.endsWith('[]')
      const isMap = name.endsWith('{}')
      name = name.replace(/[=\[\]{}]+$/, '')

      let inputType = 'text'
      let complex = false

      if (isArray || isMap || type === 'object') {
        complex = true
      } else if (typeof type === 'string' && type.startsWith('@')) {
        complex = true
      } else if (type === 'number') {
        inputType = 'number'
      } else if (type === 'boolean') {
        inputType = 'checkbox'
      } else if (type === 'string' && (name.toLowerCase().includes('email'))) {
        inputType = 'email'
      } else if (type === 'string' && name.toLowerCase().includes('password')) {
        inputType = 'password'
      }

      return { name, required, fixed, inputType, complex }
    })
}

export function SchemaForm({ schema, value = {}, onChange, disabled }) {
  const fields = parseSchemaFields(schema)

  // Fallback: no parsed schema → raw JSON textarea
  if (!fields) {
    return (
      <div class="field">
        <label>Data (JSON)</label>
        <textarea
          rows={8}
          disabled={disabled}
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : ''}
          onInput={e => {
            try { onChange(JSON.parse(e.target.value)) } catch {}
          }}
        />
      </div>
    )
  }

  function setField(name, val) {
    onChange({ ...value, [name]: val })
  }

  return (
    <div class="schema-form">
      {fields.map(({ name, required, fixed, inputType, complex }) => (
        <div class="field" key={name}>
          <label>
            {name}
            {required && <span class="required" title="Required"> *</span>}
          </label>
          {fixed ? (
            <input type="text" value={value[name] ?? ''} disabled />
          ) : complex ? (
            <textarea
              rows={3}
              disabled={disabled}
              placeholder="JSON value"
              value={value[name] !== undefined ? JSON.stringify(value[name], null, 2) : ''}
              onInput={e => {
                try { setField(name, JSON.parse(e.target.value)) } catch {}
              }}
            />
          ) : inputType === 'checkbox' ? (
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={!!value[name]}
                disabled={disabled}
                onChange={e => setField(name, e.target.checked)}
              />
              <span>{value[name] ? 'true' : 'false'}</span>
            </label>
          ) : (
            <input
              type={inputType}
              disabled={disabled}
              value={value[name] ?? ''}
              required={required}
              onInput={e =>
                setField(name, inputType === 'number' ? Number(e.target.value) : e.target.value)
              }
            />
          )}
        </div>
      ))}
    </div>
  )
}
