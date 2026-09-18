import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import { listCompanies, createCompany, setActiveCompany, getActiveCompany } from '../api/companies.js'

// Picking a company is a PAGE, not a nav widget.
//
// It is the one thing that must work before anything else does: the l1 header
// comes from this choice, and without it every workspace-scoped route 403s. A
// dropdown tucked into the chrome would be a control you have to find in order
// to fix a screen full of errors.
export default function SelectCompany() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const active = getActiveCompany()

  useEffect(() => {
    let cancelled = false
    listCompanies()
      .then((rows) => { if (!cancelled) setCompanies(rows) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  const choose = (company) => {
    setActiveCompany(company)
    navigate(ROUTES.workspace())
  }

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      // Selected immediately. Creating one and then being asked to pick it is
      // a step that exists only because the code was written that way.
      choose(await createCompany(name.trim()))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>Choose a company</h1>
      <p className="muted">Everything below this is scoped to it.</p>
      {error && <p className="wf-req">{error}</p>}

      <div className="wf-list">
        {companies.map((c) => (
          <button type="button" key={c.id} className="wf-card" onClick={() => choose(c)}>
            <span className="wf-card-main">
              <span className="wf-card-name">{c.name}</span>
            </span>
            {active && active.id === c.id && <span className="wf-status wf-status-current">Current</span>}
          </button>
        ))}
      </div>

      {!companies.length && !error && (
        <p className="muted" style={{ marginTop: 20 }}>No companies yet — make the first one.</p>
      )}

      <form onSubmit={create} style={{ marginTop: 28, maxWidth: 380 }}>
        <div className="wf-field">
          <label htmlFor="company-name">New company</label>
          <input id="company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Ltd" />
        </div>
        <button type="submit" className="wf-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create and continue'}
        </button>
      </form>
    </section>
  )
}
