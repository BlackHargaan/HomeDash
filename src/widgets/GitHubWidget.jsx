import { useCallback, useEffect, useState } from 'react'
import { useWidgetState } from '../lib/storage.js'
import { describeEvent, activityByDay, slimEvent } from '../lib/github.js'
import { timeAgo } from '../lib/date.js'

const API = 'https://api.github.com'
const REFRESH_MS = 10 * 60 * 1000

async function gh(path) {
  const res = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' } })
  if (res.status === 404) throw new Error('No GitHub user or organization by that name')
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : 0
    const when = mins ? ` — try again in ${mins} min` : ''
    throw new Error(`GitHub rate limit reached${when}`)
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  return res.json()
}

export default function GitHubWidget({ widget }) {
  const [state, setState] = useWidgetState(widget.id, { user: '', profile: null, events: [], fetchedAt: null, error: null })
  const { user, profile, events = [], fetchedAt, error } = state
  const [draft, setDraft] = useState(user)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(!user)

  const load = useCallback(async (name) => {
    if (!name) return
    setLoading(true)
    try {
      const [p, ev] = await Promise.all([gh(`/users/${encodeURIComponent(name)}`), gh(`/users/${encodeURIComponent(name)}/events/public?per_page=60`)])
      setState((s) => ({
        ...s, user: name, error: null, fetchedAt: new Date().toISOString(),
        profile: { login: p.login, name: p.name, avatar: p.avatar_url, url: p.html_url, repos: p.public_repos, followers: p.followers, type: p.type },
        events: ev.slice(0, 60).map(slimEvent),
      }))
    } catch (e) {
      setState((s) => ({ ...s, user: name, error: e.message, fetchedAt: new Date().toISOString() }))
    } finally {
      setLoading(false)
    }
  }, [setState])

  useEffect(() => {
    if (!user) return
    const stale = !fetchedAt || Date.now() - Date.parse(fetchedAt) > REFRESH_MS
    if (stale) load(user)
    const iv = setInterval(() => load(user), REFRESH_MS)
    return () => clearInterval(iv)
  }, [user, load]) // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e) {
    e.preventDefault()
    const name = draft.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0]
    if (!name) return
    if (name !== user) setState({ user: name, profile: null, events: [], fetchedAt: null, error: null })
    setEditing(false)
    load(name)
  }

  if (editing || !user) {
    return (
      <form className="gh no-drag gh-setup" onSubmit={submit}>
        <div className="faint">Show public activity for a GitHub user or organization.</div>
        <input className="input" placeholder="GitHub username" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="GitHub username" />
        <div className="row">
          <button className="btn sm primary" type="submit" disabled={!draft.trim()}>Show activity</button>
          {user && <button className="btn sm ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </form>
    )
  }

  const days = activityByDay(events, 14)
  const peak = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((n, d) => n + d.count, 0)

  return (
    <div className="gh no-drag">
      <div className="gh-head">
        {profile?.avatar && <img className="gh-avatar" src={profile.avatar} alt="" width={36} height={36} />}
        <div className="gh-who">
          <a href={profile?.url || `https://github.com/${user}`} target="_blank" rel="noopener noreferrer" className="gh-name">{profile?.name || user}</a>
          <span className="faint gh-sub">@{profile?.login || user}{profile ? ` · ${profile.repos} repos · ${profile.followers} followers` : ''}</span>
        </div>
        <span className="spacer" />
        <button className="wtool" onClick={() => load(user)} disabled={loading} title={fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : 'Refresh'} aria-label="Refresh">{loading ? '…' : '↻'}</button>
        <button className="wtool" onClick={() => { setDraft(user); setEditing(true) }} title="Change user" aria-label="Change user">✎</button>
      </div>

      {error && <div className="err-msg gh-err">{error}</div>}

      <div className="gh-spark" title={`${total} public events in the last 14 days`}>
        {days.map((d) => (
          <span key={d.date.toISOString()} className={`gh-bar ${d.count ? '' : 'zero'}`} style={{ height: `${Math.max(8, (d.count / peak) * 100)}%` }}
            title={`${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.count}`} />
        ))}
      </div>

      <div className="gh-list">
        {!events.length && !loading && !error && <div className="empty-hint">No public activity in the last 90 days.</div>}
        {events.map((ev) => {
          const d = describeEvent(ev)
          return (
            <a key={d.id} className="gh-row" href={d.url} target="_blank" rel="noopener noreferrer">
              <span className="gh-icon">{d.icon}</span>
              <span className="gh-main">
                <span className="gh-text">{d.text} <span className="gh-repo">{d.repo}</span></span>
                {d.detail && <span className="gh-detail faint">{d.detail}</span>}
              </span>
              <span className="faint gh-when">{timeAgo(d.date)}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
