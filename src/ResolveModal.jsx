import { useMemo } from 'react'
import { computeSegments, getOverlappingTimeOffDays, formatDateLong, getWorkDays } from './utils'

export default function ResolveModal({ target, people, allTimeOffBookings, onConfirm, onClose, resolving }) {
  const { personId, date, workBookings, timeOffBookings } = target
  const person = people[personId]

  // For each work booking, find all overlapping time-off days and compute segments
  const plans = useMemo(() => {
    return workBookings.map(wb => {
      const timeOffDays = getOverlappingTimeOffDays(wb, allTimeOffBookings)
      const segments = computeSegments(wb, timeOffDays)
      return { workBooking: wb, timeOffDays, segments }
    })
  }, [workBookings, allTimeOffBookings])

  const totalWork = workBookings.reduce((s, b) => s + b.hours_per_day, 0)
  const totalTimeOff = timeOffBookings.reduce((s, b) => s + b.hours_per_day, 0)

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !resolving && onClose()}>
      <div className="modal modal-resolve">
        <div className="modal-header">
          <h2>Resolve Overbooking</h2>
          {!resolving && <button className="modal-close" onClick={onClose}>x</button>}
        </div>

        <div className="resolve-person">
          <strong>{person?.name || personId}</strong>
          <span className="resolve-date">{formatDateLong(date)}</span>
        </div>

        <div className="resolve-summary">
          <div className="resolve-row">
            <span className="tag tag-work">Work</span>
            <span>{totalWork}h/day</span>
          </div>
          <div className="resolve-row">
            <span className="tag tag-timeoff">Time off</span>
            <span>{totalTimeOff}h/day</span>
          </div>
          <div className="resolve-row resolve-total">
            <span>Total</span>
            <span className="overbooked-hours">{totalWork + totalTimeOff}h — overbooked by {totalWork + totalTimeOff - 8}h</span>
          </div>
        </div>

        <div className="resolve-plans">
          <h3>Resolution plan</h3>
          {plans.map(({ workBooking, timeOffDays, segments }) => (
            <div key={workBooking.id} className="plan-card">
              <div className="plan-booking-name">
                {workBooking.service_name || `Booking #${workBooking.id}`}
                <span className="plan-dates"> ({workBooking.started_on} → {workBooking.ended_on})</span>
              </div>

              {timeOffDays.length > 0 && (
                <div className="plan-timeoff-days">
                  Time-off days within booking: {timeOffDays.join(', ')}
                </div>
              )}

              <div className="plan-segments">
                {segments.length === 0 ? (
                  <span className="plan-delete">Will delete this booking (entire range is time-off)</span>
                ) : (
                  <>
                    <span className="plan-label">Will be replaced by {segments.length} segment{segments.length > 1 ? 's' : ''}:</span>
                    {segments.map((seg, i) => (
                      <div key={i} className="plan-segment">
                        {i + 1}. {seg.started_on} → {seg.ended_on}
                        <span className="plan-days"> ({getWorkDays(seg.started_on, seg.ended_on).length} work days)</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose} disabled={resolving}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm} disabled={resolving}>
            {resolving ? 'Resolving...' : 'Resolve Overbooking'}
          </button>
        </div>
      </div>
    </div>
  )
}
