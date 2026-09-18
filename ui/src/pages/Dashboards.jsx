import { ROUTES } from '../routes.js'

// PLACEHOLDER, and it says so.
//
// The rail item is real and the route resolves, which is the point: a menu that
// leads nowhere is worse than no menu, and a page that renders an empty list is
// worse still — it looks like a feature that is broken rather than one that is
// not built.
//
// The list, the record and the builder go here. ROUTES.dashboards(id) already
// follows the suite's convention: no id is the list, an id is that dashboard.
export default function Dashboards() {
  return (
    <section>
      <h1>Dashboards</h1>
      <p className="muted">Not built yet.</p>
      <div className="wf-empty">
        <p className="muted">
          This page is a placeholder. Its route is <code>{ROUTES.dashboards()}</code>, and a
          record will be <code>{ROUTES.dashboards('«id»')}</code>.
        </p>
      </div>
    </section>
  )
}
