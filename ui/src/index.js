import { workflowRoutes } from './lib/routes.jsx'
import { setRouteBase } from './routes.js'
import { configureWorkflowApi } from './api/workflows.js'
import { configureJobsApi } from './api/jobs.js'

/**
 * Register xeplr-workflow's pages into a host app.
 *
 * The backend has a real config.app-or-createApp branch (registerWorkflow in
 * @xeplr/workflow's index.js) because Express apps are built imperatively and
 * routes get bolted onto one. React doesn't work that way — composing a
 * subtree IS mounting it, there's nothing to "attach to" after the fact — so
 * there is no equivalent branch here. What differs between embedded and
 * standalone isn't how you call this function, it's who wraps the routes it
 * returns:
 *
 *   - EMBEDDED: a host renders them inside its OWN <BrowserRouter>,
 *     <AccessProvider>, and layout/auth gate.
 *   - STANDALONE: this package's own orchestration does exactly that — see
 *     src/main.jsx (BrowserRouter + AccessProvider, the only place ui/.env
 *     is read, via Vite's loadEnv in vite.config.js) and src/App.jsx, which
 *     calls registerWorkflowUI({}) itself at the marked insertion point.
 *     Running this app's own dev server is this package consuming its own
 *     public API, not a special case of it — the same relationship
 *     orchestration/standalone.js has with registerWorkflow() in @xeplr/workflow.
 *
 * Usage from a host app:
 *
 *   import { registerWorkflowUI } from '@xeplr/ui-workflow' // or a relative path
 *
 *   function App() {
 *     return (
 *       <Routes>
 *         {existingHostRoutes}
 *         {registerWorkflowUI({}).routes}
 *       </Routes>
 *     )
 *   }
 *
 * A host on its own domain still needs the workflow API reachable — point
 * its dev proxy / prod routing at wherever registerWorkflow() (backend) is
 * mounted, the same way this app's own vite.config.js does via API_URL.
 *
 * @param {object} [config]
 * @param {string} [config.jobsApiBase=''] - where @xeplr/jobs' router is
 *   mounted, from the browser's point of view. Read only, and only to list
 *   jobs for the "connect jobs" palette — this UI never triggers one. Separate
 *   from apiBase: they are different routers and a host commonly mounts them
 *   at different prefixes.
 * @param {string} [config.apiBase=''] - where registerWorkflow() mounted the
 *   API, from the browser's point of view. Empty standalone (the router sits
 *   at '/'); a host that mounted it at '/workflow' passes that, because a
 *   host cannot mount workflow at the root — it already serves its own
 *   /companies, /workspaces and /actions, all three of which workflow's
 *   router also serves.
 * @param {React.ComponentType} [config.listDesign] - custom Design for the
 *   workflow list page. Omit to use the built-in WorkflowListSample.
 * @param {React.ComponentType} [config.editorDesign] - custom Design for the
 *   workflow editor page. Omit to use the built-in WorkflowEditorSample.
 * @returns {{ routes: import('react').ReactElement[] }}
 */
export function registerWorkflowUI(config) {
  config = config || {}
  // Before the routes, not inside a component: the first request can fire from
  // a page's own mount effect, which is too late to be told where the API is.
  configureWorkflowApi(config.apiBase)
  // WHERE THE JOBS API IS, from the browser — only used to LIST jobs for the
  // "connect jobs" palette. A SEPARATE value from apiBase because they are
  // separate routers: BI serves workflow at /workflow and jobs at the API
  // root, so assuming one prefix covers both would ask workflow's router for
  // /workflow/jobs, which it does not serve.
  //
  // Defaults to '' — jobs mounted at the root, which is the standalone case.
  // A host that has no jobs API simply never creates a workflow of kind
  // 'jobs'.
  configureJobsApi(config.jobsApiBase)
  // TWO prefixes, because they are genuinely different strings for a host
  // whose URLs carry a tenant scope: `basePath` is the <Route> pattern these
  // pages are mounted at ('/:companyId/:workspaceId'), `linkBase` is what
  // this package's own links should say right now ('/acme/main'). A host with
  // static URLs passes one value, or neither.
  if (config.basePath !== undefined || config.linkBase !== undefined) {
    setRouteBase(config.linkBase !== undefined ? config.linkBase : config.basePath)
  }
  return { routes: workflowRoutes(config) }
}

export { workflowRoutes } from './lib/routes.jsx'
export { setRouteBase, getRouteBase, workflowPaths, ROUTES } from './routes.js'
export { WorkflowListPage, WorkflowEditorPage } from './pages.jsx'
// The designer as ONE component, for an app that has its own page to put it
// on and does not want a section mounted at URLs — see WorkflowDesigner.jsx.
export { WorkflowDesigner } from './WorkflowDesigner.jsx'
export { configureApiBase as configureWorkflowApiBase } from './api/base.js'
export { default as WorkflowListSample } from './designs/WorkflowListSample.jsx'
// The designer's own canvas. Exported so a host can pass it to the routed
// editor page, or wrap it, without reaching into designs/.
export { default as FlowCanvas } from './designs/FlowCanvas.jsx'
export { default as WorkflowEditorSample } from './designs/WorkflowEditorSample.jsx'
export { useWorkflowListController } from './useWorkflowListController.js'
export { useWorkflowEditorController } from './useWorkflowEditorController.js'
export { WORKFLOW_LIST_RULES, WORKFLOW_EDITOR_RULES } from './validateDesign.js'
// The Model half of the palette — pure, no React. A host writing its own
// canvas Design uses these to turn a palette item into a step rather than
// re-deriving the bindings a job step needs.
export { SOURCES, sourceFor, jobToStep, actionToStep, jobStepKey } from './stepSources.js'
// What the canvas's arrows DO to the document, and how a flow starts. Both
// are pure and tested on their own; a host writing its own designer builds on
// these rather than re-deriving step keys and the example → params contract.
export { keyFor, liveSteps, blankStep, addAfter, link, unlink, insertOn, rename, removeStep, edgesOf } from './flowEdits.js'
export { TRIGGERS, triggerFor, paramsFromSample, sampleFromParams, describeStart, startReferences } from './flowStart.js'
export { configureJobsApi } from './api/jobs.js'
export * from './api/workflows.js'
