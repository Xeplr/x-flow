import { useSearchParams } from 'react-router-dom'

// Every URL in this app is built from here, so the convention lives in one file
// rather than in scattered template literals that drift apart.
//
// THE CONVENTION, same as the rest of the suite: a record is addressed by
// `?id=`, never by a path segment. The list and the record therefore share one
// path — /workspace/things is the list, /workspace/things?id=abc is that thing
// — and a MODE gets its own path segment (/workspace/things/edit?id=abc).
//
// The point is that every state worth returning to has a URL. When edit mode is
// internal state instead, the back button does nothing, a refresh drops you
// back to view, and an edit link cannot be shared.
//
// The workflow document uses the MODE-segment form (see workflowEditor
// below): there is no separate "view" for a workflow, only edit, so it never
// reuses the list's own path the way dashboards/jobs do.

// WHERE A HOST MOUNTED THESE PAGES.
//
// Standalone, workflow serves its own '/workspace/...'. Embedded, the host
// decides — xeplr-bi now carries the tenant scope in the URL, so its links
// look like /acme/main/workflows and change as the user switches workspace.
//
// A module-level base rather than an argument on every builder: the links
// below are called from five places across this package's own pages, and
// threading a prefix through all of them would put the host's URL shape into
// screens that should not know it exists.
let _base = '/workspace'

/**
 * Set by registerWorkflowUI() from the host's `linkBase`.
 *
 * Accepts a FUNCTION as well as a string, and a host whose prefix changes
 * should pass one. registerWorkflowUI runs when the host renders its route
 * tree — which, for a host that does not itself subscribe to the location, is
 * once — so a string captured there would freeze at whatever the prefix was
 * then and every link would point at the workspace the user opened first.
 */
export function setRouteBase(base) {
  _base = base === undefined || base === null ? '/workspace' : base
}

export function getRouteBase() {
  return typeof _base === 'function' ? (_base() || '') : _base
}

/**
 * The same two paths as <Route path> patterns. A host mounting these inside a
 * parameterised prefix passes that pattern, which is NOT what its links look
 * like — hence a separate call from the builders below.
 */
export function workflowPaths(base) {
  const b = base === undefined || base === null ? getRouteBase() : base
  return {
    workflows: b + '/workflows',
    workflowEditor: b + '/workflows/edit'
  }
}

function withId(path, id) {
  return id ? `${path}?id=${encodeURIComponent(id)}` : path
}

export const ROUTES = {
  home: () => '/',
  workspace: () => '/workspace',

  // The two SCOPE pickers, and they sit at different levels on purpose.
  //
  // Choosing a company is what you do before anything works — the l1 header
  // comes from it, and without one every workspace-scoped route 403s — so it
  // lives outside /workspace, where it is still reachable when nothing inside
  // is. Choosing a workspace happens once you are already in a company, so it
  // lives inside.
  selectCompany: () => '/select-company',
  selectWorkspace: () => '/workspace/select',

  // A list and a record share one path — see withId. No id is the list.
  dashboards: (id) => withId('/workspace/dashboards', id),

  // THE HOST'S BASE, not a hardcoded '/workspace'.
  //
  // This is now linked TO — the jobs canvas's back link goes here — from a
  // page that can be running inside a host whose URLs carry a tenant scope.
  // Hardcoded, that back link read /workspace/jobs in an app serving
  // /acme/main/jobs, which is a 404 at the end of a flow somebody has just
  // finished. Standalone the base defaults to '/workspace', so this is the
  // same string it always was.
  jobs: (id) => withId(getRouteBase() + '/jobs', id),

  // The catalog of registered actions — reference, not a document you edit.
  actions: () => '/workspace/actions',

  // The workflow document. A plain list (no id ever) plus one edit mode with
  // its own path segment, per the convention above — /edit with no ?id= is
  // "create new", /edit?id=X is that workflow.
  workflows: () => getRouteBase() + '/workflows',
  workflowEditor: (id) => withId(getRouteBase() + '/workflows/edit', id),

  // CONNECTING JOBS — the same editor, opened on an empty JOBS canvas.
  //
  // Not a second page and not a second route: it is workflowEditor() with no
  // id (so "create new", exactly as before) plus the one thing the editor
  // cannot infer for a workflow that does not exist yet — which palette to
  // offer. Save creates the workflow, kind and all.
  //
  // This is what the Jobs screen's "Connect jobs" link points at, and it is
  // the reason the link can be a plain href with nothing behind it: no
  // workflow has to be created before somebody has drawn anything.
  connectJobs: () => getRouteBase() + '/workflows/edit?kind=jobs'
}

// Exported so the routes added next are built the same way rather than by hand.
export { withId }

/** The `?id=` of whatever record this page is showing, or null for a list. */
export function useRouteId() {
  const [params] = useSearchParams()
  return params.get('id')
}

/**
 * The `?kind=` a NEW workflow should be created as — 'jobs' from the Connect
 * jobs link, null otherwise.
 *
 * Only consulted when there is no id. An existing workflow's kind is a column
 * on the row, and a query string must never be able to override it: a URL
 * saying `?kind=jobs` on a workflow built from actions would repaint the
 * palette around steps it cannot describe, and every link anybody had shared
 * would be a way to do that by accident.
 */
export function useRouteKind() {
  const [params] = useSearchParams()
  return params.get('kind')
}
