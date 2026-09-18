import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import { listWorkspaces, createWorkspace } from '../api/workspaces.js'
import { getActiveCompany, getActiveWorkspace, setActiveWorkspace } from '../api/companies.js'

// Choosing a workspace — a PAGE, and its own one.
//
// It was a section at the bottom of the workspace home, which made the home
// page two things at once: where you are, and where you go to be somewhere
// else. Splitting it means Home can be about the workspace you are in, and the
// rail has somewhere to point when you want a different one.
//
// INSIDE /workspace, unlike company selection: you need a company before
// anything works at all, but a workspace is chosen from within one.
export default function SelectWorkspace() {
  const navigate = useNavigate()
  const company = getActiveCompany()
  const active = getActiveWorkspace()
  const [workspaces, setWorkspaces] = useState(null)   // null = not loaded yet
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    listWorkspaces()
      .then((rows) => { if (!cancelled) setWorkspaces(rows) })
      .catch((err) => { if (!cancelled) { setWorkspaces([]); setError(err.message) } })
    return () => { cancelled = true }
  }, [])

  const enter = (workspace) => {
    setActiveWorkspace(workspace)
    navigate(ROUTES.workspace())
  }

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim() || !company) return
    try {
      // Entered immediately. Creating one and then being asked to pick it is a
      // step that exists only because the code was written that way.
      enter(await createWorkspace(name.trim(), company.id))
    } catch (err) {
      setError(err.message)
    }
  }

  // A workspace belongs to a company, so there is nothing to list or create
  // without one. Said plainly, with the way to fix it.
  if (!company) {
    return (
      <section>
        <h1>No company selected</h1>
        <p className="muted">A workspace belongs to a company, so pick one first.</p>
        <Link className="wf-primary" to={ROUTES.selectCompany()} style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          Choose a company
        </Link>
      </section>
    )
  }

  return (
    <section>
      <h1>Choose a workspace</h1>
      <p className="muted">In {company.name}.</p>
      {error && <p className="wf-req">{error}</p>}

      {workspaces === null && <p className="muted" style={{ marginTop: 24 }}>Loading…</p>}

      {workspaces && workspaces.length > 0 && (
        <div className="wf-list">
          {workspaces.map((w) => (
            <button type="button" key={w.id} className="wf-card" onClick={() => enter(w)}>
              <span className="wf-card-main">
                <span className="wf-card-name">{w.name}</span>
                {w.description && <span className="wf-card-desc">{w.description}</span>}
              </span>
              {active && active.id === w.id && <span className="wf-status wf-status-current">Current</span>}
            </button>
          ))}
        </div>
      )}

      {workspaces && workspaces.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>None yet — make the first one.</p>
      )}

      <form onSubmit={create} style={{ marginTop: 28, maxWidth: 380 }}>
        <div className="wf-field">
          <label htmlFor="workspace-name">New workspace</label>
          <input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Operations" />
        </div>
        <button type="submit" className="wf-primary" disabled={!name.trim()}>Create and enter</button>
      </form>
    </section>
  )
}
