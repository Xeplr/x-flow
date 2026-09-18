import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import './workflow.css'

export default function WorkflowListSample({ rows, handleCreate }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  // WHAT THIS NEW ONE WILL BE. Chosen at creation and never afterwards — see
  // handleCreate: flipping an existing workflow's kind would leave its steps
  // drawn on a canvas that can no longer explain them.
  const [kind, setKind] = useState('workflow')

  async function onCreate(e) {
    e.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    const id = await handleCreate(name.trim(), kind)
    setCreating(false)
    setName('')
    if (id) window.location.assign(ROUTES.workflowEditor(id))
  }

  return (
    <section>
      <div className="wf-header">
        <div>
          <h1>Workflows</h1>
          <p className="wf-muted">Ordered steps bound to registered actions — see Actions for what a step can call.</p>
        </div>
      </div>

      <form className="wf-panel wf-field-row" style={{ marginTop: 20, alignItems: 'flex-end' }} onSubmit={onCreate}>
        <div className="wf-field" style={{ marginBottom: 0 }}>
          <label htmlFor="wf-new-name">New workflow</label>
          <input id="wf-new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </div>
        {/* ONE FORM, NOT TWO BUTTONS. Connecting jobs and building a workflow
            produce the same kind of thing — a canvas of steps — and differ only
            in what the palette offers, so a separate "Connect jobs" button
            beside "Create" would imply two products where there is one. */}
        <div className="wf-field" style={{ marginBottom: 0 }}>
          <label htmlFor="wf-new-kind">Built from</label>
          <select id="wf-new-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="workflow">Actions</option>
            <option value="jobs">Jobs — connect existing jobs</option>
          </select>
        </div>
        <button className="wf-primary" type="submit" disabled={!name.trim() || creating}>
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>

      {rows === null && <p className="wf-muted" style={{ marginTop: 24 }}>Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="wf-empty"><p className="wf-muted">No workflows yet — create one above.</p></div>
      )}

      {rows && rows.length > 0 && (
        <div className="wf-list">
          {rows.map((w) => (
            <div className="wf-card" key={w.id}>
              <Link
                className="wf-card-main"
                to={ROUTES.workflowEditor(w.id)}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="wf-card-name">
                  {w.name}
                  {w.kind === 'jobs' && <span className="wf-kind-tag">jobs</span>}
                </div>
                {w.description && <div className="wf-card-desc">{w.description}</div>}
              </Link>
              <span className={'wf-status wf-status-' + (w.status === 'published' ? 'good' : 'idle')}>
                {w.status}
              </span>
              <span className="wf-card-meta">
                {(w.steps || []).length} step{(w.steps || []).length === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
