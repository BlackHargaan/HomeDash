import { useState } from 'react'
import { useSync } from '../context/SyncContext.jsx'

const SETUP_SQL = `create table if not exists homedash_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table homedash_state enable row level security;
create policy "own state" on homedash_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`

export default function CloudSyncPanel() {
  const { configured, config, user, status, error, lastSync, saveConfig, clearConfig, doSignIn, doSignUp, doSignOut, syncNow } = useSync()
  const [url, setUrl] = useState(config?.url || '')
  const [anonKey, setAnonKey] = useState(config?.anonKey || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showSql, setShowSql] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(fn) { setBusy(true); try { await fn() } finally { setBusy(false) } }

  // --- Signed in ---
  if (configured && user) {
    return (
      <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
        <label>Cloud sync</label>
        <div className="sync-signedin">
          <div>
            <div className="sync-email">🔒 {user.email}</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {status === 'syncing' && 'Syncing…'}
              {status === 'synced' && `Synced${lastSync ? ' · ' + new Date(lastSync).toLocaleTimeString() : ''}`}
              {status === 'error' && <span className="err-msg">{error || 'Sync error'}</span>}
              {status === 'idle' && 'Ready'}
            </div>
          </div>
          <div className="row" style={{ flex: '0 0 auto' }}>
            <button className="btn sm" onClick={() => run(syncNow)} disabled={busy}>↻ Sync now</button>
            <button className="btn sm ghost" onClick={() => run(doSignOut)} disabled={busy}>Sign out</button>
          </div>
        </div>
        <span className="faint" style={{ fontSize: 12 }}>Changes on this device sync automatically across your signed-in browsers.</span>
      </div>
    )
  }

  // --- Configured, signed out ---
  if (configured) {
    return (
      <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
        <label>Cloud sync — sign in</label>
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Signing in pulls your synced dashboard into this browser (replacing what’s here). New account? Sign up to seed it from this browser.
        </p>
        <div className="row">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary sm" disabled={busy || !email || !password} onClick={() => run(() => doSignIn(email, password))}>Sign in</button>
          <button className="btn sm" disabled={busy || !email || !password} onClick={() => run(() => doSignUp(email, password))}>Sign up</button>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={clearConfig} title="Change Supabase project">⚙︎ Reconfigure</button>
        </div>
        {error && <span className="err-msg">{error}</span>}
      </div>
    )
  }

  // --- Not configured ---
  return (
    <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
      <label>Cloud sync (optional)</label>
      <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
        Sync your dashboard across devices with your own free <b>Supabase</b> project. Create one at supabase.com, run the setup SQL below,
        then paste your Project URL and anon (public) key from Project Settings → API.
      </p>
      <div className="field">
        <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="field">
        <input className="input" placeholder="anon public key (eyJ…)" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
      </div>
      <div className="row">
        <button className="btn primary sm" disabled={!url || !anonKey} onClick={() => saveConfig(url, anonKey)}>Save &amp; connect</button>
        <button className="btn sm ghost" onClick={() => setShowSql((v) => !v)}>{showSql ? 'Hide' : 'Show'} setup SQL</button>
      </div>
      {showSql && <pre className="sync-sql">{SETUP_SQL}</pre>}
    </div>
  )
}
