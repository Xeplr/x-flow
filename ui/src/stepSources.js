// WHAT THE CANVAS OFFERS, AND WHAT DROPPING ONE PRODUCES.
//
// A workflow's `kind` decides where the palette comes from. Connecting jobs to
// each other opens this same canvas, saves the same rows and runs on the same
// engine — the only difference is that the palette lists JOBS instead of
// actions, and dropping one produces a step that calls that job.
//
// PURE, and separate from the controller on purpose. "A job becomes a step
// whose action is job-run, kind wait, with these three values" is a claim that
// can be quietly wrong in a way no screenshot shows: a step that looks right
// on the canvas and fails at run time because `callbackUrl` was not bound.
// Here it is a function of an object, and the test beside it checks it.
//
// THIS IS THE SEAM FOR EVERYTHING THAT COMES NEXT. The next palette is saved
// API calls, and after that whatever else gets connected. Each is an entry in
// SOURCES — a name, how to list it, how to turn one into a step — and neither
// the canvas nor the controller learns what any of them are. Adding one is a
// new entry here, not a branch in a component.

// NOTHING IS IMPORTED HERE, and that is a rule rather than an accident. This
// is the Model: pure logic, no React and no api/* module — importing one would
// pull in @xeplr/ui-account and with it a JSX file, so this could no longer be
// loaded by a plain `node test/...` run. WHICH FUNCTION FETCHES a palette is
// the controller's business; WHAT AN ITEM BECOMES is this file's, and that is
// the half worth testing.

// ─────────────────────────────────────────────────────────────────────────
// THE BINDINGS A JOB STEP IS BORN WITH
//
// Both are literal template strings, resolved by the ENGINE at run time (see
// workflowRunner's buildContext / interpolateAll) — not values this UI knows.
// That is deliberate in both cases:
//
//   {resumeUrl}          the address of this step's own resume key, which
//                        only exists once the step is actually running. It is
//                        also environment-specific, and a browser filling in
//                        its own idea of the hostname would produce a step
//                        that works in exactly one deployment.
//
//   {env.JOBS_API_URL}   where the SERVER can reach the jobs API. Not the
//                        same string as the browser's — a server behind the
//                        same proxy usually addresses it internally — and it
//                        is not the browser's business either way. The engine
//                        resolves it from WORKFLOW_ENV_EXPOSED.
// ─────────────────────────────────────────────────────────────────────────
export const JOB_STEP_ACTION = 'job-run'
export const JOBS_URL_BINDING = '{env.JOBS_API_URL}'
export const RESUME_URL_BINDING = '{resumeUrl}'

/**
 * A stable, readable step key for a job.
 *
 * Derived from the NAME rather than the id, because a step key is what a
 * person reads in a transition (`target: 'load_sales'`) and in a binding
 * (`{steps.load_sales.output.totalRows}`). An id would make both unreadable.
 *
 * Uniqueness is the caller's to enforce — `existingKeys` is how the same job
 * dropped twice becomes load_sales and load_sales_2 rather than two steps that
 * silently overwrite each other's outputs in the run context.
 */
export function jobStepKey(job, existingKeys) {
  var base = String((job && job.name) || 'job')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'job'

  var taken = new Set(existingKeys || [])
  if (!taken.has(base)) return base
  for (var n = 2; n < 500; n++) {
    if (!taken.has(base + '_' + n)) return base + '_' + n
  }
  return base + '_' + Date.now()
}

/**
 * One job → one step.
 *
 * kind: 'wait' IS THE WHOLE INTEGRATION. The action starts the job and
 * returns; the step then parks until the job POSTs its outcome back to
 * {resumeUrl}. An 'auto' step would carry on the moment the job had been
 * ACCEPTED, and the next step would run against data that is still being
 * moved — the exact failure this canvas exists to prevent.
 *
 * onError: 'stop' is inherited from the engine's own default and restated
 * here because for a job chain it is the point: a job that failed must not let
 * the chain walk on.
 */
export function jobToStep(job, position, existingKeys) {
  return {
    stepKey: jobStepKey(job, existingKeys),
    name: job.name || 'Run job',
    actionName: JOB_STEP_ACTION,
    kind: 'wait',
    onError: 'stop',
    values: {
      jobsUrl: JOBS_URL_BINDING,
      jobId: job.id,
      callbackUrl: RESUME_URL_BINDING
    },
    transitions: null,
    position: position
  }
}

/** An action name → one step. The original behaviour, unchanged. */
export function actionToStep(action, position) {
  return {
    stepKey: '',
    name: '',
    actionName: (action && action.name) || '',
    kind: 'auto',
    onError: 'stop',
    values: {},
    transitions: null,
    position: position
  }
}

/**
 * A NAME FOR A CONNECTION NOBODY WANTED TO NAME.
 *
 * The row needs one — it is how this is found again — but asking for it is
 * asking somebody to invent a label for something that already describes
 * itself. The steps ARE the description, so the steps are the name:
 *
 *   Load Sales → Refresh Cube → Email Summary
 *
 * Truncated in the middle rather than at the end, because the last step is as
 * identifying as the first: two chains that both start at Load Sales are told
 * apart by where they finish.
 *
 * Null when there is nothing to derive from, so the caller falls back rather
 * than saving a workflow called "→".
 */
export function autoNameFromSteps(steps) {
  var names = (steps || [])
    .filter(function(s) { return s && !s.deleted })
    .map(function(s) { return s.name || s.stepKey })
    .filter(Boolean)

  if (!names.length) return null
  if (names.length <= 3) return names.join(' → ')
  return names[0] + ' → … → ' + names[names.length - 1]
}

/**
 * A step of a flow, as far as this canvas is concerned: NOT SOMETHING IT MAKES.
 *
 * A flow's steps are generated by the backend from a design held in another
 * app (see @xeplr/workflow's lib/flows.js), and this canvas only draws them. `toStep`
 * exists on every source so nothing has to check for it — and this one throws
 * rather than returning something plausible, because a step added here would
 * be silently discarded by the next PUT /flows/:key and the person who added
 * it would never find out.
 */
export function screenToStep() {
  throw new Error('A flow of screens is designed in Configure UI — steps cannot be added here.')
}

export const SOURCES = {
  // The default. `list` is the action catalogue; a drop names an action and
  // the author fills the rest in through the drawer.
  workflow: {
    kind: 'workflow',
    label: 'Actions',
    // Editable, which is the ordinary case. Said out loud rather than left
    // undefined, so `source.readOnly` is a fact on every source and reading it
    // never needs a default at the call site.
    readOnly: false,
    // A blank step is a valid thing to add here — the author picks the action
    // in the drawer — so the palette is optional rather than required.
    pickFirst: false,
    toStep: actionToStep,

    // ── WHAT THE SCREEN CALLS THINGS ──────────────────────────────────────
    //
    // Copy belongs to the source, not to the Design, because the Design is one
    // canvas serving both and a branch on `kind` inside it would have to be
    // edited again for every source added later. It is also the difference
    // between the two products being one screen and merely looking like one:
    // somebody who came from Jobs to connect two jobs never asked for a
    // workflow, and every sentence calling it one is a concept they now have
    // to learn to do the thing they wanted.
    backTo: 'workflows',
    backLabel: 'Workflows',
    namePlaceholder: 'Workflow name',
    emptyCanvas: 'No steps yet — add one to start the canvas.',
    // A workflow's name IS required — it is how you find it again in a list of
    // them, and there is nothing to derive one from.
    autoName: null
  },

  // Connecting jobs. A drop is a COMPLETE step: the job is chosen up front, so
  // there is nothing left to fill in and the arrows are the only thing the
  // author still has to draw.
  jobs: {
    kind: 'jobs',
    label: 'Jobs',
    readOnly: false,
    pickFirst: true,
    toStep: jobToStep,

    // Back to JOBS, because that is where this was opened from and what it is
    // about. Sending somebody to a workflow list they never asked to visit is
    // how the seam between the two products becomes visible.
    backTo: 'jobs',
    backLabel: 'Jobs',
    namePlaceholder: 'Name this connection (optional)',
    emptyCanvas: 'No jobs yet — choose one below to start connecting.',
    autoName: autoNameFromSteps
  },

  // A FLOW OF SCREENS, DRAWN BUT NOT EDITED.
  //
  // Each step shows a screen to a person and waits for them to submit it. The
  // design lives in the app that owns the screens and reaches this database
  // through the /flows facade, which generates the steps; the backend's own
  // workflow save route refuses one of these outright (see
  // @xeplr/workflow's lib/flows.js's refuseScreensEdit).
  //
  // So it is on the canvas for the reason anything is: somebody debugging a run
  // wants to see the shape of it, the branch that was taken, the step it is
  // parked on. Runs and history are exactly what is NOT read-only about it.
  //
  // readOnly is a property of the SOURCE rather than a branch on kind inside
  // the Design, for the same reason every other line here is: the next source
  // that is drawn-but-not-edited needs an entry, not an edit to a component.
  screens: {
    kind: 'screens',
    label: 'Screens',
    readOnly: true,
    pickFirst: false,
    toStep: screenToStep,

    backTo: 'workflows',
    backLabel: 'Workflows',
    namePlaceholder: 'Flow name',
    emptyCanvas: 'This flow has no screens yet.',
    // Nothing to derive one from, and nothing here may rename it anyway.
    autoName: null,
    // Shown on the canvas in place of the controls it does not have. The same
    // sentence the backend refuses with, so somebody who hits both sees one
    // answer rather than two.
    readOnlyNotice: 'This flow is designed in Configure UI'
  }
}

/** The source for a workflow, defaulting to the ordinary action canvas. */
export function sourceFor(workflow) {
  var kind = (workflow && workflow.kind) || 'workflow'
  return SOURCES[kind] || SOURCES.workflow
}

/**
 * Whether this workflow may be edited HERE.
 *
 * Asked of the workflow rather than of the source at every call site, because
 * the answer is about a row and the source is only how it is looked up. The
 * server refuses regardless — this is what stops somebody filling in a form
 * they were never going to be allowed to save.
 */
export function isReadOnly(workflow) {
  return sourceFor(workflow).readOnly === true
}
