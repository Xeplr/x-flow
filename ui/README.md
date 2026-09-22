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

## Drop it on a page

`registerWorkflowUI` gives a host the whole section — a list page, a URL per
workflow, links between them. An app that just wants **one designer on one of
its own pages** wants none of that, so there is a component that needs no
router above it:

```jsx
import { WorkflowDesigner } from '@xeplr/ui-workflow'

<WorkflowDesigner
  apiBase="/api/workflow"       // where the host mounted the workflow router
  workflowId={id}               // omit for a new one
  onOpened={(id) => setId(id)}  // a new workflow has just been saved and has an id
  onBack={() => close()}        // omit and there is no back link
/>
```

`onOpened` instead of `navigate`: the designer is not allowed to assume a
Router, so saving a new workflow hands the id back and the host decides
whether that is a URL, a tab or nothing at all.

## Addressing a flow

`workflowId` is a database id. `workflowKey` is the stable name the HOST gave
it (`workflows.key`), and it is what an app with readable URLs actually holds:

```jsx
// this app's URL is /configure/flows/pool
<WorkflowDesigner apiBase="/api/workflow" workflowKey={key} />
```

Passing a key as `workflowId` is a 404 that reads like a missing flow rather
than like a lookup by the wrong thing — which is exactly what happened before
`GET /workflows/by-key/:key` existed. A key link also survives a rebuild that
mints new ids, which is why `workflows.key` is there at all (migration 0013).

## The flow designer

`FlowCanvas` is what `WorkflowDesigner` renders, and it is built on one
rule: **the user should never have to remember anything.** Everything they can
use is in front of them, and everything they can do is on the thing they are
looking at.

So there is no "Add step" button anywhere. A box is born from the flow it
belongs to:

| To do this | You do this |
|---|---|
| Add the first step | the arrow under the Start bar |
| Add the next step | the arrow under the selected box |
| Put a step between two | the `+` on the arrow joining them |
| Join two boxes | drag the `?` handle from one onto the other |
| Start a separate fork | leave a box unlinked — it gets its own "Starts when" |

Clicking an arrow or a `+` asks the one question a new box has: **what is it**
— an **Action**, a **Screen** or a **Condition**. Name and type are the only
two things the box shows; everything else lives inside it.

**A Screen is a step, not a third kind of thing.** To the engine it is a
`wait` step on the `screen-show` action carrying one screen key, which is
exactly what a flow of screens is made of — so one designer draws both. It is
offered as a *type* rather than as an action because that is what it is to
somebody drawing a flow: "a screen comes next", not "run the screen-show
action". (`screen-show` stays out of the action list for the same reason —
picking it there would be picking the machinery.)

**Which screens exist is the host's answer**, and so is what each one hands
back. This engine carries a screen key and never resolves it, so only the app
that owns the forms can say:

```jsx
<WorkflowDesigner
  screens={[{ key: 'task_edit', name: 'Task', fields: [
    { name: 'title', type: 'text' }, { name: 'dueDate', type: 'date' }
  ] }]}
/>
```

`fields` is optional but it is the point. **A screen's output is not a guess**
— the person fills the form in and those values become the step's output — so
choosing the screen WRITES the step's sample output from its fields
(`outputOfScreen`), and the *Step's Output* tab lists them instead of asking
for them. Asking would be asking somebody to retype what the app already
knows, and to retype it again every time a field is added.

It is stored on the step rather than derived where it is needed, because the
pickers that read it (`referencesFor`) run where the screen list is not: a
later step's box, a condition, a run's history. The step carrying its own
answer is what makes "pick from an earlier step's output" work without every
one of those knowing what a screen is. Re-picking a screen re-derives it, so
switching forms does not leave the old one's fields behind.

`recordId` is added although no form declares it: the app writes the record to
its own table before resuming, and `POST /flows/runs/:id/submit` keeps that id
beside the submitted values.

Given no `fields`, the sample is typed like any other step's. Given no
`screens` at all, a Screen step asks for the key as text rather than offering
an empty menu — a designer that cannot be used because its host has not been
wired up yet is worse than one that asks you to know the key.

A Screen step has no *Inputs* tab: its one input is which screen, and that is
already the question on the front of the box.

**And the form is designed where it is used.** Pass `screenEditor` and the
Screen box grows *Edit* and *＋ New*; the designer opens your editor in a big
modal, over the flow:

```jsx
<WorkflowDesigner
  screens={screens}
  screenEditor={({ screenKey, onDone }) => (
    <MyFormBuilder screen={screenKey} onSaved={onDone} />   // screenKey null = make one
  )}
/>
```

Going to another page to add a field, then coming back to hope the step still
matches, is the switch this removes: the flow is what somebody is thinking
about, and the form is a detail of one step in it.

The designer owns the WINDOW and the host owns what is inside it, for the same
reason the screen list is the host's — this package knows a screen key and
nothing else about forms, and one that reached for `@xeplr/ui-factory` to draw
one would work only for the apps built on it.

`onDone({ key, name, fields })` closes the loop: the step takes that screen,
**and every other step showing the same one is brought up to date**
(`syncScreenOutputs`). Add a field to the Task form from inside a flow and
every step that shows Task hands it on, so every step after those can pick it
— without anybody reopening them. That is what deriving a screen's output
buys, and it is the reason it is not typed.

A host using `@xeplr/ui-factory` has the fields already —
`inputNodes(doc).map((n) => ({ name: n.id, type: n.type }))`, which is that
package's own answer to "which nodes hold a value", so a label or a stepper is
never offered as a field.

**A box opens into itself.** The moment a step has an action, the box grows a
panel below the name and type, and its tabs are what that action is asking
for, generated from its own `inputSchema` — the same declaration the server
validates against (`paramTabs` in `src/paramGroups.js`). Not a drawer: the drawer asked for the step key, the
kind, the error behaviour, the step inputs, the action, its parameters and its
transitions at once, and *what does this step do* was somewhere in the middle
of it.

Its type sizes are five variables on `.fc-wrap` (`--fc-name`, `--fc-form`,
`--fc-label`, `--fc-small`, `--fc-row`) rather than numbers spread through the
rules, so a host retunes the whole designer by overriding them — and the
table's type stays one notch under the step's name whoever changes their mind
about either.

It is laid out as a **table** — name on the left, value on the right, one line
each, hairline between, and a size smaller than the step's own name. A form
(label above box, eight times over) is three hundred pixels of box hanging
over the canvas, and it reads as *hard* before a word of it has been read. For
the same reason a field's description is its `title`, not a row of its own,
and a value's box appears only under the pointer or the caret.

Five things the panel does on purpose:

- **A default is shown, not stored.** `limit` sits there as grey `50` — what
  happens if you say nothing. The step stores nothing until you type over it,
  so an action that changes its default later changes this step too.
- **A field is parsed when you leave it**, not as you type: `connection` is an
  object and half-typed JSON is not one. A stored value comes back as text
  through `formatCellValue`, because React renders a real array into a
  textarea as `[object Object]` and saving writes that over the value.
- **A field that is no longer asked is no longer set.** Tick *use your own mail
  server*, fill it in, untick it — the connection goes, rather than lying in
  wait for the day somebody ticks the box again.
- **One tab per group, so the box never changes height.** `email-read`
  declares `Inputs`, `Filters` and `Output`; `db-move` adds `Write options`,
  `Advanced` and `Performance`. A collapsed group would have been an honest
  answer in a drawer, but this form sits ON the canvas — opening one grows the
  box, moves the arrow under it and shifts the whole flow below to make room
  for four filters nobody was looking at. A tab costs one line whatever is
  behind it. A dot on a shut tab means something of yours is in there, which
  is the only question a shut tab has to answer.
- **The last tab is the step's own output.** `Step's Output` holds an EXAMPLE
  of what this step hands on — nothing has run, and at design time nothing
  can have. Under it sit the tokens a later step will write
  (`{steps.fetch.output.total}`) with the example value beside each, so the
  bargain is visible: filling this in is what lets the next step offer `total`
  in a list instead of asking somebody to remember the word. That list is
  `referencesFor()` in `src/conditions.js`, and it is built from exactly this.
  A tab carries an `id` as well as a label for this reason — `email-read`
  declares a group of its own called `Output` (options *about* the output),
  and the two must not be confusable by the code whatever they end up called.
- **A tab can vanish under you.** `showWhen` decides what is asked, so a group
  whose every field is branched away is not a tab at all, and the panel falls
  back to the first tab rather than going blank.

The canvas is told how tall the open box turned out to be rather than guessing
from a field count — everything hanging off the box (the next-step arrow, the
`?`, every arrow drawn to it) is placed from that number, and a guess is wrong
the moment a label wraps.

**How the flow starts belongs to the flow, not to a step.** The gear beside
the flow's name opens *Starts when* (someone presses Start, another system
calls it, a schedule, a file arrives, an email arrives — stored on the
workflow's `trigger` column, migration `0014`) and *What comes in*, which is
written as an **example**, because that is how anyone has it to hand — a
response pasted from the system that will call us.

The example is read into `params`, which is the contract the engine enforces.
An example never becomes a **default** and never becomes **required**: `E-1042`
is what the field looks like, not what should be sent when nobody sends
anything, and quietly running a real flow against sample data is exactly the
kind of help nobody wants. See `src/flowStart.js`.

What each interaction does to the workflow document is in `src/flowEdits.js` —
pure, and tested on its own, so the canvas file is only what it looks like.

The **routed** editor page (`<base>/workflows/edit`) still renders
`WorkflowCanvasSample`, which has the step drawer, runs and history that
`FlowCanvas` is still growing. Both edit the same document through the same
controller; pass `design={FlowCanvas}` to the page to switch early.

**Controls inside a box.** The canvas takes a press by cancelling its default,
and for a field that default is the focus — so the box's name input and its
action picker stop the press themselves (`keepPress`), and `@xeplr/ui-canvas`
leaves controls alone by itself from 1.0.3 (`NOT_A_DRAG`). Either one is
enough; both are there so the designer also works on a host with an older
canvas installed.

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
│  ├─ WorkflowDesigner.jsx          the designer as ONE component — no Router needed
│  ├─ flowEdits.js                  what the canvas's arrows do to the document (pure)
│  ├─ flowStart.js                  how a flow starts + the example → params it enforces
│  ├─ stepSources.js                palette sources: action → step, job → job-run step
│  ├─ conditions.js                 transition formula ⇄ @xeplr/expression-handler node
│                                  (both directions are the engine's: parse / toText)
│  ├─ paramGroups.js                step form layout (showWhen, group), run-param declarations
│  ├─ api/                          base.js, workflows.js, actions.js, jobs.js, companies.js, workspaces.js
│  ├─ designs/                      WorkflowListSample, FlowCanvas (default designer),
│  │                                WorkflowCanvasSample, WorkflowEditorSample (form editor),
│  │                                workflow.css, workflowCanvas.css, flowCanvas.css
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
| `WorkflowDesigner` | component | The designer on its own page — no Router, no route base |
| `WorkflowListSample`, `FlowCanvas`, `WorkflowCanvasSample`, `WorkflowEditorSample` | components | Built-in Designs. `FlowCanvas` is what `WorkflowDesigner` renders |
| `TRIGGERS`, `triggerFor`, `paramsFromSample`, `sampleFromParams`, `describeStart`, `startReferences` | model | How a flow starts and what comes in with it |
| `blankStep`, `addAfter`, `insertOn`, `link`, `unlink`, `rename`, `removeStep`, `edgesOf`, `liveSteps` | model | The canvas's edits to the document |
| `useWorkflowListController`, `useWorkflowEditorController` | hooks | For a custom Design |
| `WORKFLOW_LIST_RULES`, `WORKFLOW_EDITOR_RULES` | rules | Checked by `useDesignValidator` from `@xeplr/ui-account` |
| `SOURCES`, `sourceFor`, `jobToStep`, `actionToStep`, `jobStepKey` | model | Turn a palette item into a step |
| `configureJobsApi` | function | Set the jobs API base |
| everything in `api/workflows.js` | functions | `configureWorkflowApi`, `listWorkflows`, `getWorkflow`, `saveWorkflow`, `deleteWorkflow`, `runWorkflow`, `lastStepOutput`, `tryStep` |

Design validation rules:

| Page | Required in the Design |
|---|---|
| List | `#wf-new-name` input; `form button[type="submit"]` |
| Editor | `#wf-editor-name` input; `[data-role="save-workflow"]` |

The editor rule used to require `[data-role="add-step"]` as well. It was
dropped when the designer stopped having an Add button: a rule that forces
every design to render a control the default design deliberately does not have
is a rule enforcing last year's screen.

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
