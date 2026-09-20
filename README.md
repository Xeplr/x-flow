# @xeplr/workflow

**Workflows over [`@xeplr/actions`](https://www.npmjs.com/package/@xeplr/actions).** A workflow is a sequence of steps. Each step names a registered action, binds its inputs to what earlier steps produced, and routes to the next — branching on conditions, fanning out over lists, and waiting for a person or a job before it carries on. This package is the workflow document (a workflow and its steps), the engine that runs it, and the HTTP router the builder talks to. The screens are [`@xeplr/ui-workflow`](https://www.npmjs.com/package/@xeplr/ui-workflow).

It runs two ways: **embedded**, where a host calls `registerWorkflow()` and mounts the returned router (Xeplr BI does this at `/workflow`, with its own auth and its own `DB_WORKFLOW` database), or **standalone** via `npm run start-api` / the `xeplr-workflow-server` command, which is the same `registerWorkflow()` call with its settings read from `development.env`.

| what | how |
|---|---|
| A step is an action | Each step names an action registered in `@xeplr/actions`; its form comes from that action's own input schema (`GET /actions`), not a second description of it. Inputs bind to earlier steps' output, the run's parameters, or a setting on an allowlist. |
| Branch, fan out, join | Conditions are compiled with the same `@xeplr/expression-handler` the engine runs — since 2.0 that means the full formula language, with `and` / `or` and functions, and the same engine BI computes report formulas with. An *each* transition starts one child run per item, and a join step picks the parent back up once every child has finished. |
| Wait for a person or a job | A wait step parks the run and issues a single-use resume link — followed from an email or called back by a job — that cannot be claimed until the step is actually waiting. |
| Screens as steps (flows) | An app's forms, one after another, with arrows that test one field — the `/flows` facade (`lib/flows.js`). |
| Parameters checked first | A run's parameters are the union of what every step declares, validated before the run is recorded. |

What it does not do yet: a step's timeout is saved but not enforced; a draft workflow can still be run; past runs are recorded but there is no screen to browse them.

## Install

```sh
npm i @xeplr/workflow express
```

MIT. Its dependencies are the other `@xeplr/*` packages it builds on — actions, auth, base-apis, db, email, expression-handler, schema-handler, utils.

**One repo, two packages.** [`Xeplr/x-flow`](https://github.com/Xeplr/x-flow) holds this package at its root and `@xeplr/ui-workflow` in [`ui/`](ui). Each is installed, tested and released on its own: CI runs once per folder, and a push releases only the package whose files changed — tags `workflow-v<version>` here, `ui-workflow-v<version>` for the screens (the `xeplr` field in each `package.json`).

## Run it

### Standalone

```bash
npm install
npm run check-env      # fails naming any missing required var
npm run db:create      # creates the DB_API database
npm run start-api      # NODE_ENV=development node ./bin/www — listens on WORKFLOW_PORT
```

`start-api` runs this package's migrations on boot, so `migrate:up` is only
needed to migrate without starting the server.

| Script | What it does |
|---|---|
| `start-api` | `NODE_ENV=development node ./bin/www` → `orchestration/standalone.js` |
| `check-env` | `xeplr-check-env` against `development.env` |
| `db:create` | `xeplr-migrate create-db` for connection `api` (`WORKFLOW_CONNECTION`) |
| `migrate:up` / `migrate:status` | `xeplr-migrate` over `./migrations` |
| `db:encrypt` | `xeplr-db-encrypt` — produce an encrypted connection string |
| `test` | `node test/run.mjs` |

Port in `development.env`: **19122** (`WORKFLOW_PORT`). No port literal exists
in code; a missing `WORKFLOW_PORT` stops the process at `checkEnv`.

Required services for standalone:

| Service | Why |
|---|---|
| PostgreSQL | `DB_API` (this package's tables), `XCFG_DB_NAME` (shared `xeplr_configs`), `EMAIL_DB_NAME` (template store) |
| An `@xeplr/auth` server + its database | `@xeplr/auth` `attach()` reads users/tenant grants from `AUTH_DB_NAME`; the createApp gate validates tokens against `AUTH_URL`. This package has **no** `start-auth` script — the auth server is run separately (`xeplr-auth-server`), and it applies `migrations-auth/` via `XEPLR_AUTH_MIGRATIONS` |

Boot order (`orchestration/standalone.js`): load `<NODE_ENV>.env` → `checkEnv`
→ `registerApplication(WORKFLOW_APPLICATION_ID || 'xeplr-workflow')` → run
migrations → `xeplr_configs` ready (**fail-fast**) → register action catalog →
`@xeplr/auth` attach + email config → email templates (**best-effort**) →
`registerWorkflow({ port, mountPath: '/', auth: { publicPaths: ['/public/', '/events'] }, ... })`.

### Embedded (how Xeplr BI does it)

```js
// host env.required.js
...require('@xeplr/workflow').embedRequiredEnv,   // ['DB_WORKFLOW']

// host startup, after the host's own registerApplication() and registerMTs()
var { registerWorkflow } = require('@xeplr/workflow');
var { router } = await registerWorkflow({
  db: { name: process.env.DB_WORKFLOW, connection: hostConnection, connectionName: 'workflow' },
  mtMembershipGate: hostGate,
  authMiddleware: require('@xeplr/auth').authMiddleware
});
routes['/workflow'] = router;   // into createApp's route map, not app.use() afterwards
```

Embedded, `registerWorkflow` creates the database if missing, runs this
package's migrations (plus `XEPLR_WORKFLOW_MIGRATIONS` or `config.migrations`),
tries `xeplr_configs` (warns and continues on failure), registers the action
catalog, and returns the router.

### Embedded in the host's own database (how an `@xeplr/cli` app does it)

Workflow does not need a database of its own. An app can keep everything in
one:

```js
var { flowsRouter } = await registerWorkflow({
  applicationId: 'myapp1',
  db: { name: process.env.DB_API, connection: appConnection, migrationsTable: 'workflow_migrations' },
  tenantTables: false,        // the app's tenants are the tenants — see below
  access: true,               // each flows route checks the caller's permissions
  mtMembershipGate: appMemberGate
});
routes['/api/flows'] = flowsRouter;
```

| option | why |
|---|---|
| `db.migrationsTable` | Workflow's own record of which migrations ran. Both it and the host use `@xeplr/db`'s migrator, and one shared ledger would mix the two histories by filename. |
| `tenantTables: false` | `companies` and `workspaces` are **standalone** workflow's own tenant lists — the lists behind its "pick a company, then a workspace" screens (`migrations-tenants/`). Nothing in a workflow, step or run references them; runs carry `mtId1` / `mtId2` as plain ids. Embedded, the host's tenancy is used instead — its levels, its tables, its picker — or none at all. Leaving them out is also what lets workflow live in a database that already has a `companies` table. |
| `access: true` | The flows routes answer only a caller whose permissions (`req.access.apis`) name them — `List flows`, `Start flow run`… (`migrations-auth/0004_flows_access.sql`), the same way `@xeplr/factory` checks its routes. Off by default, as before. |

**Tenancy follows the host.** Embedded, workflow registers no tenancy levels of
its own; its tables are filtered by whatever the host registered with
`@xeplr/db`'s `registerMTs` — none, one level, or several. Only standalone mode
declares company → workspace (`orchestration/standalone.js`).

### Environment

Names and meaning only. Values live in `development.env` — copy
`development.env.example`, which has every name and no values. It is
git-ignored (`.gitignore`) because it carries secrets. Never commit it.

**Standalone — `env.required.js` (checked at boot):**

| Variable | Meaning | Comes from |
|---|---|---|
| `AUTH_URL` | Auth server the createApp gate validates tokens against | `@xeplr/base-apis` `gateRequiredEnv` |
| `ENCRYPTION_KEY`, `AUTH_JWT_SECRET`, `AUTH_PORT`, `AUTH_DB_NAME`, `XEPLR_AUTH_MIGRATIONS` | Decrypts stored connection strings; auth DB and token settings | `@xeplr/auth` `requiredEnv` (the inline comment in `env.required.js` lists older names) |
| `EMAIL_PROVIDER`, `BREVO_*` | Outbound mail provider | `@xeplr/email` `requiredEnv` |
| `EMAIL_DB_NAME` | This app's own email template store | `@xeplr/email` `templatesRequiredEnv` |
| `XCFG_DB_NAME`, `XCFG_DB_CONNECTION_INFO_ENCRYPTED` | Shared `xeplr_configs` control-plane DB | `@xeplr/actions` `configRequiredEnv` |
| `DB_API` | This package's database name | app |
| `WORKFLOW_PORT` | API port | app |
| `AUTH_SUPER_ADMIN_PASSWORD` | First account's password, consumed by auth's super-admin migration | app |

**Read but not in the required list:**

| Variable | Meaning |
|---|---|
| `WORKFLOW_CONNECTION` | Override for the server login. Normally the shared `XEPLR_DB_CONNECTION` is used; `resolveDbConnection` names both if neither is set |
| `XEPLR_DB_CONNECTION` | Shared server login every xeplr service reads |
| `WORKFLOW_APPLICATION_ID` | Application id for rows written to `xeplr_configs`; defaults to `xeplr-workflow` standalone |
| `LOG_DIR` | Log directory; `./logs` if unset |
| `NODE_ENV` | Selects `<NODE_ENV>.env` |
| `WORKFLOW_ENV_EXPOSED` | Comma-separated **exact** env var names step templates may read as `{env.NAME}`. Empty = nothing readable |
| `WORKFLOW_PUBLIC_URL` | Base URL callers reach this service on, mount path included. Builds `{resumeUrl}`. Exported as `callbackRequiredEnv`; only needed for steps that call out (today `job-run`) |
| `JOBS_API_URL` | Where the server reaches the jobs API; the jobs canvas binds `job-run.jobsUrl` to `{env.JOBS_API_URL}`, so it must also be named in `WORKFLOW_ENV_EXPOSED` |
| `XEPLR_WORKFLOW_MIGRATIONS` | Extra migration directories a host adds to workflow's database |
| `AUTH_DB_CONNECTION_INFO_ENCRYPTED`, `AUTH_ACTIVATION_BASE_URL` (or `AUTH_ACTIVATION_URL`), `AUTH_ACCESS_TOKEN_TTL_MINUTES`, `AUTH_ACCESS_TOKEN_TOLERANCE_SECONDS`, `AUTH_SUPER_ADMIN_EMAIL` | Read by `@xeplr/auth` / `xeplr-auth-server` |
| `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `EMAIL_TEST_TO` | Read by `@xeplr/email` |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Redis (commented in `development.env`: defaults `localhost:6379`) |

**Embedded — `embedRequiredEnv`:** `DB_WORKFLOW` only. The host passes the
database name and connection into `registerWorkflow({ db })`; this package
never reads either variable itself.

## Structure

```
xeplr-workflow/
├─ index.js                 registerWorkflow, resumeByKey, embedRequiredEnv, callbackRequiredEnv
├─ bin/www                  process entry → orchestration/standalone.js
├─ orchestration/
│  └─ standalone.js         the ONLY file that reads env for config
├─ env.required.js          standalone required-env list
├─ lib/
│  ├─ router.js             buildWorkflowRouter(config) — all HTTP routes
│  ├─ workflowRunner.js     the engine: startRun, resumeByKey, resolveParams, collectParams
│  ├─ actionCatalog.js      whitelist of @xeplr/actions built-ins + local actions
│  ├─ actions/jobRun.js     local `job-run` action (start a job, park until callback)
│  ├─ envExposed.js         WORKFLOW_ENV_EXPOSED allowlist for {env.*}
│  └─ db.js                 connectDb + model(name) bound to workflow's own connection
├─ db/xcfgSetup.js          shared @xeplr/actions attachConfig({ service: 'xeplr-workflow' })
├─ models/                  Company, Workspace, Workflow, WorkflowStep, WorkflowRun,
│                           WorkflowStepRun, WorkflowResumeKey, WorkflowRunEdge
├─ migrations/              0003–0013, workflow's own tables
├─ migrations-tenants/      0001–0002: standalone workflow's companies / workspaces (skipped with tenantTables: false)
├─ migrations-auth/         rows for the AUTH database (roles, menus, apis)
└─ test/                    run.mjs + *.test.mjs
```

## API

### Exports (`index.js`)

| Export | Purpose |
|---|---|
| `registerWorkflow(config)` | Connect, create DB if missing, migrate, register actions, build router. Returns `{ router }` (no `app`, no `port`), `{ router, app }` (with `config.app`, mounted at `mountPath`, default `/workflow`), or `{ router, app, server }` (with `config.port`, via `@xeplr/base-apis` `createApp`). `config.db` is always required. Throws if no application id is registered |
| `resumeByKey(key, output?, opts?)` | Server-side, in-process resume of a run parked on a `wait` step. `opts.status: 'failed'` resolves the step as failed. Throws `err.code` `RESUME_KEY_INVALID` (used/unknown — normal for host routes) or `RESUME_KEY_NOT_READY` (step still running; nothing consumed, retry). Requires `registerWorkflow()` to have run in the process |
| `embedRequiredEnv` | `['DB_WORKFLOW']` — spread into a host's `env.required.js` |
| `callbackRequiredEnv` | `['WORKFLOW_PUBLIC_URL']` — only for hosts using steps that call out |

`registerWorkflow` config: `app`, `db` (`{ name, connection, connectionName?, mts? }`),
`applicationId`, `mountPath`, `port`, `appName` (default `xeplr_workflow_api`),
`mtMembershipGate`, `authMiddleware`, `middleware`, `log`, `auth`, `migrations`.
Pass `db.mts` only when nothing else in the process has called `registerMTs()`
(it is process-global).

### Routes (`lib/router.js`)

Paths are relative to the mount (`/` standalone, `/workflow` in xeplr-bi).
"Gated" = `config.mtMembershipGate` (a no-op if not supplied).

| Method | Path | Gated | Purpose |
|---|---|---|---|
| GET | `/` | no | Health: `{ service, status, name }` |
| GET | `/me` | via `authMiddleware` | Current user; only mounted when `authMiddleware` is passed |
| GET | `/actions` | yes | Action catalog: `name`, `description`, `inputSchema`, `outputSchema` (never the executor) |
| GET | `/companies`, `/companies/:id` | **no** | Company `genericRoute` (Company is `multiTenant = false`) |
| POST | `/companies/save`, `/companies/delete` | **no** | " |
| GET | `/workspaces`, `/workspaces/:id` | yes | Workspace `genericRoute` |
| POST | `/workspaces/save`, `/workspaces/delete` | yes | " |
| GET | `/workflows`, `/workflows/:id` | yes | Workflow list/get with `steps` eager-loaded |
| POST | `/workflows/save` | yes | Save a workflow and its whole step list in one transaction (changeset) |
| POST | `/workflows/delete` | yes | `{ ids: [...] }` |
| POST | `/workflows/:id/run` | yes | `startRun(id, body)`. Runs synchronously to the first wait step or the end; 400 carries `{ message, code, details }` |
| GET | `/workflows/:id/steps/:stepKey/last-output` | yes | Output of the latest `success`/`waiting` step run for that key. No side effects |
| POST | `/workflows/:id/steps/try` | yes | **Runs the action for real** with `{ actionName, stepKey, values, params }`, interpolated against other steps' `sampleOutput`. Echoes the resolved `input` |
| POST | `/public/resume/:key` | **no** | Resume a wait step; body `{ output?, status?, error? }`. The host must also exempt `<mount>/public/*` from its own auth |
| GET | `/email-templates`, `/email-templates/:name` | yes | From `@xeplr/email` `templatesRouter`; mounted only if templates are initialised |
| POST | `/email-templates/save`, `/email-templates/delete`, `/email-templates/:name/preview` | yes | " |

### Flows — screens as steps (`lib/flows.js`, `lib/flowsRouter.js`)

A **flow** is a workflow of kind `screens`: every step shows a screen (a
`@xeplr/ui-factory` form) to a person and waits for them to submit it, and the
transitions leaving it decide which screen comes next. The engine does not know
the difference — a screen step is an ordinary `wait` step whose action is
`screen-show`, and the submitted values are that step's `output`, so a
transition reads `output.<field>` exactly as it does anywhere else.

A flow is **designed in the app that owns the screens** (Configure UI → Flows),
through this facade, and addressed by a `key` that app chooses. The workflow
routes refuse to create or save one — *"This flow is designed in Configure UI"*
— and the builder shows it read-only. Runs and history are visible as usual.

Mounted at `<mount>/flows` by `registerWorkflow`, and returned on its own as
`flowsRouter` for a host that mounts it elsewhere. Every route is gated.

| Method | Path | Right | Body → answer |
|---|---|---|---|
| GET | `/flows` | view | → `[{ id, key, name, status, steps }]` (`steps` is a count) |
| POST | `/flows` | create | `{ key, name }` → the new draft flow |
| GET | `/flows/:key` | view | → `{ id, key, name, status, steps: [{ stepKey, label, screen, layout, transitions }] }` |
| PUT | `/flows/:key` | create | `{ name?, steps }` → the flow. Drafts only |
| POST | `/flows/:key/publish` | create | → the flow, once it checks out (below) |
| POST | `/flows/:key/runs` | run | → `{ runId, status, stepKey, screen }` |
| GET | `/flows/runs/:runId` | view | → `{ runId, status, stepKey, screen, values }` — `values` is what that step already holds, so a resumed run reopens filled in |
| POST | `/flows/runs/:runId/submit` | run | `{ values, recordId? }` → the next `{ status, stepKey, screen }`, or `{ status: 'done' }` |
| GET | `/flows/:key/runs?mine=1` | view | → runs still going, newest first |

**A transition is structured, never a formula**, in and out:

```json
{ "when": { "field": "type", "op": "=", "value": "contractor" }, "target": "contract" }
{ "when": null, "target": "payroll" }
```

`op` is one of `= != > >= < <= contains notContains startsWith endsWith in notIn
between isEmpty isNotEmpty` (the engine's own names, `eq`/`gt`…, are accepted on
the way in); `in`, `notIn` and `between` take a list. A `target` is a step key,
`end_success` or `end_failed`.

**Publishing checks** that every step names a screen, every target exists, a
step has at most one catch-all and it comes last, every step leads somewhere
or ends, and every step is reachable from the first.

**The browser never holds a resume key.** Submit is an authenticated call; the
facade finds the waiting step's key itself and resumes through `resumeByKey`.
`recordId` — the row the screen wrote into its own table — is kept on the step's
output, so later steps and their conditions can use it.

**A run belongs to the company it was started in.** Another company's flow is
not there, and its run ids are 404, not 403 — nothing confirms they exist.

Rights come from `migrations-auth/0004_flows_access.sql`: submitting is a
**run** right, not a view right, because it moves the run on and everything
after it follows.

## Data model and migrations

Two directories, two databases:

| Directory | Target DB | How it runs |
|---|---|---|
| `migrations/` | workflow's own (`DB_API` standalone, `DB_WORKFLOW` in BI) | On every boot inside `registerWorkflow` (and once more in `standalone.js`); idempotent. Also `npm run migrate:up`. Plain `.sql`, ledger-tracked by filename, `precede` order |
| `migrations-auth/` | the auth database | Not run by this package. Pointed at by `XEPLR_AUTH_MIGRATIONS`; applied by `@xeplr/auth` (`xeplr-auth-server` boot or `xeplr-auth-migrate up`) after auth's own migrations |

| Migration | Creates |
|---|---|
| `0001_companies` | `companies` (l1 tenant) |
| `0002_workspaces` | `workspaces` (l2, under a company) |
| `0003_workflows` | `workflows` — `name`, `description`, `params` (jsonb), `status` (default `draft`) |
| `0004_workflow_steps` | `workflow_steps` — `stepKey` (unique per workflow), `actionName`, `values`, `kind` (`auto`/`wait`), `timeoutMs`, `onError` (`stop`/`continue`), `transitions`, `joinStep`, `position` |
| `0005_workflow_runs` | `workflow_runs` — `status` (`queued`/`running`/`waiting`/`success`/`failed`), `params`, `item`, `trigger`, timings, `error` |
| `0006_workflow_step_runs` | `workflow_step_runs` — copied `stepKey`/`actionName`, resolved `input`, `output`, `error` |
| `0007_workflow_resume_keys` | `workflow_resume_keys` — unique random `key`, `consumedDate` |
| `0008_workflow_run_edges` | `workflow_run_edges` — parent → child run for `each` fan-out; `childRunId` unique |
| `0009` | `workflow_steps.layout` (canvas `{x, y}`) |
| `0010` | `workflow_steps.sampleOutput` |
| `0011` | `workflow_steps.params` |
| `0012` | `workflows.kind` (`workflow` \| `jobs`, default `workflow`) |
| `migrations-auth/0001_workflow_access` | Roles `Super Admin`, `CompanyAdmin`, `Creator`, `Viewer`; menus `Home`, `Actions`, `Configuration`, `Access Control`; `apis` rows; role → menu/api matrix |
| `migrations-auth/0003_nav_menus` | Menus `Dashboards`, `Jobs`, `Select Workspace`, `Select Company` (all `workflows:view`) + mappings |

Every table carries `mtId1`–`mtId4` and **no `applicationId`**: the database a
host gives workflow is the boundary.

## Engine behaviour (`lib/workflowRunner.js`)

- **Step values** are interpolated with `@xeplr/schema-handler` against
  `{ params, item, steps.<key>.output, previous_step.output, env, resumeKey, resumeUrl }`.
  `previous_step`/`steps` come from what ran in this run, not array position.
- **Routing**: no `transitions` → next step by `position`. With transitions →
  first match wins (`@xeplr/expression-handler`); a blank condition is the
  catch-all; targets are a `stepKey`, `end_success` or `end_failed`. No match
  and no catch-all **fails the run**.
- **Fan-out**: a matching `each` transition creates one child run per matching
  element (`item`), recorded in `workflow_run_edges`. With `joinStep` the parent
  waits and resumes at the join once all children are terminal (guarded by an
  atomic `waiting → running` patch); without it the parent finishes.
- **Wait steps**: the resume key row is written **before** the action runs;
  the run parks with status `waiting`. If the action fails the key is marked
  consumed.
- **Action failure**: `onError: 'continue'` advances by position; otherwise the
  run fails.
- **Run params**: the run schema is the union of every step's `params` (plus
  legacy `workflows.params` first). Any step requiring a name makes it required;
  otherwise first declaration by position wins. Validated with `applySchema`
  **before** the run row is inserted; undeclared keys are dropped; failure has
  `code: 'PARAMS_INVALID'` and `details`. A workflow that declares nothing
  accepts params unchanged.
- **Tenant context**: after the first lookup, all DB work runs inside
  `runWithMt()` with the run's stored `mtId`s, because a resume can arrive long
  after the starting request.

Not read by the runner: `workflows.status`, `workflows.kind`,
`workflow_steps.layout`, `workflow_steps.sampleOutput`, `workflow_steps.timeoutMs`.

## Rules the code enforces, and why

| Rule | Why (from the code comments) |
|---|---|
| Action catalog is a **whitelist** (`WANTED`, `LOCAL`, `WANTED_WITH_META`) | Offering a dangerous built-in should be a visible decision in a diff, not a side effect of upgrading. Placeholders in `@xeplr/actions` would appear in the picker and fail when used |
| `spawnProgram` is deliberately absent (asserted in tests) | It runs arbitrary executables |
| Placeholders (no `execute`/`name`) are skipped and logged, not thrown | The app works without them; they land when the package implements them |
| `{env.*}` reaches only names in `WORKFLOW_ENV_EXPOSED`; exact names, no globs | Resolved step input is echoed by `/steps/try` and persisted on step runs, so an unlisted env would let any step author read `ENCRYPTION_KEY` / `AUTH_JWT_SECRET`. An allowlist fails closed when someone adds a new secret |
| Never put a credential in `WORKFLOW_ENV_EXPOSED` | Secrets belong where the action reads them server-side (e.g. `useCustomConnection: false` with `SMTP_*`) |
| `WORKFLOW_PUBLIC_URL` is not defaulted | A wrong-but-present callback address makes a run wait forever on work that finished; unset, `job-run` refuses by name |
| Models are always bound via `db.model(name)`; connection uses `bind: false` | `bindModels` is global in Objection; binding workflow's connection globally re-pointed the host's models at workflow's database |
| `registerWorkflow` runs its own migrations and action registration | Previously only standalone did, so embedded hosts got missing tables and an empty catalog with no error |
| `xeplr_configs` is fail-fast standalone, best-effort embedded | Standalone owns its process and should not boot half-configured; embedded, one metadata-writing action should not take down the host's product |
| An application id must be registered | Rows written to shared `xeplr_configs` are attributed by application |
| Hosts must not mount the router at `/` | It serves `/companies`, `/workspaces`, `/actions`, which a host already serves |
| Hosts should take the router, not `app.use()` it onto a built createApp app | createApp adds a catch-all 404 after its routes, so later mounts are unreachable |
| `/steps/try` is real execution; the UI confirms first | Same `runAction` the engine uses — `email-delete` expunges, `db-push` writes |
| `/public/resume/:key` is ungated | A resume link is followed from an email client or a job callback with no token |
| `resumeByKey` refuses (`RESUME_KEY_NOT_READY`) until the step is `waiting`; claim is an atomic conditional patch | The key exists before the action finishes (mail scanners pre-fetch links); resuming mid-action would route the run on while the action is still running |
| `job-run`: HTTP 409 from the jobs API is a failure, not a retry | A chain must not continue past a movement that never ran |
| Role matrix: Creator can run, Viewer cannot | A run has side effects (mail, files, database writes) |

## Tests

```bash
npm test          # node test/run.mjs — each *.test.mjs in its own process
node --preserve-symlinks test/runParams.test.mjs   # one suite on its own
```

Plain scripts, no framework; each prints `ok`/`FAIL` lines and exits non-zero on
failure. A suite that needs node flags declares them in a `// @flags:` header
(three use `--preserve-symlinks` so dev-linked `@xeplr/*` packages resolve their
peers from this app's `node_modules`). No database or network needed; needs
`npm install` (real `@xeplr/actions` and `@xeplr/schema-handler`).

| Suite | Covers |
|---|---|
| `actionCatalog.test.mjs` | Ready vs placeholder detection; registered names are kebab-case; `spawnProgram` not offered |
| `flows.test.mjs` | The `/flows` facade: flows as workflows, steps and arrows, runs and submits (against a fake database) |
| `envExposed.test.mjs` | Nothing exposed by default; exact, case-sensitive matching; globs fail closed (against real `interpolateAll`) |
| `flowsAccess.test.mjs` | With `access: true`, each flows route refuses a caller lacking its permission, and refuses outright with no `req.access`; off by default |
| `runParams.test.mjs` | `resolveParams` / `collectParams`: required, defaults, types, typos, union rules |

Not covered by tests: the router, `startRun`/`resumeByKey` against a database,
migrations, `job-run`.
