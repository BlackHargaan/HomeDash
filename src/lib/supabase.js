// Minimal Supabase client over plain fetch — just the auth + single-table state
// sync HomeDash needs, so we don't bundle the full SDK. `cfg` is { url, anonKey }.
//
// Expected table (run once in the Supabase SQL editor):
//
//   create table if not exists homedash_state (
//     user_id uuid primary key references auth.users(id) on delete cascade,
//     data jsonb not null default '{}'::jsonb,
//     updated_at timestamptz not null default now()
//   );
//   alter table homedash_state enable row level security;
//   create policy "own state" on homedash_state
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

const authBase = (url) => `${url.replace(/\/$/, '')}/auth/v1`
const restBase = (url) => `${url.replace(/\/$/, '')}/rest/v1`

async function readError(res) {
  const j = await res.json().catch(() => ({}))
  return j.error_description || j.msg || j.message || j.error || `HTTP ${res.status}`
}

export async function signUp(cfg, email, password) {
  const res = await fetch(`${authBase(cfg.url)}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function signIn(cfg, email, password) {
  const res = await fetch(`${authBase(cfg.url)}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json() // { access_token, refresh_token, expires_at, user: { id, email } }
}

export async function refreshSession(cfg, refresh_token) {
  const res = await fetch(`${authBase(cfg.url)}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
    body: JSON.stringify({ refresh_token }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function signOut(cfg, session) {
  try {
    await fetch(`${authBase(cfg.url)}/logout`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    /* best effort */
  }
}

// Upsert the whole dashboard blob for the current user; returns { updated_at }.
export async function pushState(cfg, session, blob) {
  const updated_at = new Date().toISOString()
  const res = await fetch(`${restBase(cfg.url)}/homedash_state?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ user_id: session.user.id, data: blob, updated_at }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export async function pullState(cfg, session) {
  const res = await fetch(
    `${restBase(cfg.url)}/homedash_state?user_id=eq.${session.user.id}&select=data,updated_at`,
    { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(await readError(res))
  const rows = await res.json()
  return rows[0] || null
}
