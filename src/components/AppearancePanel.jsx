import { useRef, useState } from 'react'
import { useDashboard } from '../context/DashboardContext.jsx'
import { DENSITIES, FONTS, compressImage } from '../lib/appearance.js'

const WALLPAPERS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'grid', label: 'Grid' },
  { id: 'plain', label: 'Plain' },
  { id: 'image', label: '🖼 Image' },
]

export default function AppearancePanel() {
  const {
    wallpaper, setWallpaper, wallpaperImage, setWallpaperImage,
    wallpaperDim, setWallpaperDim, wallpaperBlur, setWallpaperBlur,
    density, setDensity, font, setFont,
  } = useDashboard()
  const fileRef = useRef(null)
  const [link, setLink] = useState(wallpaperImage && !wallpaperImage.startsWith('data:') ? wallpaperImage : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setWallpaperImage(await compressImage(file))
      setWallpaper('image')
      setLink('')
    } catch (err) {
      setError(err.message || 'Could not read that image')
    } finally {
      setBusy(false)
    }
  }

  function applyLink(e) {
    e.preventDefault()
    const u = link.trim()
    if (!/^https?:\/\//i.test(u)) { setError('Enter an http(s) image address'); return }
    setError(null)
    setWallpaperImage(u)
    setWallpaper('image')
  }

  return (
    <>
      <div className="field">
        <label>Wallpaper</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {WALLPAPERS.map((w) => (
            <button key={w.id} className={`chip ${wallpaper === w.id ? 'on' : ''}`}
              onClick={() => (w.id === 'image' && !wallpaperImage ? fileRef.current?.click() : setWallpaper(w.id))}>
              {w.label}
            </button>
          ))}
        </div>
        {(wallpaper === 'image' || wallpaperImage) && (
          <div className="row" style={{ alignItems: 'flex-start', marginTop: 8 }}>
            <div className="wp-preview" style={wallpaperImage ? { backgroundImage: `url("${wallpaperImage.replace(/"/g, '%22')}")` } : undefined} aria-label="Wallpaper preview" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Processing…' : '⇧ Upload image'}</button>
                {wallpaperImage && <button className="btn sm ghost danger" onClick={() => { setWallpaperImage(''); setWallpaper('aurora'); setLink('') }}>Remove</button>}
              </div>
              <form className="row" onSubmit={applyLink}>
                <input className="input sm" placeholder="…or paste an image URL" value={link} onChange={(e) => setLink(e.target.value)} />
                <button className="btn sm" type="submit" style={{ flex: '0 0 auto' }}>Use</button>
              </form>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
        {wallpaper === 'image' && wallpaperImage && (
          <>
            <div className="range-row">
              <span>Dim</span>
              <input type="range" min={0} max={85} value={wallpaperDim} onChange={(e) => setWallpaperDim(Number(e.target.value))} aria-label="Dim wallpaper" />
              <span>{wallpaperDim}%</span>
            </div>
            <div className="range-row">
              <span>Blur</span>
              <input type="range" min={0} max={24} value={wallpaperBlur} onChange={(e) => setWallpaperBlur(Number(e.target.value))} aria-label="Blur wallpaper" />
              <span>{wallpaperBlur}px</span>
            </div>
          </>
        )}
        {error && <span className="err-msg">{error}</span>}
        <span className="faint" style={{ fontSize: 12 }}>Uploads are shrunk to about 1920px and saved with your dashboard, so they sync too.</span>
      </div>

      <div className="field">
        <label>Density</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {Object.entries(DENSITIES).map(([id, d]) => (
            <button key={id} className={`chip ${density === id ? 'on' : ''}`} onClick={() => setDensity(id)}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Font</label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {Object.entries(FONTS).map(([id, f]) => (
            <button key={id} className={`chip font-chip ${font === id ? 'on' : ''}`} style={{ fontFamily: f.stack }} onClick={() => setFont(id)}>{f.label}</button>
          ))}
        </div>
        <span className="faint" style={{ fontSize: 12 }}>Style a single widget from its 🎨 button in Edit mode.</span>
      </div>
    </>
  )
}
