import { useState } from 'react'

export default function SettingsPanel({ config, onSave, onClose }) {
  const [form, setForm] = useState({
    apiToken: config.apiToken || '',
    orgId: config.orgId || '',
    excludedEventNames: config.excludedEventNames || '',
  })

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.apiToken.trim()) return alert('API token is required')
    onSave({
      ...config,
      apiToken: form.apiToken.trim(),
      orgId: form.orgId.trim(),
      excludedEventNames: form.excludedEventNames.trim(),
    })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label>Productive API Token</label>
            <input
              type="password"
              value={form.apiToken}
              onChange={set('apiToken')}
              placeholder="Paste your API token"
              autoComplete="off"
            />
            <span className="hint">Productive → Settings → API integrations → Generate new token</span>
          </div>

          <div className="form-group">
            <label>Organization ID</label>
            <input
              type="text"
              value={form.orgId}
              onChange={set('orgId')}
              placeholder="e.g. 52239"
            />
            <span className="hint">Found in your Productive URL: app.productive.io/{'{org-id}'}-...</span>
          </div>

          <div className="form-group">
            <label>Excluded event types (company/public holidays)</label>
            <input
              type="text"
              value={form.excludedEventNames}
              onChange={set('excludedEventNames')}
              placeholder="e.g. Easter Monday, Assumption of Mary, Company Day"
            />
            <span className="hint">
              Comma-separated event names to ignore (not treated as overbooking).
              Hover a red cell in the grid to see the event name in the tooltip.
            </span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
