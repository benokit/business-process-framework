// Extract the CJSL schema data object from a resolved schema envelope
// { $id?, $data, $locals? } — or return the value as-is if it's already raw data.
function schemaData(schema) {
  return (schema && typeof schema === 'object' && '$data' in schema) ? schema.$data : schema
}

// Extract the $locals dictionary from a resolved schema envelope, or null.
function schemaLocals(schema) {
  return (schema && typeof schema === 'object' && schema.$locals) || null
}

// Follow @ref chains through locals until a concrete CJSL type value is reached.
// Returns an object (nested schema data), a primitive string, or the original value
// when the ref cannot be resolved (e.g. unregistered or @# local refs are left as-is).
function resolveType(type, locals) {
  if (typeof type === 'string' && type.startsWith('@') && !type.startsWith('@#')) {
    const id = type.slice(1)
    if (locals && id in locals) return resolveType(locals[id], locals)
  }
  return type
}

const CJSL_POSTFIXES = ['#&', '#1', '#', '=1', '()', '$$', '[]', '{}', '=', '']

function parseKey(key) {
  const required = key.startsWith('!')
  let name = key.replace(/^!/, '')

  let postfix = ''
  for (const pf of CJSL_POSTFIXES) {
    if (name.endsWith(pf)) {
      postfix = pf
      break
    }
  }
  name = name.slice(0, name.length - postfix.length)

  return {
    name,
    required,
    postfix,
    isFixed: postfix === '=',
    isArray: postfix === '[]',
    isMap: postfix === '{}',
    isTuple: postfix === '()',
    isAnyOf: postfix === '#',
    isOneOf: postfix === '#1',
    isAllOf: postfix === '#&',
    isEnum: postfix === '=1',
    isInlineObject: postfix === '$$'
  }
}

// Map a resolved CJSL primitive type + field name to an HTML input type.
function primitiveInputType(type, name) {
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'checkbox'
  if (type === 'string') {
    if (name.toLowerCase().includes('email')) return 'email'
    if (name.toLowerCase().includes('password')) return 'password'
  }
  return 'text'
}

function PrimitiveInput({ inputType, value, onChange, disabled, required }) {
  if (inputType === 'checkbox') {
    return (
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{value ? 'true' : 'false'}</span>
      </label>
    )
  }
  return (
    <input
      type={inputType}
      disabled={disabled}
      value={value ?? ''}
      required={required}
      onInput={e => onChange(inputType === 'number' ? Number(e.target.value) : e.target.value)}
    />
  )
}

function JsonTextarea({ value, onChange, disabled, rows = 3 }) {
  return (
    <textarea
      rows={rows}
      disabled={disabled}
      placeholder="JSON value"
      value={value !== undefined ? JSON.stringify(value, null, 2) : ''}
      onInput={e => {
        try { onChange(JSON.parse(e.target.value)) } catch {}
      }}
    />
  )
}

function EnumSelect({ options, value, onChange, disabled }) {
  return (
    <select
      disabled={disabled}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      class="select-input"
    >
      <option value="">— Select —</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

function OneOfSelector({ variants, locals, value, onChange, disabled, name }) {
  const selectedIndex = typeof value === 'object' && value !== null && '_variantIndex' in value
    ? value._variantIndex
    : null

  function selectVariant(index) {
    const variant = variants[index]
    const emptyValue = getEmptyValue(variant)
    onChange({ ...emptyValue, _variantIndex: index })
  }

  function setVariantField(fieldName, fieldVal) {
    if (selectedIndex === null) return
    onChange({ ...value, [fieldName]: fieldVal })
  }

  const variantLabels = variants.map((v, i) => getVariantLabel(v, i))

  return (
    <div class="oneof-selector">
      <div class="oneof-options">
        {variants.map((variant, i) => (
          <label key={i} class={`oneof-option ${selectedIndex === i ? 'selected' : ''}`}>
            <input
              type="radio"
              name={`${name}-oneof`}
              checked={selectedIndex === i}
              disabled={disabled}
              onChange={() => selectVariant(i)}
            />
            <span>{variantLabels[i]}</span>
          </label>
        ))}
      </div>
      {selectedIndex !== null && (
        <div class="oneof-selected-form">
          <SchemaForm
            schema={{ $data: variants[selectedIndex], $locals: locals }}
            value={value ?? {}}
            onChange={setVariantField}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

function AllOfMerger({ schemas, locals, value, onChange, disabled }) {
  const mergedData = {}
  for (const schema of schemas) {
    if (schema && typeof schema === 'object') {
      Object.assign(mergedData, schema)
    }
  }
  return (
    <SchemaForm
      schema={{ $data: mergedData, $locals: locals }}
      value={value ?? {}}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

function TupleEditor({ itemTypes, locals, value, onChange, disabled, name }) {
  const items = Array.isArray(value) ? value : []
  const types = Array.isArray(itemTypes) ? itemTypes : []

  function setItem(i, val) {
    const next = [...items]
    next[i] = val
    onChange(next)
  }

  return (
    <div class="tuple-editor">
      {types.map((type, i) => {
        const itemVal = items[i]
        const resolved = resolveType(type, locals)
        const isNested = resolved !== null && typeof resolved === 'object'

        return (
          <div class="tuple-item" key={i}>
            <label class="tuple-item-label">[{i}]</label>
            {isNested ? (
              <SchemaForm
                schema={{ $data: resolved, $locals: locals }}
                value={itemVal ?? {}}
                onChange={v => setItem(i, v)}
                disabled={disabled}
              />
            ) : typeof resolved === 'string' ? (
              <PrimitiveInput
                inputType={primitiveInputType(resolved, `${name}[${i}]`)}
                value={itemVal}
                onChange={v => setItem(i, v)}
                disabled={disabled}
              />
            ) : (
              <JsonTextarea
                value={itemVal}
                onChange={v => setItem(i, v)}
                disabled={disabled}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function getEmptyValue(schema) {
  if (!schema || typeof schema !== 'object') return {}
  const result = {}
  for (const [key, val] of Object.entries(schema)) {
    if (key.startsWith('$')) continue
    const parsed = parseKey(key)
    if (parsed.isArray) {
      result[parsed.name] = []
    } else if (parsed.isMap) {
      result[parsed.name] = {}
    } else if (parsed.isTuple) {
      result[parsed.name] = []
    } else if (typeof val === 'string' && val === 'number') {
      result[parsed.name] = 0
    } else if (typeof val === 'string' && val === 'boolean') {
      result[parsed.name] = false
    } else if (typeof val === 'object') {
      result[parsed.name] = getEmptyValue(val)
    } else {
      result[parsed.name] = ''
    }
  }
  return result
}

function getVariantLabel(variant, index) {
  if (!variant || typeof variant !== 'object') return `Variant ${index + 1}`
  const keys = Object.keys(variant).filter(k => !k.startsWith('$'))
  if (keys.length === 0) return `Variant ${index + 1}`
  const requiredKeys = keys.filter(k => k.startsWith('!'))
  const displayKeys = requiredKeys.length > 0 ? requiredKeys : keys.slice(0, 2)
  const labels = displayKeys.map(k => {
    const parsed = parseKey(k)
    const val = variant[k]
    if (typeof val === 'string' && val !== 'object') return val
    return parsed.name
  })
  return labels.join(', ') || `Variant ${index + 1}`
}

// Handles both arrays of primitives and arrays of nested schema objects.
function ArrayEditor({ itemType, locals, value, onChange, disabled, name }) {
  const items = Array.isArray(value) ? value : []
  const isNested = itemType !== null && typeof itemType === 'object'
  const iType = isNested ? null : primitiveInputType(itemType, name)

  function setItem(i, val) {
    const next = [...items]
    next[i] = val
    onChange(next)
  }

  function addItem() {
    const empty = isNested ? {} : iType === 'number' ? 0 : iType === 'checkbox' ? false : ''
    onChange([...items, empty])
  }

  function removeItem(i) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  return (
    <div class="array-editor">
      {items.map((item, i) => (
        <div class={`array-item${isNested ? ' array-item-nested' : ''}`} key={i}>
          {isNested ? (
            <>
              <div class="array-item-header">
                <span class="array-item-index">#{i + 1}</span>
                {!disabled && (
                  <button type="button" class="btn btn-ghost btn-xs" onClick={() => removeItem(i)}>
                    ×
                  </button>
                )}
              </div>
              <SchemaForm
                schema={{ $data: itemType, $locals: locals }}
                value={item ?? {}}
                onChange={v => setItem(i, v)}
                disabled={disabled}
              />
            </>
          ) : (
            <>
              <PrimitiveInput
                inputType={iType}
                value={item}
                onChange={v => setItem(i, v)}
                disabled={disabled}
              />
              {!disabled && (
                <button type="button" class="btn btn-ghost btn-xs" onClick={() => removeItem(i)}>
                  ×
                </button>
              )}
            </>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" class="btn btn-ghost btn-sm array-add-btn" onClick={addItem}>
          + Add item
        </button>
      )}
    </div>
  )
}

export function SchemaForm({ schema, value = {}, onChange, disabled }) {
  const locals = schemaLocals(schema)
  const data = schemaData(schema)

  if (!data || typeof data !== 'object') {
    return (
      <div class="field">
        <label>Data (JSON)</label>
        <JsonTextarea value={value} onChange={onChange} disabled={disabled} rows={8} />
      </div>
    )
  }

  if (Array.isArray(data)) {
    return (
      <div class="field">
        <label>Data (JSON)</label>
        <JsonTextarea value={value} onChange={onChange} disabled={disabled} rows={8} />
      </div>
    )
  }

  if (data['$data#1']) {
    const variants = Array.isArray(data['$data#1']) ? data['$data#1'] : [data['$data#1']]
    return (
      <OneOfSelector
        variants={variants}
        locals={locals}
        value={value}
        onChange={onChange}
        disabled={disabled}
        name="root"
      />
    )
  }

  if (data['$data#&']) {
    const schemas = Array.isArray(data['$data#&']) ? data['$data#&'] : [data['$data#&']]
    return (
      <AllOfMerger
        schemas={schemas}
        locals={locals}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  const entries = Object.entries(data).filter(([key]) => !key.startsWith('$'))

  if (entries.length === 0) {
    return (
      <div class="field">
        <label>Data (JSON)</label>
        <JsonTextarea value={value} onChange={onChange} disabled={disabled} rows={8} />
      </div>
    )
  }

  function setField(fieldName, val) {
    onChange({ ...(value ?? {}), [fieldName]: val })
  }

  return (
    <div class="schema-form">
      {entries.map(([key, typeValue]) => {
        const parsed = parseKey(key)
        const { name, required, isFixed, isArray, isMap, isTuple, isAnyOf, isOneOf, isAllOf, isEnum, isInlineObject } = parsed
        const fieldVal = value?.[name]
        const resolved = resolveType(typeValue, locals)
        const isNested = resolved !== null && typeof resolved === 'object'

        return (
          <div class="field" key={name}>
            <label>
              {name}
              {required && <span class="required" title="Required"> *</span>}
            </label>

            {isFixed ? (
              <input type="text" value={fieldVal ?? ''} disabled />
            ) : isEnum ? (
              <EnumSelect
                options={Array.isArray(typeValue) ? typeValue : [typeValue]}
                value={fieldVal}
                onChange={v => setField(name, v)}
                disabled={disabled}
              />
            ) : isAnyOf || isOneOf ? (
              <OneOfSelector
                variants={Array.isArray(resolved) ? resolved : [resolved]}
                locals={locals}
                value={fieldVal}
                onChange={v => setField(name, v)}
                disabled={disabled}
                name={name}
              />
            ) : isAllOf ? (
              <AllOfMerger
                schemas={Array.isArray(resolved) ? resolved : [resolved]}
                locals={locals}
                value={fieldVal ?? {}}
                onChange={v => setField(name, v)}
                disabled={disabled}
              />
            ) : isTuple ? (
              <TupleEditor
                itemTypes={Array.isArray(typeValue) ? typeValue : typeValue.split(',')}
                locals={locals}
                value={fieldVal}
                onChange={v => setField(name, v)}
                disabled={disabled}
                name={name}
              />
            ) : isMap ? (
              <JsonTextarea value={fieldVal} onChange={v => setField(name, v)} disabled={disabled} />
            ) : isArray ? (
              <ArrayEditor
                itemType={resolved}
                locals={locals}
                value={fieldVal}
                onChange={v => setField(name, v)}
                disabled={disabled}
                name={name}
              />
            ) : isInlineObject || isNested ? (
              <div class="nested-schema">
                <SchemaForm
                  schema={{ $data: isInlineObject ? typeValue : resolved, $locals: locals }}
                  value={fieldVal ?? {}}
                  onChange={v => setField(name, v)}
                  disabled={disabled}
                />
              </div>
            ) : typeof resolved === 'string' ? (
              <PrimitiveInput
                inputType={primitiveInputType(resolved, name)}
                value={fieldVal}
                onChange={v => setField(name, v)}
                disabled={disabled}
                required={required}
              />
            ) : (
              <JsonTextarea value={fieldVal} onChange={v => setField(name, v)} disabled={disabled} />
            )}
          </div>
        )
      })}
    </div>
  )
}
