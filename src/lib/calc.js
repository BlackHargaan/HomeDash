// Safe calculator (no eval) + unit converter for the Calculator widget.
//   "2 * (3 + 4)^2", "sqrt(16) + 15% of 80", "ans / 2"
//   "5 km to mi", "72 f in c", "3 cups to ml", "1.5 GiB to MB"

// ------------------------------------------------------------ expressions

const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, ln: Math.log, exp: Math.exp, min: Math.min, max: Math.max,
}
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

function tokenize(src) {
  const tokens = []
  const re = /\s*(?:(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_π][a-z0-9_]*)|(\*\*|[-+*/^%()!,×÷−]))/giy
  let m
  let pos = 0
  re.lastIndex = 0
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break
    re.lastIndex = pos
    m = re.exec(src)
    if (!m) throw new Error(`Unexpected “${src.slice(pos).trim()[0]}”`)
    pos = re.lastIndex
    if (m[1] != null) tokens.push({ t: 'num', v: parseFloat(m[1].replace(',', '.')) })
    else if (m[2] != null) tokens.push({ t: 'id', v: m[2] === 'π' ? 'pi' : m[2].toLowerCase() })
    else {
      const op = { '**': '^', '×': '*', '÷': '/', '−': '-' }[m[3]] || m[3]
      tokens.push({ t: 'op', v: op })
    }
  }
  return tokens
}

export function evaluate(src, vars = {}) {
  // "15% of 80" → "(15/100)*80"
  const prepared = src.replace(/(\d+(?:\.\d+)?)\s*%\s*of\b/gi, '($1/100)*')
  const tokens = tokenize(prepared)
  if (!tokens.length) throw new Error('Empty expression')
  let i = 0
  const peek = () => tokens[i]
  const isOp = (v) => peek()?.t === 'op' && peek().v === v
  const startsOperand = (tk) => tk && (tk.t === 'num' || tk.t === 'id' || (tk.t === 'op' && tk.v === '('))

  function expr() {
    let v = term()
    while (isOp('+') || isOp('-')) {
      const op = tokens[i++].v
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  function term() {
    let v = unary()
    for (;;) {
      if (isOp('*') || isOp('/') || isOp('%')) {
        const op = tokens[i++].v
        const r = unary()
        if (op === '/' && r === 0) throw new Error('Division by zero')
        v = op === '*' ? v * r : op === '/' ? v / r : v % r
      } else if (peek()?.t === 'id' && peek().v === 'mod') {
        i++
        v = v % unary()
      } else if (startsOperand(peek())) {
        v = v * unary() // implicit multiplication: 2pi, 3(4+1)
      } else return v
    }
  }
  function unary() {
    if (isOp('-')) { i++; return -unary() }
    if (isOp('+')) { i++; return unary() }
    return power()
  }
  function power() {
    const base = postfix()
    if (isOp('^')) { i++; return base ** unary() }
    return base
  }
  function postfix() {
    let v = primary()
    for (;;) {
      if (isOp('!')) {
        i++
        if (v < 0 || !Number.isInteger(v) || v > 170) throw new Error('Factorial needs a whole number 0–170')
        let f = 1
        for (let k = 2; k <= v; k++) f *= k
        v = f
      } else if (isOp('%') && !startsOperand(tokens[i + 1])) {
        i++
        v = v / 100 // trailing percent: "50 * 10%"
      } else return v
    }
  }
  function primary() {
    const tk = tokens[i++]
    if (!tk) throw new Error('Incomplete expression')
    if (tk.t === 'num') return tk.v
    if (tk.t === 'op' && tk.v === '(') {
      const v = expr()
      if (!isOp(')')) throw new Error('Missing )')
      i++
      return v
    }
    if (tk.t === 'id') {
      if (FUNCS[tk.v]) {
        if (!isOp('(')) throw new Error(`${tk.v} needs parentheses`)
        i++
        const args = [expr()]
        while (isOp(',')) { i++; args.push(expr()) }
        if (!isOp(')')) throw new Error('Missing )')
        i++
        return FUNCS[tk.v](...args)
      }
      if (tk.v in vars) return vars[tk.v]
      if (tk.v in CONSTS) return CONSTS[tk.v]
      throw new Error(`Unknown “${tk.v}”`)
    }
    throw new Error(`Unexpected “${tk.v}”`)
  }

  const v = expr()
  if (i < tokens.length) throw new Error(`Unexpected “${tokens[i].v}”`)
  if (!Number.isFinite(v)) throw new Error('Result is not a finite number')
  return v
}

// ------------------------------------------------------------ units

// factor = how many base units one of this unit is.
const DIMENSIONS = {
  length: {
    m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9,
    mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852,
  },
  mass: {
    kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, ton: 907.18474,
  },
  volume: {
    l: 1, ml: 0.001, cl: 0.01, dl: 0.1, m3: 1000,
    gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365,
    floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375,
  },
  data: {
    b: 1, bit: 0.125, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15,
    kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
  },
  time: {
    s: 1, ms: 0.001, min: 60, h: 3600, d: 86400, wk: 604800, mo: 2629746, yr: 31556952,
  },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444, 'ft/s': 0.3048 },
  area: {
    m2: 1, km2: 1e6, cm2: 1e-4, ft2: 0.09290304, in2: 0.00064516, mi2: 2589988.110336, acre: 4046.8564224, ha: 10000,
  },
  temperature: { c: 1, f: 1, k: 1 },
}

const ALIASES = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  centimeter: 'cm', centimeters: 'cm', millimeter: 'mm', millimeters: 'mm', µm: 'um', micron: 'um',
  mile: 'mi', miles: 'mi', yard: 'yd', yards: 'yd', foot: 'ft', feet: 'ft', "'": 'ft', inch: 'in', inches: 'in', '"': 'in',
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', milligram: 'mg', milligrams: 'mg',
  tonne: 't', tonnes: 't', lbs: 'lb', pound: 'lb', pounds: 'lb', ounce: 'oz', ounces: 'oz', stone: 'st', tons: 'ton',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt', cups: 'cup',
  'fl oz': 'floz', 'fl. oz': 'floz', tablespoon: 'tbsp', tablespoons: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', 'm³': 'm3',
  byte: 'b', bytes: 'b', bits: 'bit', kilobyte: 'kb', kilobytes: 'kb', megabyte: 'mb', megabytes: 'mb',
  gigabyte: 'gb', gigabytes: 'gb', terabyte: 'tb', terabytes: 'tb',
  sec: 's', secs: 's', second: 's', seconds: 's', millisecond: 'ms', milliseconds: 'ms', mins: 'min', minute: 'min', minutes: 'min',
  hr: 'h', hrs: 'h', hour: 'h', hours: 'h', day: 'd', days: 'd', week: 'wk', weeks: 'wk', month: 'mo', months: 'mo',
  year: 'yr', years: 'yr', y: 'yr',
  kph: 'km/h', kmh: 'km/h', 'mi/h': 'mph', knot: 'kn', knots: 'kn', mps: 'm/s',
  'm²': 'm2', sqm: 'm2', 'km²': 'km2', 'cm²': 'cm2', 'ft²': 'ft2', sqft: 'ft2', 'sq ft': 'ft2', 'in²': 'in2', 'mi²': 'mi2',
  acres: 'acre', hectare: 'ha', hectares: 'ha',
  '°c': 'c', celsius: 'c', '°f': 'f', fahrenheit: 'f', kelvin: 'k',
}

const UNIT_INDEX = {}
for (const [dim, units] of Object.entries(DIMENSIONS)) for (const u of Object.keys(units)) UNIT_INDEX[u] = dim

export function resolveUnit(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  const u = ALIASES[s] || s
  return UNIT_INDEX[u] ? { unit: u, dim: UNIT_INDEX[u] } : null
}

const toKelvin = { c: (v) => v + 273.15, f: (v) => (v - 32) * (5 / 9) + 273.15, k: (v) => v }
const fromKelvin = { c: (v) => v - 273.15, f: (v) => (v - 273.15) * (9 / 5) + 32, k: (v) => v }

export function convert(value, from, to) {
  const a = resolveUnit(from)
  const b = resolveUnit(to)
  if (!a) throw new Error(`Unknown unit “${from.trim()}”`)
  if (!b) throw new Error(`Unknown unit “${to.trim()}”`)
  if (a.dim !== b.dim) throw new Error(`Can’t convert ${a.dim} to ${b.dim}`)
  if (a.dim === 'temperature') return fromKelvin[b.unit](toKelvin[a.unit](value))
  return (value * DIMENSIONS[a.dim][a.unit]) / DIMENSIONS[b.dim][b.unit]
}

// ------------------------------------------------------------ entry point

export function formatNumber(n) {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(6).replace(/\.?0+e/, 'e')
  const rounded = Number(n.toPrecision(12))
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 })
}

const CONVERSION = /^(.+?)\s*(?<![a-z])([a-zµ°'"²³][a-z0-9µ°/²³. ]*?|'|")\s+(?:to|in|as|into|->|→)\s+([a-zµ°'"²³][a-z0-9µ°/²³. ]*?)\s*$/i

// Returns { value, unit, text } or throws with a readable message.
export function calculate(input, { ans } = {}) {
  const src = input.trim()
  if (!src) throw new Error('Empty expression')
  const vars = ans != null ? { ans } : {}
  const m = src.match(CONVERSION)
  if (m && resolveUnit(m[2]) && resolveUnit(m[3])) {
    const amount = evaluate(m[1], vars)
    const to = resolveUnit(m[3]).unit
    const value = convert(amount, m[2], m[3])
    return { value, unit: to, text: `${formatNumber(value)} ${to}` }
  }
  if (m && (resolveUnit(m[2]) || resolveUnit(m[3]))) convert(0, m[2], m[3]) // throws a unit-specific message
  const value = evaluate(src, vars)
  return { value, unit: null, text: formatNumber(value) }
}
