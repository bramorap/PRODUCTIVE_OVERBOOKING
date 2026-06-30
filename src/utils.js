// Returns YYYY-MM-DD string for a Date object
export function toDateStr(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Parses YYYY-MM-DD into a Date at noon (avoids timezone DST issues)
export function fromDateStr(str) {
  return new Date(str + 'T12:00:00')
}

// Returns array of YYYY-MM-DD strings for all Mon-Fri in [startStr, endStr]
export function getWorkDays(startStr, endStr) {
  const days = []
  const end = fromDateStr(endStr)
  for (let d = fromDateStr(startStr); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) days.push(toDateStr(d))
  }
  return days
}

// Returns true if dateStr is today
export function isToday(dateStr) {
  return dateStr === toDateStr(new Date())
}

// Returns { start, end } covering 2 weeks from weekOffset weeks relative to current Monday
export function getDateRange(weekOffset = 0) {
  const today = new Date()
  const dow = today.getDay() || 7 // Mon=1 … Sun=7
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow - 1) + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  const friday2 = new Date(monday)
  friday2.setDate(monday.getDate() + 13) // end of second week
  return { start: toDateStr(monday), end: toDateStr(friday2) }
}

// ── Zoom helpers ────────────────────────────────────────────────

// Get Monday of the week containing a Date
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d
}

// Returns { start, end } for zoom level + offset
export function getZoomedRange(zoom, offset) {
  const today = new Date()

  if (zoom === 'week') {
    const mon = getMondayOf(today)
    mon.setDate(mon.getDate() + offset * 7)
    const fri = new Date(mon)
    fri.setDate(mon.getDate() + 13)
    return { start: toDateStr(mon), end: toDateStr(fri) }
  }

  if (zoom === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { start: toDateStr(d), end: toDateStr(end) }
  }

  if (zoom === 'quarter') {
    const rawQ = Math.floor(today.getMonth() / 3) + offset
    const year = today.getFullYear() + Math.floor(rawQ / 4)
    const q = ((rawQ % 4) + 4) % 4
    const d = new Date(year, q * 3, 1)
    const end = new Date(year, q * 3 + 3, 0)
    return { start: toDateStr(d), end: toDateStr(end) }
  }

  if (zoom === 'year') {
    const year = today.getFullYear() + offset
    return { start: `${year}-01-01`, end: `${year}-12-31` }
  }
}

// Returns an array of column definitions for a zoom level
// Each column: { key, type:'day'|'week'|'month', start, end, label, subLabel }
export function getZoomColumns(zoom, rangeStart, rangeEnd) {
  if (zoom === 'week' || zoom === 'month') {
    return getWorkDays(rangeStart, rangeEnd).map(d => {
      const h = dayHeader(d)
      return { key: d, type: 'day', start: d, end: d, label: h.weekday, subLabel: `${h.day} ${h.month}` }
    })
  }

  if (zoom === 'quarter') {
    const cols = []
    const endD = fromDateStr(rangeEnd)
    let mon = getMondayOf(fromDateStr(rangeStart))
    while (mon <= endD) {
      const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
      const s = toDateStr(mon)
      const e = toDateStr(fri > endD ? endD : fri)
      cols.push({
        key: s, type: 'week', start: s, end: e,
        label: fromDateStr(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subLabel: fromDateStr(e).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      })
      mon = new Date(mon); mon.setDate(mon.getDate() + 7)
    }
    return cols
  }

  if (zoom === 'year') {
    const cols = []
    const endD = fromDateStr(rangeEnd)
    let m = new Date(fromDateStr(rangeStart).getFullYear(), fromDateStr(rangeStart).getMonth(), 1)
    while (m <= endD) {
      const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0)
      const s = toDateStr(m)
      const e = toDateStr(monthEnd)
      cols.push({
        key: s, type: 'month', start: s, end: e,
        label: m.toLocaleDateString('en-US', { month: 'short' }),
        subLabel: m.getFullYear(),
      })
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    }
    return cols
  }
}

// Aggregate per-day map into per-period map for quarter/year views
// Returns: personId -> colKey -> { workHours, timeOffHours, overbookedDays, totalWorkDays }
export function buildPersonPeriodMap(workBookings, timeOffBookings, columns) {
  const allDays = columns.flatMap(c => getWorkDays(c.start, c.end))
  const dayMap = buildPersonDayMap(workBookings, timeOffBookings, allDays)

  const map = {}
  for (const pid of Object.keys(dayMap)) {
    map[pid] = {}
    for (const col of columns) {
      const colDays = getWorkDays(col.start, col.end)
      let workH = 0, timeOffH = 0, overDays = 0
      for (const d of colDays) {
        const e = dayMap[pid]?.[d]
        if (!e) continue
        workH += e.workHours
        timeOffH += e.timeOffHours
        if (e.workHours + e.timeOffHours > 8) overDays++
      }
      if (workH > 0 || timeOffH > 0 || overDays > 0) {
        map[pid][col.key] = { workHours: workH, timeOffHours: timeOffH, overbookedDays: overDays, totalWorkDays: colDays.length }
      }
    }
  }
  return map
}

// "Mon\n23 Jun" header for a day column
export function dayHeader(dateStr) {
  const d = fromDateStr(dateStr)
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  }
}

// "Thu, Jun 25" for display
export function formatDateLong(dateStr) {
  return fromDateStr(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Parse JSON:API booking response into flat booking objects + people map
export function parseBookingsResponse(data, included = []) {
  const includedByTypeId = {}
  for (const item of included) {
    if (!includedByTypeId[item.type]) includedByTypeId[item.type] = {}
    includedByTypeId[item.type][item.id] = item
  }

  const people = {}
  const bookings = (data || []).map(item => {
    const a = item.attributes
    const r = item.relationships || {}

    const personId = r.person?.data?.id ?? null
    const serviceId = r.service?.data?.id ?? null
    const eventId = r.event?.data?.id ?? null

    // Collect person
    if (personId && includedByTypeId.people?.[personId]) {
      const p = includedByTypeId.people[personId].attributes
      people[personId] = {
        id: personId,
        name: `${p.first_name} ${p.last_name}`.trim(),
        email: p.email,
      }
    }

    // Collect service name
    let serviceName = null
    if (serviceId && includedByTypeId.services?.[serviceId]) {
      serviceName = includedByTypeId.services[serviceId].attributes?.name || null
    }

    // Collect event name (time-off type: "Vacation", "Sick Leave", "Easter Monday", etc.)
    let eventName = null
    if (eventId && includedByTypeId.events?.[eventId]) {
      const evAttrs = includedByTypeId.events[eventId].attributes || {}
      eventName = evAttrs.name || evAttrs.time_off_type_name || evAttrs.title || null
    }

    // Normalise hours per day
    const method = a.booking_method_id
    let hoursPerDay
    if (method === 2) {
      // percentage: 100% = full day (8h)
      hoursPerDay = 8 * (a.percentage || 0) / 100
    } else if (method === 3) {
      // total hours: divide total_time (minutes) by working days
      const wdays = a.total_working_days || getWorkDays(a.started_on, a.ended_on).length
      hoursPerDay = wdays > 0 ? (a.total_time || 0) / 60 / wdays : 0
    } else {
      // method 1 – hours per day (field: hours, fallback: time in minutes)
      hoursPerDay = a.hours ?? (a.time ? a.time / 60 : 0)
    }

    return {
      id: item.id,
      person_id: personId,
      service_id: serviceId,
      event_id: eventId,
      started_on: a.started_on,
      ended_on: a.ended_on,
      hours_per_day: hoursPerDay,
      hours: a.hours,
      time: a.time,
      percentage: a.percentage,
      booking_method_id: method,
      note: a.note,
      is_time_off: !!eventId,
      service_name: serviceName,
      event_name: eventName,
    }
  })

  return { bookings, people }
}

// Build map: personId -> dateStr -> { workHours, timeOffHours, workBookings, timeOffBookings }
export function buildPersonDayMap(workBookings, timeOffBookings, workDays) {
  const daySet = new Set(workDays)
  const map = {}

  const add = (booking, type) => {
    if (!booking.person_id) return
    for (const day of workDays) {
      if (day < booking.started_on || day > booking.ended_on) continue
      if (!map[booking.person_id]) map[booking.person_id] = {}
      if (!map[booking.person_id][day]) {
        map[booking.person_id][day] = { workHours: 0, timeOffHours: 0, workBookings: [], timeOffBookings: [] }
      }
      const entry = map[booking.person_id][day]
      if (type === 'work') {
        entry.workHours += booking.hours_per_day
        if (!entry.workBookings.find(b => b.id === booking.id)) entry.workBookings.push(booking)
      } else {
        entry.timeOffHours += booking.hours_per_day
        if (!entry.timeOffBookings.find(b => b.id === booking.id)) entry.timeOffBookings.push(booking)
      }
    }
  }

  for (const b of workBookings) add(b, 'work')
  for (const b of timeOffBookings) add(b, 'timeOff')

  return map
}

// Returns sorted list of unique person IDs from bookings
export function getPersonIds(bookings) {
  return [...new Set(bookings.map(b => b.person_id).filter(Boolean))]
}

// Returns {day: totalTimeOffHours} for all days within the work booking that have time-off
export function getTimeOffByDay(workBooking, timeOffBookings) {
  const map = {}
  for (const tob of timeOffBookings) {
    if (tob.person_id !== workBooking.person_id) continue
    const overlapStart = workBooking.started_on > tob.started_on ? workBooking.started_on : tob.started_on
    const overlapEnd   = workBooking.ended_on   < tob.ended_on   ? workBooking.ended_on   : tob.ended_on
    if (overlapStart > overlapEnd) continue
    for (const d of getWorkDays(overlapStart, overlapEnd)) {
      map[d] = (map[d] || 0) + tob.hours_per_day
    }
  }
  return map
}

// Collect ALL time-off days that overlap a given work booking (for display)
export function getOverlappingTimeOffDays(workBooking, allTimeOffBookings) {
  return Object.keys(getTimeOffByDay(workBooking, allTimeOffBookings)).sort()
}

// Compute segments for recreating a work booking with time-off days removed/reduced.
// timeOffByDay: {day: totalTimeOffHours} from getTimeOffByDay().
// Partial days (timeOff < workHours) get a 1-day segment with hours_override = workHours - timeOffHours.
// Full days (timeOff >= workHours) are skipped entirely.
export function computeSegments(workBooking, timeOffByDay) {
  const wdays = getWorkDays(workBooking.started_on, workBooking.ended_on)

  const segments = []
  let segStart = null
  let segEnd = null

  const flush = () => {
    if (segStart !== null) {
      segments.push({ started_on: segStart, ended_on: segEnd })
      segStart = null
      segEnd = null
    }
  }

  for (const day of wdays) {
    const timeOffH = timeOffByDay[day] || 0
    if (timeOffH === 0) {
      // Normal working day — extend current segment
      if (segStart === null) segStart = day
      segEnd = day
    } else {
      const remaining = workBooking.hours_per_day - timeOffH
      if (remaining > 0) {
        // Partial day: flush running segment, add a single-day segment with reduced hours
        flush()
        segments.push({ started_on: day, ended_on: day, hours_override: remaining })
      } else {
        // Full time-off: skip the day entirely
        flush()
      }
    }
  }
  flush()

  return segments
}
