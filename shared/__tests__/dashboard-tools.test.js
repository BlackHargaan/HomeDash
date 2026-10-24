import { describe, it, expect } from 'vitest'
import { runTool, toolDefinitions, needsConfirmation, TOOL_NAMES, parseWhen, fmtLocal, contextLine } from '../dashboard-tools.js'
import { collectOccurrences } from '../recurrence.js'

const NOW = new Date(2026, 9, 21, 9, 30) // Wed 21 Oct 2026, 09:30 local
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString()

function base() {
  return {
    boards: [{ id: 'board_home', name: 'Home', icon: '🏠' }, { id: 'b2', name: 'Work', icon: '💼' }],
    widgetsByBoard: {
      board_home: [
        { id: 'w_cal', type: 'calendar', settings: {}, layout: { x: 0, y: 0, w: 6, h: 8 } },
        { id: 'w_kan', type: 'kanban', settings: { title: 'Chores' }, layout: { x: 6, y: 0, w: 6, h: 7 } },
        { id: 'w_nb', type: 'notebook', settings: {}, layout: { x: 0, y: 8, w: 4, h: 6 } },
        { id: 'w_bm', type: 'bookmarks', settings: {}, layout: { x: 4, y: 8, w: 3, h: 6 } },
      ],
      b2: [],
    },
    calendars: [
      { id: 'cal_personal', name: 'Personal', color: 'indigo', visible: true },
      { id: 'cal_work', name: 'Work', color: 'cyan', visible: true },
      { id: 'cal_feed', name: 'Holidays', color: 'rose', visible: true, url: 'https://x.test/h.ics' },
    ],
    events: [
      { id: 'e1', title: 'Dentist', start: at(2026, 10, 22, 15), end: at(2026, 10, 22, 16), allDay: false, calendarId: 'cal_personal', reminderMinutes: 10 },
      { id: 'e2', title: 'Standup', start: at(2026, 10, 19, 10), end: at(2026, 10, 19, 10, 15), allDay: false, calendarId: 'cal_work', recurrence: { freq: 'WEEKLY', interval: 1, byday: ['MO', 'WE', 'FR'] }, exdates: [] },
      { id: 'feed_1', title: 'Holiday', start: at(2026, 10, 26), end: at(2026, 10, 26, 23, 59), allDay: true, calendarId: 'cal_feed', source: 'url:https://x.test/h.ics' },
    ],
    tasks: [
      { id: 't1', title: 'Pay rent', done: false, due: '2026-10-25', priority: 'high' },
      { id: 't2', title: 'Old thing', done: true, due: null, priority: 'low' },
    ],
    habits: [{ id: 'h1', name: 'Read 20 min', log: { '2026-10-19': true, '2026-10-20': true } }],
    'widget:w_nb': { pages: [{ id: 'pg1', text: '# Groceries\n- [ ] milk', updated: at(2026, 10, 20) }], current: 'pg1' },
    'widget:w_bm': [{ id: 'g1', name: 'Daily', links: [] }],
  }
}

// Apply a call's changes like the browser/server would.
function apply(data, name, input) {
  const r = runTool(name, input, { data, now: NOW })
  if (r.ok) Object.assign(data, r.changes)
  return r
}

describe('dashboard tools', () => {
  it('exposes well-formed definitions', () => {
    const defs = toolDefinitions()
    expect(defs.length).toBe(TOOL_NAMES.length)
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z_]+$/)
      expect(d.description.length).toBeGreaterThan(10)
      expect(d.input_schema.type).toBe('object')
      expect(d.input_schema.additionalProperties).toBe(false)
    }
    expect(toolDefinitions({ readOnly: true }).every((d) => d.readOnly)).toBe(true)
    expect(needsConfirmation('delete_task', { id: 'x' })).toBe(true)
    expect(needsConfirmation('write_note', { mode: 'append' })).toBe(false)
    expect(needsConfirmation('write_note', { mode: 'replace' })).toBe(true)
    expect(needsConfirmation('list_tasks', {})).toBe(false)
  })

  it('parses local times and formats them back', () => {
    expect(fmtLocal(parseWhen('2026-10-23T15:05').date)).toBe('2026-10-23T15:05')
    expect(parseWhen('2026-10-23').dateOnly).toBe(true)
    expect(fmtLocal(parseWhen('2026-10-23').date)).toBe('2026-10-23T00:00')
    expect(contextLine(NOW, 'Europe/Berlin')).toBe('[Now: Wed 2026-10-21 09:30 (Europe/Berlin)]')
  })

  it('gives an overview', () => {
    const r = runTool('get_overview', {}, { data: base(), now: NOW })
    expect(r.ok).toBe(true)
    expect(r.result.today).toBe('Wed 2026-10-21')
    expect(r.result.boards[0].widgets.map((w) => w.title)).toContain('Chores')
    expect(r.result.calendars.find((c) => c.name === 'Holidays').readOnly).toBe(true)
    expect(r.result.counts).toEqual({ events: 3, openTasks: 1, habits: 1 })
  })

  it('lists events with recurring occurrences and filters by text', () => {
    const r = runTool('list_events', { from: '2026-10-21', to: '2026-10-23' }, { data: base(), now: NOW })
    expect(r.result.events.map((e) => `${e.title}@${e.start}`)).toEqual(['Standup@2026-10-21T10:00', 'Dentist@2026-10-22T15:00', 'Standup@2026-10-23T10:00'])
    const standup = r.result.events[0]
    expect(standup.id).toMatch(/^e2__\d+$/)
    expect(standup.recurring).toMatch(/week/i)
    expect(standup.calendar).toBe('Work')
    expect(runTool('list_events', { from: '2026-10-01', to: '2026-10-31', query: 'dent' }, { data: base(), now: NOW }).result.events).toHaveLength(1)
    expect(runTool('list_events', { from: '2026-10-21', to: '2026-10-01' }, { data: base(), now: NOW }).ok).toBe(false)
  })

  it('creates timed, all-day and recurring events in the right calendar', () => {
    const data = base()
    const r = apply(data, 'create_event', { title: 'Lunch with Sam', start: '2026-10-23T13:00', calendar: 'work' })
    expect(r.ok).toBe(true)
    expect(r.summary).toBe('Added “Lunch with Sam” on Fri 2026-10-23 at 13:00')
    const ev = data.events.at(-1)
    expect(ev.calendarId).toBe('cal_work')
    expect(new Date(ev.end) - new Date(ev.start)).toBe(3600000)
    expect(ev.reminderMinutes).toBe(10)

    apply(data, 'create_event', { title: 'Trip', start: '2026-11-02' })
    expect(data.events.at(-1)).toMatchObject({ allDay: true, reminderMinutes: null, calendarId: 'cal_personal' })

    apply(data, 'create_event', { title: 'Gym', start: '2026-10-20T18:00', end: '2026-10-20T19:00', repeat: { freq: 'WEEKLY' } })
    const gym = data.events.at(-1)
    expect(gym.recurrence).toEqual({ freq: 'WEEKLY', interval: 1, byday: ['TU'] })
    expect(collectOccurrences([gym], new Date(2026, 9, 20), new Date(2026, 10, 3, 23)).length).toBe(3)

    expect(runTool('create_event', { title: 'x', start: '2026-10-23', calendar: 'Holidays' }, { data, now: NOW }).error).toMatch(/read-only/)
    expect(runTool('create_event', { title: 'x', start: 'next tuesday' }, { data, now: NOW }).error).toMatch(/not a date/)
    expect(runTool('create_event', { title: 'x' }, { data, now: NOW }).error).toMatch(/start is required/)
    expect(runTool('create_event', { title: 'x', start: '2026-10-23', bogus: 1 }, { data, now: NOW }).error).toMatch(/not a known field/)
  })

  it('updates one occurrence, a whole series, or a single event', () => {
    const data = base()
    const occ = runTool('list_events', { from: '2026-10-21', to: '2026-10-21' }, { data, now: NOW }).result.events[0]
    let r = apply(data, 'update_event', { id: occ.id, start: '2026-10-21T11:00' })
    expect(r.ok).toBe(true)
    let list = runTool('list_events', { from: '2026-10-19', to: '2026-10-23' }, { data, now: NOW }).result.events.filter((e) => e.title === 'Standup')
    expect(list.map((e) => e.start)).toEqual(['2026-10-19T10:00', '2026-10-21T11:00', '2026-10-23T10:00'])
    expect(list[1].end).toBe('2026-10-21T11:15') // kept its 15 minutes

    // Whole series moved by an hour via an occurrence id
    const fri = list[2]
    r = apply(data, 'update_event', { id: fri.id, scope: 'all', start: '2026-10-23T09:00', title: 'Daily sync' })
    expect(r.ok).toBe(true)
    list = runTool('list_events', { from: '2026-10-26', to: '2026-10-26' }, { data, now: NOW }).result.events
    expect(list.find((e) => e.title === 'Daily sync').start).toBe('2026-10-26T09:00')

    r = apply(data, 'update_event', { id: 'e1', end: '2026-10-22T17:30', location: 'Main St' })
    expect(data.events.find((e) => e.id === 'e1')).toMatchObject({ location: 'Main St', end: at(2026, 10, 22, 17, 30) })
    expect(runTool('update_event', { id: 'feed_1', title: 'x' }, { data, now: NOW }).error).toMatch(/subscribed/)
    expect(runTool('update_event', { id: 'nope' }, { data, now: NOW }).error).toMatch(/No event/)
  })

  it('deletes an occurrence or a series', () => {
    const data = base()
    const occ = runTool('list_events', { from: '2026-10-21', to: '2026-10-21' }, { data, now: NOW }).result.events[0]
    expect(apply(data, 'delete_event', { id: occ.id }).summary).toMatch(/one “Standup” occurrence/)
    expect(runTool('list_events', { from: '2026-10-21', to: '2026-10-21' }, { data, now: NOW }).result.events).toHaveLength(0)
    expect(runTool('list_events', { from: '2026-10-23', to: '2026-10-23' }, { data, now: NOW }).result.events).toHaveLength(1)
    apply(data, 'delete_event', { id: 'e2', scope: 'all' })
    expect(data.events.find((e) => e.id === 'e2')).toBeUndefined()
  })

  it('manages tasks', () => {
    const data = base()
    expect(runTool('list_tasks', {}, { data, now: NOW }).result.tasks.map((t) => t.title)).toEqual(['Pay rent'])
    apply(data, 'create_task', { title: 'Buy stamps', due: '2026-10-22', priority: 'low' })
    expect(runTool('list_tasks', {}, { data, now: NOW }).result.tasks.map((t) => t.title)).toEqual(['Buy stamps', 'Pay rent'])
    const id = data.tasks.at(-1).id
    expect(apply(data, 'update_task', { id, done: true }).summary).toBe('Completed task “Buy stamps”')
    apply(data, 'update_task', { id: 't1', due: null })
    expect(data.tasks.find((t) => t.id === 't1').due).toBeNull()
    expect(runTool('create_task', { title: 'x', priority: 'urgent' }, { data, now: NOW }).error).toMatch(/one of/)
    apply(data, 'delete_task', { id: 't2' })
    expect(data.tasks.some((t) => t.id === 't2')).toBe(false)
  })

  it('tracks habits', () => {
    const data = base()
    expect(runTool('list_habits', {}, { data, now: NOW }).result.habits[0]).toMatchObject({ doneToday: false, streak: 2, last7: '····✓✓·' })
    const r = apply(data, 'set_habit_done', { habit: 'read', done: true })
    expect(r.result).toMatchObject({ habit: 'Read 20 min', date: '2026-10-21', streak: 3 })
    apply(data, 'create_habit', { name: 'Stretch' })
    expect(data.habits.map((h) => h.name)).toEqual(['Read 20 min', 'Stretch'])
    expect(runTool('set_habit_done', { habit: 'swim', done: true }, { data, now: NOW }).error).toMatch(/No habit/)
  })

  it('works with kanban boards, including ones never saved yet', () => {
    const data = base()
    const r = apply(data, 'add_kanban_card', { text: 'Clean garage', column: 'doing' })
    expect(r.ok).toBe(true)
    const board = runTool('list_kanban', {}, { data, now: NOW }).result.boards[0]
    expect(board.title).toBe('Chores')
    expect(board.columns.map((c) => `${c.title}:${c.cards.length}`)).toEqual(['To do:0', 'Doing:1', 'Done:0'])
    const cardId = board.columns[1].cards[0].id
    expect(apply(data, 'move_kanban_card', { cardId, column: 'Done' }).summary).toBe('Moved “Clean garage” to Done')
    expect(data['widget:w_kan'].columns[2].cards[0].text).toBe('Clean garage')
    apply(data, 'delete_kanban_card', { cardId })
    expect(data['widget:w_kan'].columns.every((c) => c.cards.length === 0)).toBe(true)
  })

  it('reads and writes notebook pages', () => {
    const data = base()
    // Old pages kept their title as a leading "# Heading"; it reads as the title.
    const notes = runTool('list_notes', {}, { data, now: NOW }).result.notes
    expect(notes[0]).toMatchObject({ widgetId: 'w_nb', pageId: 'pg1', title: 'Groceries', icon: '📄' })
    apply(data, 'write_note', { mode: 'append', text: '- [ ] eggs' })
    let page = runTool('read_note', { widgetId: 'w_nb', pageId: 'pg1' }, { data, now: NOW }).result
    expect(page).toMatchObject({ title: 'Groceries', text: '- [ ] milk\n- [ ] eggs' })
    apply(data, 'write_note', { mode: 'append', text: 'Remember the coupons.' })
    expect(data['widget:w_nb'].pages[0].text).toBe('- [ ] milk\n- [ ] eggs\n\nRemember the coupons.')
    let r = apply(data, 'write_note', { mode: 'create', text: '# Trip plan\n\n- pack' })
    expect(r.summary).toBe('Created page “Trip plan”')
    expect(data['widget:w_nb'].pages[0]).toMatchObject({ title: 'Trip plan', text: '- pack', icon: '📄' })
    r = apply(data, 'write_note', { mode: 'create', title: 'Ideas', icon: '💡', text: 'First idea' })
    expect(data['widget:w_nb'].pages[0]).toMatchObject({ title: 'Ideas', icon: '💡', text: 'First idea' })
    expect(data['widget:w_nb'].pages).toHaveLength(3)
    expect(runTool('write_note', { mode: 'append', text: 'x' }, { data, now: NOW }).error).toMatch(/pageId/)
  })

  it('tracks games', () => {
    const data = base()
    data.games = { items: [
      { id: 'g1', name: 'Hades', status: 'playing', steamAppId: 1145360, steamMin: 600, ttb: { main: 22 }, added: '2026-09-01T10:00:00Z', lastPlayed: '2026-09-01T10:00:00Z' },
      { id: 'g2', name: 'Celeste', status: 'playing', added: '2026-09-01T10:00:00Z', lastPlayed: new Date(NOW).toISOString() },
    ], settings: { playingLimit: 2 } }
    let r = apply(data, 'add_game', { name: 'Hollow Knight', status: 'playing', mainHours: 27, fullHours: 63 })
    expect(r.summary).toBe('Added “Hollow Knight” to Playing')
    expect(r.result.note).toMatch(/3 games in progress — more than their limit of 2/)
    expect(data.games.items[0]).toMatchObject({ name: 'Hollow Knight', ttb: { main: 27, full: 63 }, ttbSource: 'assistant', status: 'playing' })
    expect(runTool('add_game', { name: 'hades' }, { data, now: NOW }).error).toMatch(/already in the tracker/)
    r = apply(data, 'update_game', { id: 'Celeste', mainHours: 8, addMinutes: 90, status: 'paused' })
    expect(r.summary).toBe('Updated “Celeste”: time to beat 8 h, logged 90 min, moved to Paused')
    const list = runTool('list_games', {}, { data, now: NOW }).result
    expect(list.counts).toMatchObject({ playing: 2, paused: 1 })
    expect(list.games.find((g) => g.name === 'Hades')).toMatchObject({ playedHours: 10, percent: 45, hoursLeft: 12, steam: true })
    expect(list.suggestions[0]).toMatchObject({ name: 'Celeste', why: 'Already started — about 6.5 h left' })
    expect(list.quiet.map((g) => g.name)).toEqual(['Hades'])
    expect(runTool('list_games', { status: 'paused' }, { data, now: NOW }).result.games).toHaveLength(1)
    r = apply(data, 'update_game', { id: 'g1', status: 'finished' })
    expect(runTool('list_games', {}, { data, now: NOW }).result.finishedThisYear).toBe(1)
    expect(needsConfirmation('remove_game', { id: 'g1' })).toBe(true)
    apply(data, 'remove_game', { id: 'g1' })
    expect(data.games.items.map((g) => g.name)).toEqual(['Hollow Knight', 'Celeste'])
    expect(runTool('update_game', { id: 'nope', status: 'paused' }, { data, now: NOW }).error).toMatch(/No game nope/)
  })

  it('grows and trims the Daily Boost collection', () => {
    const data = base()
    let r = apply(data, 'add_boosts', { items: [
      { kind: 'strategy', text: 'Put a sticky note on the door for tomorrow.', detail: 'Your future self will see it on the way out.' },
      { kind: 'uplift', text: 'Done is better than perfect.' },
    ] })
    expect(r.summary).toBe('Added 1 boost (1 skipped)')
    const id = r.result.added[0].id
    expect(data.boosts.custom[0]).toMatchObject({ id, kind: 'strategy', source: 'assistant' })
    expect(runTool('add_boosts', { items: [{ kind: 'uplift', text: 'Done is better than perfect.' }] }, { data, now: NOW }).error).toMatch(/Nothing new/)
    expect(runTool('add_boosts', { items: [{ kind: 'joke', text: 'x' }] }, { data, now: NOW }).error).toMatch(/must be one of/)
    let list = runTool('list_boosts', {}, { data, now: NOW }).result
    expect(list.counts.strategy).toBeGreaterThan(30)
    expect(list.custom).toHaveLength(1)
    expect(list.builtIn).toBeUndefined()
    expect(runTool('list_boosts', { includeBuiltIn: true }, { data, now: NOW }).result.builtIn.length).toBeGreaterThan(60)
    expect(needsConfirmation('remove_boost', { id })).toBe(true)
    r = apply(data, 'remove_boost', { id: 'u03' })
    expect(r.summary).toBe('Removed boost “Done is better than perfect.” from the rotation')
    expect(data.boosts.hidden).toEqual(['u03'])
    r = apply(data, 'remove_boost', { id })
    expect(r.summary).toMatch(/^Deleted boost/)
    list = runTool('list_boosts', {}, { data, now: NOW }).result
    expect(list.custom).toHaveLength(0)
    expect(list.hidden).toEqual([{ id: 'u03', text: 'Done is better than perfect.' }])
  })

  it('creates and lists notebook sub-pages', () => {
    const data = base()
    const trip = apply(data, 'write_note', { mode: 'create', title: 'Trips', text: '' }).result.created
    data['widget:w_nb'].pages = data['widget:w_nb'].pages.map((p) => (p.id === trip.pageId ? { ...p, collapsed: true } : p))
    const r = apply(data, 'write_note', { mode: 'create', title: 'Japan', text: 'Tokyo', parentId: trip.pageId })
    expect(r.summary).toBe('Created page “Japan” in “Trips”')
    const japan = data['widget:w_nb'].pages.find((p) => p.title === 'Japan')
    expect(japan.parent).toBe(trip.pageId)
    expect(data['widget:w_nb'].pages.find((p) => p.id === trip.pageId).collapsed).toBe(false)
    const notes = runTool('list_notes', {}, { data, now: NOW }).result.notes
    expect(notes.map((n) => n.title)).toEqual(['Trips', 'Japan', 'Groceries'])
    expect(notes[1]).toMatchObject({ parentId: trip.pageId, path: 'Trips' })
    expect(notes[0].parentId).toBeUndefined()
    const read = runTool('read_note', { widgetId: 'w_nb', pageId: trip.pageId }, { data, now: NOW }).result
    expect(read.subPages).toEqual([{ pageId: japan.id, title: 'Japan' }])
    expect(runTool('write_note', { mode: 'create', text: 'x', parentId: 'nope' }, { data, now: NOW }).error).toMatch(/No page nope/)
  })

  it('adds bookmarks and widgets', () => {
    const data = base()
    apply(data, 'add_bookmark', { url: 'docs.python.org', group: 'Dev' })
    expect(data['widget:w_bm'].map((g) => g.name)).toEqual(['Daily', 'Dev'])
    expect(data['widget:w_bm'][1].links[0]).toMatchObject({ title: 'docs.python.org', url: 'https://docs.python.org' })

    const r = apply(data, 'add_widget', { type: 'weather', board: 'work', title: 'Berlin' })
    expect(r.summary).toBe('Added Berlin to Work')
    expect(data.widgetsByBoard.b2[0]).toMatchObject({ type: 'weather', settings: { title: 'Berlin' } })
    expect(runTool('add_widget', { type: 'calendar' }, { data, now: NOW }).error).toMatch(/already/)
    expect(runTool('add_widget', { type: 'nope' }, { data, now: NOW }).error).toMatch(/one of/)
    apply(data, 'remove_widget', { widgetId: data.widgetsByBoard.b2[0].id })
    expect(data.widgetsByBoard.b2).toEqual([])
  })

  it('refuses writes on read-only connections and never mutates the input', () => {
    const data = base()
    const before = JSON.stringify(data)
    expect(runTool('create_task', { title: 'x' }, { data, now: NOW, readOnly: true }).error).toMatch(/read-only/)
    expect(runTool('list_tasks', {}, { data, now: NOW, readOnly: true }).ok).toBe(true)
    runTool('create_task', { title: 'y' }, { data, now: NOW })
    expect(JSON.stringify(data)).toBe(before)
    expect(runTool('nope', {}, { data }).error).toMatch(/Unknown tool/)
  })
})
