// Minimal JSON-Schema validator for the dashboard tool inputs (the subset the
// tool definitions use: type, enum, properties, required, additionalProperties,
// items, minimum/maximum, minLength/maxLength). Model-supplied input is
// untrusted, so every tool call is checked before it runs.

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)

function matchesType(value, type) {
  const t = typeOf(value)
  const types = Array.isArray(type) ? type : [type]
  return types.some((want) => want === t || (want === 'number' && t === 'integer'))
}

// Returns null when valid, otherwise a short human-readable error.
export function validate(schema, value, path = 'input') {
  if (!schema) return null
  if (schema.type && !matchesType(value, schema.type)) {
    return `${path} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) return `${path} is too short`
    if (schema.maxLength != null && value.length > schema.maxLength) return `${path} is too long (max ${schema.maxLength} characters)`
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) return `${path} must be ≥ ${schema.minimum}`
    if (schema.maximum != null && value > schema.maximum) return `${path} must be ≤ ${schema.maximum}`
  }
  if (typeOf(value) === 'object') {
    const props = schema.properties || {}
    for (const key of schema.required || []) {
      if (value[key] === undefined) return `${path}.${key} is required`
    }
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) {
        const err = validate(props[key], v, `${path}.${key}`)
        if (err) return err
      } else if (schema.additionalProperties === false) {
        return `${path}.${key} is not a known field`
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    if (schema.maxItems != null && value.length > schema.maxItems) return `${path} has too many items`
    for (let i = 0; i < value.length; i++) {
      const err = validate(schema.items, value[i], `${path}[${i}]`)
      if (err) return err
    }
  }
  return null
}
