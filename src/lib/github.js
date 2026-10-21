// Turns GitHub's public events feed (GET /users/:user/events/public) into
// short human sentences for the GitHub Activity widget.

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function describeEvent(ev) {
  const repo = ev.repo?.name || ''
  const repoUrl = `https://github.com/${repo}`
  const p = ev.payload || {}
  const base = { id: ev.id, repo, date: ev.created_at, url: repoUrl }
  switch (ev.type) {
    case 'PushEvent': {
      const n = p.size ?? p.commits?.length ?? p.distinct_size ?? 1
      const branch = (p.ref || '').replace('refs/heads/', '')
      return { ...base, icon: '⬆', text: `Pushed ${plural(n, 'commit')}${branch ? ` to ${branch}` : ''}`,
        detail: p.commits?.[p.commits.length - 1]?.message?.split('\n')[0] }
    }
    case 'PullRequestEvent': {
      const pr = p.pull_request || {}
      const action = p.action === 'closed' && pr.merged ? 'Merged' : cap(p.action)
      return { ...base, icon: '⇄', text: `${action} PR #${pr.number ?? p.number}`, detail: pr.title, url: pr.html_url || repoUrl }
    }
    case 'IssuesEvent':
      return { ...base, icon: '◎', text: `${cap(p.action)} issue #${p.issue?.number}`, detail: p.issue?.title, url: p.issue?.html_url || repoUrl }
    case 'IssueCommentEvent':
      return { ...base, icon: '💬', text: `Commented on #${p.issue?.number}`, detail: p.issue?.title, url: p.comment?.html_url || repoUrl }
    case 'PullRequestReviewEvent':
      return { ...base, icon: '✓', text: `Reviewed PR #${p.pull_request?.number}`, detail: p.pull_request?.title, url: p.review?.html_url || repoUrl }
    case 'PullRequestReviewCommentEvent':
      return { ...base, icon: '💬', text: `Commented on PR #${p.pull_request?.number}`, detail: p.pull_request?.title, url: p.comment?.html_url || repoUrl }
    case 'CreateEvent':
      return { ...base, icon: '＋', text: p.ref_type === 'repository' ? 'Created repository' : `Created ${p.ref_type} ${p.ref}` }
    case 'DeleteEvent':
      return { ...base, icon: '−', text: `Deleted ${p.ref_type} ${p.ref}` }
    case 'WatchEvent':
      return { ...base, icon: '★', text: 'Starred' }
    case 'ForkEvent':
      return { ...base, icon: '⑂', text: 'Forked', url: p.forkee?.html_url || repoUrl }
    case 'ReleaseEvent':
      return { ...base, icon: '🏷', text: `${cap(p.action)} release ${p.release?.tag_name || ''}`.trim(), url: p.release?.html_url || repoUrl }
    case 'PublicEvent':
      return { ...base, icon: '🌐', text: 'Made public' }
    case 'MemberEvent':
      return { ...base, icon: '👤', text: `${cap(p.action)} ${p.member?.login || 'a collaborator'}` }
    default:
      return { ...base, icon: '•', text: ev.type.replace(/Event$/, '') }
  }
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

// Events per day for the last `days` days (oldest first), for the sparkline.
export function activityByDay(events, days = 14, now = new Date()) {
  const out = []
  const end = new Date(now); end.setHours(0, 0, 0, 0)
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(end); d.setDate(end.getDate() - k)
    out.push({ date: d, count: 0 })
  }
  for (const ev of events) {
    const d = new Date(ev.created_at); d.setHours(0, 0, 0, 0)
    const idx = Math.round((d - out[0].date) / 86400000)
    if (idx >= 0 && idx < out.length) out[idx].count += ev.type === 'PushEvent' ? (ev.payload?.size || 1) : 1
  }
  return out
}

// Keep only the fields describeEvent/activityByDay read, so the cached copy
// stored with the widget stays small.
export function slimEvent(ev) {
  const p = ev.payload || {}
  const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]])) : undefined)
  return {
    id: ev.id, type: ev.type, created_at: ev.created_at, repo: { name: ev.repo?.name },
    payload: {
      ...pick(p, ['size', 'distinct_size', 'ref', 'ref_type', 'action', 'number']),
      commits: p.commits?.length ? [pick(p.commits[p.commits.length - 1], ['message'])] : undefined,
      pull_request: pick(p.pull_request, ['number', 'title', 'html_url', 'merged']),
      issue: pick(p.issue, ['number', 'title', 'html_url']),
      comment: pick(p.comment, ['html_url']),
      review: pick(p.review, ['html_url']),
      release: pick(p.release, ['tag_name', 'html_url']),
      forkee: pick(p.forkee, ['html_url']),
      member: pick(p.member, ['login']),
    },
  }
}
