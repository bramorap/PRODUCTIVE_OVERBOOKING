import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  fetchWorkBookings, fetchTimeOffBookings, resolveOverbooking,
  fetchAllWorkBookings,
  fetchProjects,
} from './api'
import {
  getZoomedRange, getZoomColumns, getWorkDays,
  getPersonIds, getOverlappingTimeOffDays, getTimeOffByDay, computeSegments,
  buildPersonDayMap, buildPersonPeriodMap,
} from './utils'
import BookingsGrid from './BookingsGrid'
import ResolveModal from './ResolveModal'
import BulkResolveModal from './BulkResolveModal'
import SettingsPanel from './SettingsPanel'

const DEFAULT_CONFIG = {
  apiToken: '',
  orgId: '52239',
  excludedEventNames: '',
}

function filterExcludedEvents(bookings, config) {
  const excluded = (config.excludedEventNames || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (excluded.length === 0) return bookings
  return bookings.filter(b => !b.event_name || !excluded.includes(b.event_name.toLowerCase()))
}

const ZOOM_LEVELS = [
  { key: 'week',    label: '2 Weeks' },
  { key: 'month',   label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year' },
]

function loadConfig() {
  try {
    const saved = localStorage.getItem('productive-config')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG
  } catch { return DEFAULT_CONFIG }
}

// ── Multi-select budget dropdown ──────────────────────────────────
function BudgetDropdown({ budgets, selected, onChange, loading, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  const label = loading ? 'Loading…'
    : budgets.length === 0 ? 'No budgets'
    : selected.length === 0 ? 'Select budget…'
    : selected.length === 1 ? (budgets.find(b => b.id === selected[0])?.name ?? '1 budget')
    : `${selected.length} budgets`

  return (
    <div className="sel-wrap" ref={ref}>
      <button
        className={`sel-btn ${open ? 'sel-btn--open' : ''}`}
        onClick={() => !disabled && !loading && budgets.length > 0 && setOpen(o => !o)}
        disabled={disabled || loading || budgets.length === 0}
        type="button"
      >
        <span className="sel-btn-label">{label}</span>
        <span className="sel-chevron">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="sel-panel">
          {budgets.map(b => (
            <label key={b.id} className="sel-option">
              <input
                type="checkbox"
                checked={selected.includes(b.id)}
                onChange={() => toggle(b.id)}
              />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [config, setConfig] = useState(loadConfig)
  const [showSettings, setShowSettings] = useState(!loadConfig().apiToken)

  // Project selection
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => localStorage.getItem('productive-project') || ''
  )
  const [loadingMeta, setLoadingMeta] = useState(false)

  // View state
  const [zoom, setZoom] = useState('week')
  const [offset, setOffset] = useState(0)
  const [workBookings, setWorkBookings] = useState([])
  const [timeOffBookings, setTimeOffBookings] = useState([])
  const [people, setPeople] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Resolve state
  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolving, setResolving] = useState(false)
  const [successMsg, setSuccessMsg] = useState(null)
  const [bulkTarget, setBulkTarget] = useState(null)
  const [bulkProgress, setBulkProgress] = useState(null)

  const range = getZoomedRange(zoom, offset)
  const columns = range ? getZoomColumns(zoom, range.start, range.end) : []

  // ── Load projects when token changes ─────────────────────────────
  useEffect(() => {
    if (!config.apiToken) { setProjects([]); return }
    setLoadingMeta(true)
    fetchProjects(config)
      .then(list => {
        setProjects(list)
        setSelectedProjectId(prev => list.find(p => p.id === prev) ? prev : '')
      })
      .catch(err => { setError(err.message); setProjects([]) })
      .finally(() => setLoadingMeta(false))
  }, [config.apiToken, config.orgId])

  // Persist project selection
  useEffect(() => {
    localStorage.setItem('productive-project', selectedProjectId)
  }, [selectedProjectId])

  // ── Main data load ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!config.apiToken || !range || !selectedProjectId) {
      setWorkBookings([]); setTimeOffBookings([]); return
    }
    setLoading(true)
    setError(null)
    try {
      const { bookings: wb, people: wp } = await fetchWorkBookings(config, selectedProjectId, range.start, range.end)
      setWorkBookings(wb)
      setPeople(prev => ({ ...prev, ...wp }))
      const personIds = getPersonIds(wb)
      if (personIds.length > 0) {
        const { bookings: tob, people: top } = await fetchTimeOffBookings(config, personIds, range.start, range.end)
        setTimeOffBookings(filterExcludedEvents(tob, config))
        setPeople(prev => ({ ...prev, ...top }))
      } else {
        setTimeOffBookings([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [config, range?.start, range?.end, selectedProjectId])

  useEffect(() => { loadData() }, [loadData])

  const handleZoom = (z) => { setZoom(z); setOffset(0) }

  const handleSaveConfig = (newConfig) => {
    setConfig(newConfig)
    localStorage.setItem('productive-config', JSON.stringify(newConfig))
    setShowSettings(false)
  }

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // ── Resolve handlers ──────────────────────────────────────────────
  const handleOpenResolve = (personId, date) => {
    const dayWork = workBookings.filter(b => b.person_id === personId && date >= b.started_on && date <= b.ended_on)
    const dayTimeOff = timeOffBookings.filter(b => b.person_id === personId && date >= b.started_on && date <= b.ended_on)
    setResolveTarget({ personId, date, workBookings: dayWork, timeOffBookings: dayTimeOff })
  }

  const handleConfirmResolve = async () => {
    if (!resolveTarget) return
    setResolving(true)
    setError(null)
    try {
      for (const wb of resolveTarget.workBookings) {
        // Scope time-off fetch to this work booking's exact date range — avoids
        // pulling in future absences outside the booking period and over-splitting.
        const { bookings: timeOffInRange } = await fetchTimeOffBookings(
          config, [resolveTarget.personId], wb.started_on, wb.ended_on
        )
        const filteredTimeOff = filterExcludedEvents(timeOffInRange, config)
        const timeOffByDay = getTimeOffByDay(wb, filteredTimeOff)
        const segments = computeSegments(wb, timeOffByDay)
        await resolveOverbooking(config, wb, segments)
      }
      setResolveTarget(null)
      showSuccess('Overbooking resolved!')
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setResolving(false)
    }
  }

  const handleResolvePeriod = (personId, col) => {
    setBulkTarget({
      type: 'period', personId,
      periodStart: col.start, periodEnd: col.end,
      label: `${people[personId]?.name || personId} — ${col.label}`,
    })
  }

  const handleOpenResolveAll = () => setBulkTarget({ type: 'all', label: 'all people' })
  const handleOpenResolveAllPerson = (personId) =>
    setBulkTarget({ type: 'person', personId, label: people[personId]?.name || personId })

  const handleConfirmBulkResolve = async () => {
    if (!bulkTarget) return
    setBulkTarget(null)
    setBulkProgress({ current: 0, total: 0, msg: 'Fetching all bookings…' })
    setError(null)
    try {
      const { bookings: allWork, people: wp } = await fetchAllWorkBookings(config, selectedProjectId)
      setPeople(prev => ({ ...prev, ...wp }))
      let scopedWork = allWork
      if (bulkTarget.type === 'person') scopedWork = allWork.filter(b => b.person_id === bulkTarget.personId)
      else if (bulkTarget.type === 'period') scopedWork = allWork.filter(b =>
        b.person_id === bulkTarget.personId &&
        b.started_on <= bulkTarget.periodEnd && b.ended_on >= bulkTarget.periodStart
      )
      const personIds = [...new Set(scopedWork.map(b => b.person_id).filter(Boolean))]
      // Scope time-off to the union date range of all work bookings being resolved
      const minStart = scopedWork.reduce((m, b) => b.started_on < m ? b.started_on : m, scopedWork[0].started_on)
      const maxEnd   = scopedWork.reduce((m, b) => b.ended_on   > m ? b.ended_on   : m, scopedWork[0].ended_on)
      const { bookings: rawTimeOff } = await fetchTimeOffBookings(config, personIds, minStart, maxEnd)
      const allTimeOff = filterExcludedEvents(rawTimeOff, config)
      const toResolve = scopedWork.filter(wb => getOverlappingTimeOffDays(wb, allTimeOff).length > 0)
      if (toResolve.length === 0) {
        setBulkProgress(null)
        showSuccess('No overbookings found — everything is clean!')
        await loadData()
        return
      }
      setBulkProgress({ current: 0, total: toResolve.length, msg: `Resolving ${toResolve.length} booking(s)…` })
      for (let i = 0; i < toResolve.length; i++) {
        setBulkProgress({ current: i + 1, total: toResolve.length, msg: `Resolving ${i + 1} / ${toResolve.length}…` })
        const wb = toResolve[i]
        await resolveOverbooking(config, wb, computeSegments(wb, getTimeOffByDay(wb, allTimeOff)))
      }
      setBulkProgress(null)
      showSuccess(`Done! Resolved ${toResolve.length} overbooked booking(s).`)
      await loadData()
    } catch (err) {
      setBulkProgress(null)
      setError(err.message)
    }
  }

  const formatRangeLabel = () => {
    if (!range) return ''
    if (zoom === 'year') return new Date(range.start + 'T12:00:00').getFullYear().toString()
    if (zoom === 'quarter') {
      const d = new Date(range.start + 'T12:00:00')
      return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    }
    if (zoom === 'month') return new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const opts = { month: 'short', day: 'numeric' }
    const s = new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', opts)
    const e = new Date(range.end + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })
    return `${s} – ${e}`
  }

  const visibleOverCount = useMemo(() => {
    const isAggregated = zoom === 'quarter' || zoom === 'year'
    if (isAggregated) {
      const periodMap = buildPersonPeriodMap(workBookings, timeOffBookings, columns)
      return Object.values(periodMap).reduce((s, cols) =>
        s + Object.values(cols).filter(e => e.overbookedDays > 0).length, 0)
    }
    const days = columns.map(c => c.key)
    const dayMap = buildPersonDayMap(workBookings, timeOffBookings, days)
    return Object.values(dayMap).reduce((s, personDays) =>
      s + Object.values(personDays).filter(e => e.workHours + e.timeOffHours > 8).length, 0)
  }, [workBookings, timeOffBookings, columns, zoom])

  const needsSetup = !config.apiToken
  const needsProject = config.apiToken && !selectedProjectId && !loadingMeta

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header glass-header">
        <div className="header-brand">
          <div className="header-logos">
            <img src="https://avatars.githubusercontent.com/u/42239399?s=200&v=4" alt="Callstack" className="header-logo-img" />
            <span className="header-logo-sep">×</span>
            <img src="https://avatars.githubusercontent.com/u/20676694?s=200&v=4" alt="Productive" className="header-logo-img" />
          </div>
          <div>
            <div className="header-title">Overbooking Manager</div>
            <div className="header-sub">Callstack · Productive.io</div>
          </div>
        </div>

        {/* ── Project + Budget selectors ── */}
        <div className="header-selectors">
          <div className="sel-group">
            <span className="sel-label">Project</span>
            <div className="sel-wrap">
              <select
                className="sel-native"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                disabled={loadingMeta || !config.apiToken}
              >
                <option value="">{loadingMeta ? 'Loading…' : projects.length === 0 ? 'No projects' : 'Select project…'}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

        </div>

        <div className="header-actions">
          {visibleOverCount > 0 && (
            <button className="btn-resolve-all" onClick={handleOpenResolveAll}>
              Resolve All ({visibleOverCount})
            </button>
          )}
          <button className="btn-glass" onClick={loadData} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
          <button className="btn-glass" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel config={config} onSave={handleSaveConfig} onClose={() => setShowSettings(false)} />
      )}

      {error && (
        <div className="banner banner-error">
          Error: {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {successMsg && <div className="banner banner-success">{successMsg}</div>}
      {needsSetup && !showSettings && (
        <div className="banner banner-warning">
          No API token.{' '}
          <button className="banner-link" onClick={() => setShowSettings(true)}>Open Settings</button>
        </div>
      )}
      {needsProject && (
        <div className="banner banner-warning">Select a project to start.</div>
      )}

      {/* ── Zoom + date nav ── */}
      <div className="date-nav">
        <div className="zoom-tabs">
          {ZOOM_LEVELS.map(z => (
            <button key={z.key} className={`zoom-tab ${zoom === z.key ? 'active' : ''}`} onClick={() => handleZoom(z.key)}>
              {z.label}
            </button>
          ))}
        </div>
        <button className="btn-nav" onClick={() => setOffset(o => o - 1)}>&#8592;</button>
        <span className="date-range-label">{formatRangeLabel()}</span>
        <button className="btn-nav" onClick={() => setOffset(o => o + 1)}>&#8594;</button>
        {offset !== 0 && (
          <button className="btn-nav btn-nav-today" onClick={() => setOffset(0)}>Today</button>
        )}
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><span>Loading bookings…</span></div>
      ) : (
        <main className="app-main">
          <BookingsGrid
            workBookings={workBookings}
            timeOffBookings={timeOffBookings}
            people={people}
            columns={columns}
            zoom={zoom}
            onResolve={handleOpenResolve}
            onResolveAllPerson={handleOpenResolveAllPerson}
            onResolvePeriod={handleResolvePeriod}
          />
        </main>
      )}

      {resolveTarget && (
        <ResolveModal
          target={resolveTarget}
          people={people}
          allTimeOffBookings={timeOffBookings}
          onConfirm={handleConfirmResolve}
          onClose={() => !resolving && setResolveTarget(null)}
          resolving={resolving}
        />
      )}
      {bulkTarget && (
        <BulkResolveModal label={bulkTarget.label} onConfirm={handleConfirmBulkResolve} onClose={() => setBulkTarget(null)} />
      )}
      {bulkProgress && (
        <div className="bulk-progress-overlay">
          <div className="bulk-progress-box">
            <div className="spinner spinner-lg" />
            <div className="bulk-progress-msg">{bulkProgress.msg}</div>
            {bulkProgress.total > 0 && (
              <div className="bulk-progress-bar-wrap">
                <div className="bulk-progress-bar" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
