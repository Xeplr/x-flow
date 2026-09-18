import { useEffect, useState } from 'react'
import { raiseSnackbar } from '@xeplr/ui-utils'
import { listActions } from '../api/actions.js'

// WHAT A STEP CAN BE — reference, not a document you edit.
//
// Read from the server's own registry, so this page cannot describe an action
// the runner does not have, or miss one it does. Registering an action is a
// deployment decision (see @xeplr/workflow's lib/actionCatalog.js); there is deliberately
// no way to add one from here.
export default function Actions() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    listActions()
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((err) => { if (!cancelled) { setRows([]); raiseSnackbar(err.message, { design: 'error' }) } })
    return () => { cancelled = true }
  }, [])

  return (
    <section>
      <h1>Actions</h1>
      <p className="muted">
        Everything a workflow step can call. A step names one of these; what the name means
        lives on the server.
      </p>

      {rows === null && <p className="muted" style={{ marginTop: 24 }}>Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="wf-empty"><p className="muted">No actions are registered.</p></div>
      )}

      {rows && rows.length > 0 && (
        <div className="wf-list">
          {rows.map((a) => (
            <div className="wf-action" key={a.name}>
              <div className="wf-action-name">{a.name}</div>
              {a.description && <div className="wf-action-desc">{a.description}</div>}
              <div className="wf-action-inputs">
                {(a.inputSchema || []).map((f) => (
                  <div className="wf-action-input" key={f.name}>
                    <code>{f.name}</code>
                    <span className="wf-action-input-type">{f.type || 'any'}</span>
                    {f.required && <span className="wf-req">required</span>}
                    {f.description && <span className="muted">— {f.description}</span>}
                  </div>
                ))}
                {!(a.inputSchema || []).length && <span className="muted">Takes no input.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
