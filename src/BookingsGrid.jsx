import { useMemo, useState } from 'react'
import { buildPersonDayMap, buildPersonPeriodMap, getPersonIds, isToday } from './utils'

function cellClass(workH, timeOffH) {
  const t = workH + timeOffH
  if (t === 0) return 'cell-empty'
  if (t > 16) return 'cell-overbooked-heavy'
  if (t > 8) return 'cell-overbooked'
  if (timeOffH > 0 && workH === 0) return 'cell-timeoff-only'
  if (timeOffH > 0) return 'cell-mixed'
  return 'cell-normal'
}

function DayCell({ entry, personId, date, onResolve, isActive, onMouseEnter }) {
  const base = `cell ${isActive ? 'col-active' : ''}`
  if (!entry) return <td className={`${base} cell-empty`} onMouseEnter={onMouseEnter} />
  const { workHours: wh, timeOffHours: th } = entry
  const total = wh + th
  const over = total > 8

  const eventNames = [...new Set(entry.timeOffBookings.map(b => b.event_name).filter(Boolean))].join(', ')
  const tooltip = eventNames || undefined

  return (
    <td className={`${base} ${cellClass(wh, th)}`} onMouseEnter={onMouseEnter} title={tooltip}>
      <div className="cell-content">
        {wh > 0 && <div className="cell-hours cell-hours-work">{wh}h</div>}
        {th > 0 && <div className="cell-hours cell-hours-timeoff">{th}h off</div>}
        {over && (
          <>
            <div className="cell-total">={total}h</div>
            <button className="resolve-btn" onClick={() => onResolve(personId, date)}>Resolve</button>
          </>
        )}
      </div>
    </td>
  )
}

function PeriodCell({ entry, personId, col, onResolvePeriod, isActive, onMouseEnter }) {
  const base = `cell ${isActive ? 'col-active' : ''}`
  if (!entry) return <td className={`${base} cell-empty`} onMouseEnter={onMouseEnter} />
  const { workHours: wh, timeOffHours: th, overbookedDays: od } = entry
  const over = od > 0

  return (
    <td className={`${base} ${over ? 'cell-overbooked' : cellClass(wh, th)}`} onMouseEnter={onMouseEnter}>
      <div className="cell-content">
        {wh > 0 && <div className="cell-period-hours">{Math.round(wh)}h</div>}
        {th > 0 && <div className="cell-period-timeoff">{Math.round(th)}h off</div>}
        {over && (
          <>
            <div className="cell-period-overbooked">{od}d over</div>
            <button className="resolve-btn" onClick={() => onResolvePeriod(personId, col)}>Resolve</button>
          </>
        )}
      </div>
    </td>
  )
}

export default function BookingsGrid({
  workBookings, timeOffBookings, people, columns, zoom,
  onResolve, onResolveAllPerson, onResolvePeriod,
}) {
  const [hoveredColKey, setHoveredColKey] = useState(null)
  const isAggregated = zoom === 'quarter' || zoom === 'year'

  const cellMap = useMemo(() => {
    if (isAggregated) {
      return buildPersonPeriodMap(workBookings, timeOffBookings, columns)
    }
    const days = columns.map(c => c.key)
    return buildPersonDayMap(workBookings, timeOffBookings, days)
  }, [workBookings, timeOffBookings, columns, isAggregated])

  const personIds = useMemo(() => {
    const ids = getPersonIds(workBookings)
    return ids.sort((a, b) => (people[a]?.name || a).localeCompare(people[b]?.name || b))
  }, [workBookings, people])

  // Count overbooked items per person visible in current view
  const personOverCount = useMemo(() => {
    const counts = {}
    for (const pid of personIds) {
      let n = 0
      if (isAggregated) {
        for (const col of columns) {
          if (cellMap[pid]?.[col.key]?.overbookedDays > 0) n++
        }
      } else {
        for (const col of columns) {
          const e = cellMap[pid]?.[col.key]
          if (e && e.workHours + e.timeOffHours > 8) n++
        }
      }
      counts[pid] = n
    }
    return counts
  }, [cellMap, personIds, columns, isAggregated])

  const totalOver = Object.values(personOverCount).reduce((s, n) => s + n, 0)

  if (personIds.length === 0) {
    return (
      <div className="glass empty-state">
        <p>No bookings found for the configured budgets in this date range.</p>
        <p>Check your budget IDs in Settings or try a different date range.</p>
      </div>
    )
  }

  return (
    <div className="glass grid-wrapper">
      {totalOver > 0 && (
        <div className="overbooked-banner">
          <span>
            {totalOver} {isAggregated ? 'period(s) with conflicts' : `overbooked day${totalOver > 1 ? 's' : ''}`} in this range
          </span>
        </div>
      )}

      <div className="table-scroll" onMouseLeave={() => setHoveredColKey(null)}>
        <table className="bookings-table">
          <thead>
            <tr>
              <th className="th-person">Person</th>
              {columns.map(col => (
                <th
                  key={col.key}
                  onMouseEnter={() => setHoveredColKey(col.key)}
                  className={`th-day ${col.type === 'day' && isToday(col.key) ? 'th-today' : ''} ${col.type !== 'day' ? 'th-period' : ''} ${hoveredColKey === col.key ? 'col-active' : ''}`}
                >
                  {col.type === 'day' ? (
                    <>
                      <span className="th-weekday">{col.label}</span>
                      <span className="th-date">{col.subLabel.split(' ')[0]}</span>
                      <span className="th-month">{col.subLabel.split(' ')[1]}</span>
                    </>
                  ) : (
                    <>
                      <span className="th-period-label">{col.label}</span>
                      <span className="th-period-sub">{col.subLabel}</span>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {personIds.map(pid => (
              <tr key={pid}>
                <td className="td-person">
                  <div className="person-name">{people[pid]?.name || pid}</div>
                  {people[pid]?.email && <div className="person-email">{people[pid].email}</div>}
                  {personOverCount[pid] > 0 && (
                    <button
                      className="resolve-person-btn"
                      onClick={() => onResolveAllPerson(pid)}
                      title="Resolve all overbookings for this person (all time)"
                    >
                      Resolve all ({personOverCount[pid]})
                    </button>
                  )}
                </td>
                {columns.map(col =>
                  isAggregated ? (
                    <PeriodCell
                      key={col.key}
                      entry={cellMap[pid]?.[col.key]}
                      personId={pid}
                      col={col}
                      onResolvePeriod={onResolvePeriod}
                      isActive={hoveredColKey === col.key}
                      onMouseEnter={() => setHoveredColKey(col.key)}
                    />
                  ) : (
                    <DayCell
                      key={col.key}
                      entry={cellMap[pid]?.[col.key]}
                      personId={pid}
                      date={col.key}
                      onResolve={onResolve}
                      isActive={hoveredColKey === col.key}
                      onMouseEnter={() => setHoveredColKey(col.key)}
                    />
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span className="legend-item"><span className="legend-dot dot-normal" /> Work only</span>
        <span className="legend-item"><span className="legend-dot dot-timeoff" /> Time off only</span>
        <span className="legend-item"><span className="legend-dot dot-mixed" /> Work + time off (OK)</span>
        <span className="legend-item"><span className="legend-dot dot-over" /> Overbooked (&gt;8h)</span>
      </div>
    </div>
  )
}
