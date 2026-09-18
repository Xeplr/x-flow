import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import { getActiveCompany, getActiveWorkspace } from '../api/companies.js'

// The workspace you are IN.
//
// It used to list every workspace and offer to create one, which made this page
// two things at once — where you are, and where you go to be somewhere else.
// That list is its own page now (SelectWorkspace), reachable from the rail, so
// Home can just be the workspace.
export default function WorkspaceHome() {
  const company = getActiveCompany()
  const active = getActiveWorkspace()

  // Nothing below this works without a company — the l1 header comes from it,
  // so every request would 403. Said plainly, with the way to fix it, rather
  // than letting the next page fill with errors that don't name the cause.
  if (!company) {
    return (
      <section>
        <h1>No company selected</h1>
        <p className="muted">Everything here is scoped to a company.</p>
        <Link className="wf-primary" to={ROUTES.selectCompany()} style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          Choose one
        </Link>
      </section>
    )
  }

  // A company but no workspace is the same shape of problem one level down, so
  // it gets the same treatment rather than an empty page.
  if (!active) {
    return (
      <section>
        <h1>{company.name}</h1>
        <p className="muted">No workspace selected — pick one to start.</p>
        <Link className="wf-primary" to={ROUTES.selectWorkspace()} style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
          Choose a workspace
        </Link>
      </section>
    )
  }

  return (
    <section>
      <h1>{active.name}</h1>
      <p className="muted">{company.name} · xeplr-workflow binds xeplr actions together.</p>

      <div className="wf-actions" style={{ marginTop: 20 }}>
        <Link className="wf-primary" to={ROUTES.dashboards()} style={{ textDecoration: 'none' }}>Dashboards</Link>
        <Link to={ROUTES.jobs()}>Jobs</Link>
        <Link to={ROUTES.actions()}>Actions</Link>
      </div>
    </section>
  )
}
