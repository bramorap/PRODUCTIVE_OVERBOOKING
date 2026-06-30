import { parseBookingsResponse, getWorkDays } from './utils'

function makeHeaders(config) {
  return {
    ...(config.apiToken && { 'X-Auth-Token': config.apiToken }),
    ...(config.orgId && { 'X-Org-Id': config.orgId }),
    'Content-Type': 'application/json',
  }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/productive${path}`, options)
  if (res.status === 204) return null
  const json = await res.json()
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || json?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json
}

// Fetch all pages for a given path + params (handles JSON:API pagination)
async function fetchAllPages(path, params, config) {
  const allData = []
  let allIncluded = []
  let page = 1

  while (true) {
    const qs = new URLSearchParams()
    for (const [key, val] of Object.entries({ ...params, 'page[number]': page, 'page[size]': 200 })) {
      qs.append(key, val)
    }

    const json = await apiFetch(`${path}?${qs.toString()}`, { headers: makeHeaders(config) })
    if (!json) break

    if (json.data) allData.push(...json.data)
    if (json.included) allIncluded = allIncluded.concat(json.included)

    if (!json.links?.next || json.data?.length === 0) break
    page++
  }

  return { data: allData, included: allIncluded }
}

// Fetch work bookings for the given project within the date range.
// Excludes time-off bookings (those with event_id from BambooHR).
export async function fetchWorkBookings(config, projectId, startDate, endDate) {
  const params = {
    'filter[project_id]': projectId,
    'filter[started_on][lt_eq]': endDate,
    'filter[ended_on][gt_eq]': startDate,
    include: 'person,service,event',
  }
  const { data, included } = await fetchAllPages('/bookings', params, config)
  const result = parseBookingsResponse(data, included)
  result.bookings = result.bookings.filter(b => !b.is_time_off)
  return result
}

// Fetch ALL work bookings for a project (no date range).
// Excludes time-off bookings.
export async function fetchAllWorkBookings(config, projectId) {
  const params = {
    'filter[project_id]': projectId,
    include: 'person,service,event',
  }
  const { data, included } = await fetchAllPages('/bookings', params, config)
  const result = parseBookingsResponse(data, included)
  result.bookings = result.bookings.filter(b => !b.is_time_off)
  return result
}

// Fetch ALL time-off bookings for given person IDs (no date range)
export async function fetchAllTimeOffForPersons(config, personIds) {
  if (!personIds.length) return { bookings: [], people: {} }
  const params = {
    'filter[person_id]': personIds.join(','),
    include: 'person,event',
  }
  const { data, included } = await fetchAllPages('/bookings', params, config)
  const parsed = parseBookingsResponse(data, included)
  parsed.bookings = parsed.bookings.filter(b => b.is_time_off)
  return parsed
}

// Fetch time-off/absence bookings for given person IDs within the date range.
// Must include 'event' to get event.data populated (otherwise relationship shows meta only).
export async function fetchTimeOffBookings(config, personIds, startDate, endDate) {
  if (!personIds.length) return { bookings: [], people: {} }

  const params = {
    'filter[person_id]': personIds.join(','),
    'filter[started_on][lt_eq]': endDate,
    'filter[ended_on][gt_eq]': startDate,
    include: 'person,event',
  }
  const { data, included } = await fetchAllPages('/bookings', params, config)
  const parsed = parseBookingsResponse(data, included)

  // Keep only absence bookings: event_id is present and service_id is absent
  parsed.bookings = parsed.bookings.filter(b => b.is_time_off)
  return parsed
}

// Fetch all projects (no status filter — just list everything accessible)
export async function fetchProjects(config) {
  const { data } = await fetchAllPages('/projects', {}, config)
  return (data || [])
    .map(p => ({ id: p.id, name: p.attributes?.name || p.id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Delete a booking by ID
export async function deleteBooking(config, bookingId) {
  await apiFetch(`/bookings/${bookingId}`, {
    method: 'DELETE',
    headers: makeHeaders(config),
  })
}

// Create a new work booking. hoursOverride allows partial-day segments (e.g. half-day time-off).
export async function createBooking(config, booking, startedOn, endedOn, hoursOverride) {
  const method = booking.booking_method_id || 1
  let hoursOrPct
  if (method === 2) {
    if (hoursOverride !== undefined) {
      // Partial day: scale percentage proportionally
      const pct = Math.round((booking.percentage || 100) * hoursOverride / (booking.hours_per_day || 8))
      hoursOrPct = { percentage: pct }
    } else {
      hoursOrPct = { percentage: booking.percentage }
    }
  } else if (method === 3) {
    const hpd = hoursOverride !== undefined ? hoursOverride : booking.hours_per_day
    const segDays = getWorkDays(startedOn, endedOn).length
    hoursOrPct = { total_time: Math.round(hpd * 60 * segDays) }
  } else {
    const h = hoursOverride !== undefined ? hoursOverride : (booking.hours ?? booking.hours_per_day)
    hoursOrPct = { hours: h }
  }

  const body = {
    data: {
      type: 'bookings',
      attributes: {
        started_on: startedOn,
        ended_on: endedOn,
        booking_method_id: method,
        ...hoursOrPct,
        ...(booking.note && { note: booking.note }),
      },
      relationships: {
        person: { data: { id: booking.person_id, type: 'people' } },
        service: { data: { id: booking.service_id, type: 'services' } },
      },
    },
  }

  return apiFetch('/bookings', {
    method: 'POST',
    headers: makeHeaders(config),
    body: JSON.stringify(body),
  })
}

// Resolve overbooking: delete the work booking and recreate it in segments
export async function resolveOverbooking(config, workBooking, segments) {
  // Delete the original work booking
  await deleteBooking(config, workBooking.id)

  for (const seg of segments) {
    await createBooking(config, workBooking, seg.started_on, seg.ended_on, seg.hours_override)
  }
}
