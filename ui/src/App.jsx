import { useMemo } from 'react'
import { Routes, Route, Link, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { authRoutes, authPath, NavPage, ProtectedRoute } from '@xeplr/ui-account'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ROUTES } from './routes.js'
import WorkspaceHome from './pages/WorkspaceHome.jsx'
import Dashboards from './pages/Dashboards.jsx'
import Jobs from './pages/Jobs.jsx'
import ActionsPage from './pages/Actions.jsx'
import SelectWorkspace from './pages/SelectWorkspace.jsx'
import SelectCompany from './pages/SelectCompany.jsx'
import { getActiveCompany } from './api/companies.js'
import { registerWorkflowUI } from './index.js'

// Module-level (stable reference) so NavPage's memoization actually holds — a
// real feed can replace count/onClick later without changing this shape.
const notifications = { count: 0, onClick: () => {} }

// Rendered ABOVE the framework's builtin Profile/Change Password section.
const settingsOverrides = [
  { name: 'Select Company', path: ROUTES.selectCompany() },
  { name: 'Admin', path: authPath('userRoles') }
]

// Matches the stroke-based icon language the framework's own NavPage icons use
// (24x24 viewBox, currentColor stroke).
function icon(children) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const HomeIcon = icon(<>
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <path d="M9 22V12h6v10" />
</>)
// A board: panels of different sizes, which is what one is.
const DashboardsIcon = icon(<>
  <rect x="3" y="3" width="7" height="9" rx="1" />
  <rect x="14" y="3" width="7" height="5" rx="1" />
  <rect x="14" y="12" width="7" height="9" rx="1" />
  <rect x="3" y="16" width="7" height="5" rx="1" />
</>)
// A clock with an arrow round it — something that runs again, on its own.
// Deliberately NOT a plain clock: that is history, and this is a schedule.
const JobsIcon = icon(<>
  <path d="M21 12a9 9 0 1 1-3-6.7" />
  <path d="M21 4v5h-5" />
  <path d="M12 8v4l2.5 1.5" />
</>)
// A lightning bolt: one action, the unit this product is built out of.
const ActionsIcon = icon(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />)
// Nodes joined by lines: steps bound together, which is what a workflow is.
const WorkflowsIcon = icon(<>
  <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="12" r="3" />
  <path d="M8.6 7.4L15.4 10.6" /><path d="M8.6 16.6L15.4 13.4" />
</>)
// Stacked planes — a workspace is a container of work, and there are several.
const WorkspaceIcon = icon(<>
  <path d="M12 2l9 5-9 5-9-5z" />
  <path d="M3 12l9 5 9-5" />
  <path d="M3 17l9 5 9-5" />
</>)
// Leaving this company for another. Deliberately LAST: it is the item that
// takes you furthest out.
const SwitchIcon = icon(<>
  <path d="M16 3h5v5" /><path d="M21 3l-7 7" />
  <path d="M8 21H3v-5" /><path d="M3 21l7-7" />
</>)
// Reads the active company fresh on mount — Shell remounts on navigation
// between route branches, so this picks up a just-made selection without its
// own state or subscription.
function CompanyIndicator() {
  const company = getActiveCompany()
  return (
    <div className="nav-company-indicator">
      {company ? <span>{company.name}</span> : <span className="muted">No company selected</span>}
      <Link to={ROUTES.selectCompany()}>Switch</Link>
    </div>
  )
}

// Layout route: renders once per navigation into this branch and holds NO state
// of its own — NavPage (memoized, owns its own open/closed UI state) and
// <Outlet/> (the routed page) are fully independent siblings. Keep it that way:
// lifting page or nav state up into Shell would force the whole tree, nav
// included, to re-render on every unrelated change.
function Shell() {
  const navigate = useNavigate()
  const location = useLocation()

  // The drawer's own catalog — add a page here (the name must match a seeded
  // `menus` row, see @xeplr/workflow's migrations-auth/) and it appears automatically,
  // already role-filtered.
  //
  // HOME IS THE WORKSPACE, not the company list. The rail is for moving around
  // INSIDE a workspace; the two things that take you out of one are grouped
  // under Account at the bottom, in order of how far out they take you.
  //
  // The middle four are the things a workspace HAS. Reading them top-down
  // should explain the product: actions are the vocabulary, jobs are what runs
  // on its own, dashboards are what you look at.
  const drawerItems = useMemo(() => [
    { name: 'Home', icon: HomeIcon, clickHandler: () => navigate(ROUTES.workspace()) },
    { name: 'Dashboards', icon: DashboardsIcon, clickHandler: () => navigate(ROUTES.dashboards()) },
    { name: 'Jobs', icon: JobsIcon, clickHandler: () => navigate(ROUTES.jobs()) },
    { name: 'Actions', icon: ActionsIcon, clickHandler: () => navigate(ROUTES.actions()) },
    { name: 'Workflows', icon: WorkflowsIcon, clickHandler: () => navigate(ROUTES.workflows()) },
    // Two pickers, not one, because they are different distances away. Changing
    // workspace keeps you where you are; changing company reloads the whole
    // scope underneath you. Collapsing them into a single "Switch" would make
    // the smaller move as heavy as the larger one.
    { name: 'Select Workspace', icon: WorkspaceIcon, group: 'Account', clickHandler: () => navigate(ROUTES.selectWorkspace()) },
    { name: 'Select Company', icon: SwitchIcon, group: 'Account', clickHandler: () => navigate(ROUTES.selectCompany()) }
  ], [navigate])

  return (
    <div className="app">
      <NavPage
        navMiddle={<CompanyIndicator />}
        notifications={notifications}
        settingsOverrides={settingsOverrides}
        drawerItems={drawerItems}
      />
      {/* Around the routed page only, so a page that throws doesn't take the
          nav with it — you keep a way out that isn't the back button.

          Keyed on the path so navigating away clears a caught error: a boundary
          holds its fallback until its state resets, and without the key every
          later route would render the previous page's crash. */}
      <main className="main">
        <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* @xeplr/ui-account supplies every auth screen (including Profile and
          Change Password, via NavPage's settings menu). We hand it our Shell so
          signed-in pages render in our chrome. */}
      {authRoutes({}, { layout: <Shell /> })}

      <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
        <Route path={ROUTES.home()} element={<Navigate to={ROUTES.workspace()} replace />} />
        <Route path={ROUTES.workspace()} element={<WorkspaceHome />} />
        {/* Declared BEFORE the ?id= convention needs it — these are single
            paths today, and become list-or-record the same way the rest of the
            suite does, without the URL changing. */}
        <Route path={ROUTES.dashboards()} element={<Dashboards />} />
        <Route path={ROUTES.jobs()} element={<Jobs />} />
        <Route path={ROUTES.actions()} element={<ActionsPage />} />
        <Route path={ROUTES.selectWorkspace()} element={<SelectWorkspace />} />
        <Route path={ROUTES.selectCompany()} element={<SelectCompany />} />
        {/* This app is a CONSUMER of its own public API here, exactly like
            @xeplr/workflow's orchestration/standalone.js is of registerWorkflow() —
            see src/index.js's registerWorkflowUI() for why there's no
            config.app-style branch on the UI side. */}
        {registerWorkflowUI({}).routes}
      </Route>

      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  )
}
