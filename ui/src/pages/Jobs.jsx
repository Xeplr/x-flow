import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'

// PLACEHOLDER, and it says so — see Dashboards.jsx for why an honest empty page
// beats a list that renders nothing.
//
// THE JOB LIST ITSELF IS NOT THIS PACKAGE'S TO RENDER. @xeplr/jobs ships its
// own screen, and a host that has both products renders THAT one and passes it
// a `connectLink` (see @xeplr/ui-jobs' src/pages/Jobs.jsx) — which is where the
// button below really belongs. This app does not depend on that UI package, so
// it cannot show the list.
//
// What it CAN do is not be a dead end. Connecting jobs is a workflow feature,
// it works here, and the only thing missing was a way in — so the way in is
// here, on the page somebody would look for it on, with the list still honestly
// marked as absent rather than faked.
export default function Jobs() {
  return (
    <section>
      <div className="wf-header">
        <div>
          <h1>Jobs</h1>
          <p className="wf-muted">
            Scheduled jobs live in @xeplr/jobs and are listed on its own screen. What this
            app adds is connecting them to each other.
          </p>
        </div>
        <div className="wf-actions">
          <Link className="wf-primary" to={ROUTES.connectJobs()} data-role="connect-jobs">
            Connect jobs
          </Link>
        </div>
      </div>

      <div className="wf-empty">
        <p className="wf-muted">
          <strong>Connect jobs</strong> opens the workflow canvas with the job list as its
          palette. Drop the jobs you want in order, draw the arrows, and each one starts
          only when the one before it has actually finished — carrying its window forward,
          so the next job knows which period was moved.
        </p>
        <p className="wf-muted" style={{ marginTop: 12 }}>
          The job list itself is not part of this app. Its route here is{' '}
          <code>{ROUTES.jobs()}</code>; a host that mounts @xeplr/jobs renders its screen
          instead and puts the same button on it.
        </p>
      </div>
    </section>
  )
}
