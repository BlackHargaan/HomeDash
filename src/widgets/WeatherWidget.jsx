import { useEffect, useMemo, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'

// Uses the free, key-less Open-Meteo API for both geocoding and forecast.
const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

// WMO weather codes → label + emoji.
const WMO = {
  0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
  80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Hailstorm', '⛈️'],
}

export default function WeatherWidget({ widget }) {
  const [cfg, setCfg] = useWidgetState(widget.id, {
    place: null, // { name, lat, lon, country }
    unit: 'c',
  })
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('idle')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [editing, setEditing] = useState(false)

  const unit = cfg.unit || 'c'

  useEffect(() => {
    if (!cfg.place) { setEditing(true); return }
    let cancelled = false
    setStatus('loading')
    const tempUnit = unit === 'f' ? 'fahrenheit' : 'celsius'
    const url = `${FORECAST}?latitude=${cfg.place.lat}&longitude=${cfg.place.lon}` +
      `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto` +
      `&temperature_unit=${tempUnit}`
    fetch(url)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setData(j); setStatus('ok') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [cfg.place, unit])

  async function search(e) {
    e.preventDefault()
    if (!query.trim()) return
    try {
      const r = await fetch(`${GEO}?name=${encodeURIComponent(query)}&count=6`)
      const j = await r.json()
      setResults(j.results || [])
    } catch {
      setResults([])
    }
  }

  function pick(place) {
    setCfg((c) => ({
      ...c,
      place: {
        name: place.name + (place.admin1 ? `, ${place.admin1}` : ''),
        lat: place.latitude,
        lon: place.longitude,
        country: place.country_code,
      },
    }))
    setEditing(false)
    setResults([])
    setQuery('')
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      setCfg((c) => ({
        ...c,
        place: { name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude },
      }))
      setEditing(false)
    })
  }

  const cur = data?.current
  const [label, emoji] = useMemo(() => WMO[cur?.weather_code] || ['—', '🌡️'], [cur])
  const deg = unit === 'f' ? '°F' : '°C'

  if (editing || !cfg.place) {
    return (
      <div className="weather-setup">
        <form onSubmit={search} className="no-drag">
          <div className="field">
            <label>Search a city</label>
            <input
              className="input"
              placeholder="e.g. Berlin"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </form>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn sm" onClick={search}>Search</button>
          <button className="btn sm ghost" onClick={useMyLocation}>📍 Use my location</button>
        </div>
        <div className="geo-results">
          {results.map((r) => (
            <button key={r.id} className="geo-row" onClick={() => pick(r)}>
              <span>{r.name}{r.admin1 ? `, ${r.admin1}` : ''}</span>
              <span className="faint">{r.country_code}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="weather">
      <div className="weather-top">
        <div className="weather-emoji">{emoji}</div>
        <div>
          <div className="weather-temp">
            {cur ? Math.round(cur.temperature_2m) : '—'}<span>{deg}</span>
          </div>
          <div className="weather-label">{label}</div>
        </div>
        <div className="weather-actions no-drag">
          <button className="wtool" title="Toggle °C/°F" onClick={() => setCfg((c) => ({ ...c, unit: unit === 'f' ? 'c' : 'f' }))}>
            {unit === 'f' ? '°C' : '°F'}
          </button>
          <button className="wtool" title="Change city" onClick={() => setEditing(true)}>📍</button>
        </div>
      </div>
      <div className="weather-place">{cfg.place.name}</div>
      {cur && (
        <div className="weather-meta">
          <span>Feels {Math.round(cur.apparent_temperature)}{deg}</span>
          <span>💧 {cur.relative_humidity_2m}%</span>
          <span>🍃 {Math.round(cur.wind_speed_10m)}</span>
        </div>
      )}
      {status === 'error' && <div className="faint">Couldn’t load weather.</div>}
      {data?.daily && (
        <div className="weather-forecast">
          {data.daily.time.slice(1, 4).map((t, i) => {
            const idx = i + 1
            const [, dEmoji] = WMO[data.daily.weather_code[idx]] || ['', '🌡️']
            const day = new Date(t).toLocaleDateString(undefined, { weekday: 'short' })
            return (
              <div key={t} className="fc-day">
                <span className="fc-name">{day}</span>
                <span className="fc-emoji">{dEmoji}</span>
                <span className="fc-temp">
                  {Math.round(data.daily.temperature_2m_max[idx])}°
                  <span className="faint"> {Math.round(data.daily.temperature_2m_min[idx])}°</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
