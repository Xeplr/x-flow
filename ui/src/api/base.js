// WHERE THE WORKFLOW API IS MOUNTED, from this app's point of view.
//
// Empty standalone: @xeplr/workflow's orchestration/standalone.js mounts the router at
// '/', so `/workflows` is the real path. A HOST app cannot do that — it
// already serves its own /companies, /workspaces and /actions, and workflow's
// router serves all three — so it mounts at a prefix and tells the UI what it
// chose. See registerWorkflowUI's `apiBase`.
//
// SHARED BY EVERY api/* MODULE, which is the whole reason this is its own file
// rather than module state inside workflows.js. It was there, and only
// workflows.js used it — so an embedded host correctly fetched
// /workflow/workflows while the very same UI asked for /actions, /companies
// and /workspaces at the ROOT, hitting whatever the host happened to serve
// there instead of workflow's own router. Those paths collide by definition:
// a host mounts workflow at a prefix precisely BECAUSE it serves all three
// itself.
//
// Module state rather than a parameter threaded through every call, matching
// @xeplr/ui-account's own configure(): the mount path is a property of the
// deployment, decided once, not of any individual request.

let apiBase = ''

export function configureApiBase(base) {
  // Trailing slash trimmed so a caller passing '/workflow/' cannot produce
  // '/workflow//workflows', which some proxies treat as a different path.
  apiBase = (base || '').replace(/\/+$/, '')
}

/** Prefix a workflow API path with wherever the router was mounted. */
export function apiPath(path) {
  return apiBase + path
}
