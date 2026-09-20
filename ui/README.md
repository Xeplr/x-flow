# @xeplr/ui-workflow

**The screens for [`@xeplr/workflow`](https://www.npmjs.com/package/@xeplr/workflow).** The workflow list, the step builder canvas (drawn on [`@xeplr/ui-canvas`](https://www.npmjs.com/package/@xeplr/ui-canvas)), the step drawer, and the pure logic behind them — conditions compiled with the same expression handler the engine runs, and each step's form drawn from its action's own input schema.

It is both a **library** and a **standalone app**. As a library, a host calls `registerWorkflowUI()` and renders the returned `<Route>`s inside its own router, auth gate and layout — Xeplr BI does this, so workflow pages render inside BI's shell with BI's token and active company/workspace. As an app, `npm run dev` wraps the same routes in this package's own shell (`src/main.jsx`, `src/App.jsx`).

## Install

```sh
npm i @xeplr/ui-workflow @xeplr/ui-account @xeplr/ui-canvas @xeplr/ui-utils react react-dom react-router-dom
```

MIT. React, the router and the `@xeplr/ui-*` libraries are peers — the host's own copies — so there is one React and one sign-in state.

This package is the `ui/` folder of [`Xeplr/x-flow`](https://github.com/Xeplr/x-flow), beside `@xeplr/workflow` at the root. It installs, tests and releases on its own (tags `ui-workflow-v<version>`).

## Run it

```bash
npm install
npm run dev        # vite — UI_PORT from .env (19120)
npm run build      # vite build → dist/
npm run preview    # serve dist/ on UI_PORT
npm test           # node test/run.mjs
```

Needs the workflow API running (`@xeplr/workflow` — `npm run start-api` there)
and an auth server. Copy `.env.example` to `.env` first. The standalone app signs in through `@xeplr/ui-account`; `/auth/api`
is proxied to `AUTH_URL`.

### `.env` (read by `vite.config.js` via `loadEnv`)

`.env` is git-ignored (`*.env` in the repo `.gitignore`); create it locally.
These are dev-server settings only — nothing is inlined into the bundle.

| Variable | Meaning | Local value in `.env` |
|---|---|---|
| `UI_PORT` | Dev and preview server port (`strictPort`) | 19120 |
| `AUTH_URL` | Proxy target for `/auth/api` | xeplr-bi's auth server, `:19101` (the `.env` comment says workflow no longer runs its own) |
| `API_URL` | Proxy target for the workflow API paths and `/events` | the workflow API, `:19122` |

All three are required; `vite.config.js` throws if any is missing. There are no
port fallbacks.

Proxied API prefixes (`API_PATHS` in `vite.config.js`): `/me`, `/companies`,
`/workspaces`, `/actions`, `/workflows`, `/workflow-runs`, `/public`, plus
`/events` (SSE, with `cache-control: no-cache, no-transform`).
A path missing from this list falls through to `index.html` in dev and fails as
`Unexpected token '<'` — add new backend prefixes here.

## Embedding

```jsx
import { registerWorkflowUI } from '@xeplr/ui-workflow'

<Routes>
  {hostRoutes}
  {registerWorkflowUI({
    apiBase: '/workflow',               // where the host mounted registerWorkflow()'s router
    basePath: '/:companyId/:workspaceId', // <Route> pattern
    linkBase: () => currentScopePrefix(), // what links should say now; a function if it changes
    jobsApiBase: ''                     // where @xeplr/jobs' router is mounted (jobs palette only)
  }).routes}
</Routes>
```

| Option | Default | Meaning |
|---|---|---|
| `apiBase` | `''` | Browser path prefix of the workflow API. Applied to **every** `api/*` module (`src/api/base.js`) |
| `jobsApiBase` | `''` | Browser path prefix of the jobs API. Separate router, separate prefix. Read-only use: list jobs for the palette |
| `basePath` | route base | `<Route path>` prefix (may contain params) |
| `linkBase` | `basePath` | Prefix for this package's own links; string or function |
| `listDesign` | `WorkflowListSample` | Replacement Design for the list page |
| `editorDesign` | `WorkflowCanvasSample` | Replacement Design for the editor page |

`registerWorkflowUI` sets the API bases **before** returning routes, because a
page's first request can fire from its mount effect. It returns
`{ routes: [<Route workflows>, <Route workflows/edit>] }`.

The host must also:
- register the same MT levels (`l1: companyId / x-company-id`,
  `l2: workspaceId / x-workspace-id`) with `@xeplr/ui-account`;
- route `apiBase` to the backend (dev proxy or production routing);
- not mount the backend router at `/` — it serves `/companies`, `/workspaces`
  and `/actions`, which a host already serves.

Xeplr BI also lists `@xeplr/ui-workflow` in its Vite `optimizeDeps.exclude`.

## Structure

MVC split per the workspace UI rules: Model = pure `src/*.js`, Controller =
`src/use*Controller.js`, View = `src/designs/*`, Pages = `src/pages.jsx`.

```
ui/
├─ vite.config.js                   env, proxy, dedupe, CJS handling for linked @xeplr/*
├─ index.html                       standalone mount (#root)
├─ src/
│  ├─ index.js                      PUBLIC API — registerWorkflowUI and re-exports
│  ├─ main.jsx                      standalone only: configure(''), registerMTs, BrowserRouter, AccessProvider
│  ├─ App.jsx                       standalone only: Shell (NavPage rail) + routes
│  ├─ index.css                     standalone only: tokens, --xeplr-* aliases
│  ├─ lib/routes.jsx                workflowRoutes(config) → <Route> elements
│  ├─ routes.js                     URL builders (ROUTES, withId, setRouteBase, useRouteId, useRouteKind)
│  ├─ pages.jsx                     WorkflowListPage, WorkflowEditorPage
│  ├─ useWorkflowListController.js  list state: rows, handleCreate, handleDelete, reload
│  ├─ useWorkflowEditorController.js editor state, palette, save, run
│  ├─ validateDesign.js             required elements a custom Design must render
│  ├─ stepSources.js                palette sources: action → step, job → job-run step
│  ├─ conditions.js                 transition formula ⇄ @xeplr/expression-handler node
│                                  (both directions are the engine's: parse / toText)
│  ├─ paramGroups.js                step form layout (showWhen, group), run-param declarations
│  ├─ api/                          base.js, workflows.js, actions.js, jobs.js, companies.js, workspaces.js
│  ├─ designs/                      WorkflowListSample, WorkflowCanvasSample (default editor),
│  │                                WorkflowEditorSample (form editor), workflow.css, workflowCanvas.css
│  ├─ pages/                        standalone-app pages (see below)
│  └─ components/ErrorBoundary.jsx
└─ test/                            run.mjs + *.test.mjs
```

## API

### Exports (`src/index.js`)

| Export | Kind | Purpose |
|---|---|---|
| `registerWorkflowUI(config)` | function | Configure API bases and route base; return `{ routes }` |
| `workflowRoutes(config)` | function | The `<Route>` elements alone, no configuration side effects |
| `setRouteBase`, `getRouteBase`, `workflowPaths`, `ROUTES` | routing | Link base and URL builders |
| `WorkflowListPage`, `WorkflowEditorPage` | components | Controller + Design + design validator. Both take `design`; editor takes `workflowId`, `newKind` |
| `WorkflowListSample`, `WorkflowEditorSample` | components | Built-in Designs |
| `useWorkflowListController`, `useWorkflowEditorController` | hooks | For a custom Design |
| `WORKFLOW_LIST_RULES`, `WORKFLOW_EDITOR_RULES` | rules | Checked by `useDesignValidator` from `@xeplr/ui-account` |
| `SOURCES`, `sourceFor`, `jobToStep`, `actionToStep`, `jobStepKey` | model | Turn a palette item into a step |
| `configureJobsApi` | function | Set the jobs API base |
| everything in `api/workflows.js` | functions | `configureWorkflowApi`, `listWorkflows`, `getWorkflow`, `saveWorkflow`, `deleteWorkflow`, `runWorkflow`, `lastStepOutput`, `tryStep` |

Design validation rules:

| Page | Required in the Design |
|---|---|
| List | `#wf-new-name` input; `form button[type="submit"]` |
| Editor | `#wf-editor-name` input; `[data-role="add-step"]`; `[data-role="save-workflow"]` |

### Routes

| Path | Page | Where |
|---|---|---|
| `<base>/workflows` | `WorkflowListPage` | library (host + standalone) |
| `<base>/workflows/edit` | `WorkflowEditorPage`, new workflow | library |
| `<base>/workflows/edit?id=<id>` | `WorkflowEditorPage`, that workflow | library |
| `<base>/workflows/edit?kind=jobs` | new workflow on the jobs palette (`ROUTES.connectJobs()`) | library |
| `/workspace` | `WorkspaceHome` | standalone only |
| `/workspace/dashboards` | `Dashboards` — placeholder | standalone only |
| `/workspace/jobs` (`<base>/jobs`) | `Jobs` — placeholder with a "Connect jobs" link | standalone only |
| `/workspace/actions` | `Actions` — read-only action catalog | standalone only |
| `/workspace/select` | `SelectWorkspace` | standalone only |
| `/select-company` | `SelectCompany` | standalone only |
| `/auth/*` | `@xeplr/ui-account` `authRoutes` | standalone only |

`<base>` is `/workspace` standalone, or whatever `linkBase`/`basePath` the host set.

### Backend calls

| Function | Request |
|---|---|
| `listWorkflows()` | `GET /workflows?limit=0` |
| `getWorkflow(id)` | `GET /workflows/:id` |
| `saveWorkflow(workflow)` | `POST /workflows/save` with `[workflow]` (steps nested) |
| `deleteWorkflow(id)` | `POST /workflows/delete` with `{ ids: [id] }` |
| `runWorkflow(id, params)` | `POST /workflows/:id/run` — returned run status is the real outcome of that burst |
| `lastStepOutput(id, stepKey)` | `GET /workflows/:id/steps/:stepKey/last-output` |
| `tryStep(id, { actionName, stepKey, values, params })` | `POST /workflows/:id/steps/try` — **executes the action** |
| `listActions()` | `GET /actions` |
| `listCompanies()`, company save | `GET /companies?limit=0`, `POST /companies/save` |
| `listWorkspaces()`, `createWorkspace()` | `GET /workspaces?limit=0`, `POST /workspaces/save` |
| `listJobs()` | `GET <jobsApiBase>/jobs?limit=0` |

All go through `authFetch` from `@xeplr/ui-account` (Bearer token + tenant
headers).

## Rules the code enforces, and why

| Rule | Why (from the code comments) |
|---|---|
| A record is addressed by `?id=`; a mode gets a path segment (`/edit`) | Every state worth returning to has a URL: back works, refresh keeps you in place, edit links can be shared |
| `?kind=` only applies to a **new** workflow; `kind` is fixed at creation | A query string must not repaint the palette around steps it cannot describe; a half-converted workflow is worse than a new one |
| Company picker lives outside `/workspace`, workspace picker inside | Without a company every workspace-scoped route 403s, so the company picker must be reachable when nothing inside is |
| One `apiBase` shared by every `api/*` module | Previously only `workflows.js` used it, so an embedded host sent `/actions`, `/companies`, `/workspaces` to its own root routes |
| `jobsApiBase` is separate from `apiBase` | Different routers; BI serves workflow at `/workflow` and jobs at its API root |
| This UI only lists jobs, never triggers one | A job step is started by the engine server-side; a browser trigger would bypass run bookkeeping |
| A job step is `job-run`, `kind: 'wait'`, `onError: 'stop'`, with `jobsUrl: '{env.JOBS_API_URL}'` and `callbackUrl: '{resumeUrl}'` left as template strings | Both are resolved by the engine at run time; a browser-filled hostname works in one deployment only. A failed job must stop the chain |
| Blank name on a jobs canvas is auto-derived from steps (`A → B → C`); a typed name is never replaced | The steps already describe the connection |
| Transition conditions are compiled with `@xeplr/expression-handler`, the engine's own evaluator | One definition of what a condition means; a second parser would drift and fail at run time |
| A stored condition is written back to text by the engine (`xf.toText`), not by a local table of operators | The local table knew six infix operators, so a condition using a function, `contains` or `between` was handed back as raw JSON to edit by hand. A condition stored in the pre-2.0 shape now reads back as text, and saving it normalises it to the current language |
| `showWhen` and `group` are layout only | The server validates every declared field regardless of which sections were open |
| "Try step" confirms inline, naming the action | It runs the action for real and is not reversible |
| `stepSources.js`, `conditions.js`, `paramGroups.js` import no React or `api/*` | Keeps them loadable by plain `node` tests |
| `registerMTs` in `main.jsx` must match the backend's levels and headers | A mismatched header reads as "not authorized", not as a typo |
| Vite `dedupe` of react, react-dom, react-router-dom, @tanstack/react-table, @xeplr/ui-canvas | Linked `@xeplr/*` packages have their own `node_modules`; duplicate React breaks hooks |
| `optimizeDeps.force: true`, `include: ['@xeplr/expression-handler']`; `build.commonjsOptions.include` for linked packages | Vite's cache does not invalidate on linked-package edits; linked CommonJS is otherwise not converted in dev or build |
| Placeholder pages say they are placeholders | A dead link or an empty list looks like a broken feature |

## Tests

```bash
npm test                              # node test/run.mjs — each *.test.mjs in its own process
node test/conditions.test.mjs         # one suite on its own
```

Plain scripts, no framework, no DOM, no server. They need `npm install`
(`@xeplr/expression-handler` is imported by `conditions.js`).

| Suite | Covers |
|---|---|
| `conditions.test.mjs` | Compiled formula evaluates correctly in the real expression handler; blank is the catch-all; broken conditions fail at build time; text round-trips; reference paths offer only earlier steps; conditions bind raw paths, not `{braced}` values; run params are pickable |
| `paramGroups.test.mjs` | `visibleWhen`/`hasValue` edge cases; declared params become tokens; union across steps; no-op declarations refused; array cell input; open-and-save preserves values |
| `routes.test.mjs` | Existing pages; scope picker levels; `withId` convention; id encoding; no empty query; connect-jobs link |
| `paramLayout.test.mjs` | `paramGroups.layoutParams` against the REAL shipped `@xeplr/actions` schemas — `@xeplr/actions` and the peers it loads with are dev dependencies, for this test only |
| `stepSources.test.mjs` | `jobStepKey`, `jobToStep` bindings, `actionToStep`, `sourceFor`, `autoNameFromSteps` |

No tests cover the controllers, Designs or pages.
