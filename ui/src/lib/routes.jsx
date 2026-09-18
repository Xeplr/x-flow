import { Route } from 'react-router-dom'
import { workflowPaths, useRouteId, useRouteKind } from '../routes.js'
import { WorkflowListPage, WorkflowEditorPage } from '../pages.jsx'

// Pure route composition. React has no imperative "mount onto an app" call
// the way Express does — a subtree IS the mount — so this never touches the
// DOM and never creates a router of its own. It just returns <Route>
// elements for a HOST app to render inside whatever <Routes> tree, auth
// gate, and layout it already owns. This is exactly the shape
// @xeplr/ui-account's authRoutes() already uses; see index.js's
// registerWorkflowUI(), which is the public name for this.
export function workflowRoutes(config) {
  config = config || {}
  // The PATTERN, which is not the same string as a link: a host whose URLs
  // carry a tenant scope mounts these under '/:companyId/:workspaceId' while
  // its links read '/acme/main'. Defaults to wherever links point, which is
  // what standalone wants.
  const paths = workflowPaths(config.basePath)
  return [
    <Route key="workflows-list" path={paths.workflows} element={<WorkflowListPage design={config.listDesign} />} />,
    <Route key="workflows-editor" path={paths.workflowEditor} element={<WorkflowEditorRoute design={config.editorDesign} />} />
  ]
}

// Reads ?id= itself — the suite's list/record convention (see routes.js) —
// so a host app only needs to know where to mount workflow's routes, not
// what URL shape it uses internally.
function WorkflowEditorRoute({ design }) {
  var id = useRouteId()
  // Only meaningful for a NEW workflow — see useRouteKind. A saved one carries
  // its kind on the row, and the controller ignores this when an id is present.
  var kind = useRouteKind()
  return <WorkflowEditorPage workflowId={id} newKind={kind} design={design} />
}
