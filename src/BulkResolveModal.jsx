export default function BulkResolveModal({ label, onConfirm, onClose }) {
  const isAll = label === 'all people'

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Resolve All Overbookings</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div style={{ padding: '20px' }}>
          <p style={{ marginBottom: 12 }}>
            This will resolve <strong>all overbooking conflicts</strong> for{' '}
            <strong>{label}</strong> across <strong>all time</strong> — not just the current view.
          </p>
          <p style={{ marginBottom: 20, color: '#6b7280', fontSize: 13 }}>
            For each work booking that overlaps with a time-off booking, it will be
            split into segments that skip the time-off days. The original booking
            will be deleted and replaced.
          </p>
          {isAll && (
            <div className="banner banner-warning" style={{ marginBottom: 16, borderRadius: 6, padding: '8px 12px' }}>
              This affects ALL people in the configured budgets.
            </div>
          )}
        </div>

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>
            Resolve All for {label}
          </button>
        </div>
      </div>
    </div>
  )
}
