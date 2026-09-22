// HOW A FLOW GROWS — every edit the canvas makes to a workflow, as pure
// functions of it.
//
// There is no "add step" button: a box is born from the arrow of the one
// before it, spliced into an arrow that already exists, or linked by dragging
// a loose arrow onto another box. All three are edits to the same two things
// — the `steps` array and each step's `transitions` — so they live here,
// together, where a test can hold them still.
//
// PURE, and free of React and of api/* on purpose: what an edit DOES to a
// flow is the half that can be quietly wrong (a transition pointing at a key
// that no longer exists, a splice that drops the tail of a path), and it is
// the half no screenshot shows.
//
// The engine's shapes, unchanged (lib/workflowRunner.js's routeAfterStep):
//   step        { stepKey, name, actionName, kind, onError, values, transitions, position }
//   transition  { target: <stepKey> | 'end_success' | 'end_failed', condition?, mode? }
//   no transitions at all → the run advances by POSITION, which is why a
//   linked chain still needs its arrows written down: position is the
//   fallback, not the meaning.

var NODE_W = 252
var ROW_GAP = 150

/** A step key from a name: lower case, underscores, unique among the rest. */
export function keyFor(name, existingKeys) {
  var base = String(name || 'step')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'step'
  var taken = new Set(existingKeys || [])
  if (!taken.has(base)) return base
  for (var n = 2; n < 999; n++) {
    if (!taken.has(base + '_' + n)) return base + '_' + n
  }
  return base + '_' + Date.now().toString(36)
}

/** The steps a canvas shows: the ones not deleted, with their real index. */
export function liveSteps(workflow) {
  return ((workflow && workflow.steps) || [])
    .map(function (step, index) { return { step: step, index: index } })
    .filter(function (entry) { return !entry.step.deleted })
}

function keysOf(workflow) {
  return liveSteps(workflow).map(function (e) { return e.step.stepKey }).filter(Boolean)
}

function withStep(workflow, index, changes) {
  var steps = (workflow.steps || []).slice()
  steps[index] = Object.assign({}, steps[index], changes)
  return Object.assign({}, workflow, { steps: steps })
}

function transitionsOf(step) {
  return (step && step.transitions) || []
}

/**
 * THE STEP BEHIND A SCREEN.
 *
 * A screen is not a third kind of thing to the engine — it is a `wait` step on
 * the `screen-show` action carrying one screen key. The engine mints a resume
 * key before the action runs, parks the run, and the app that owns the screens
 * shows it and submits what the person typed (lib/flows.js, lib/actions/
 * screenShow.js).
 *
 * The designer offers it as a TYPE rather than as an action because that is
 * what it is to somebody drawing a flow — "a screen comes next", not "run the
 * screen-show action". `screen-show` stays out of the action list for the same
 * reason: picking it there would be picking the machinery.
 */
export var SCREEN_ACTION = 'screen-show'

/**
 * A new step, unattached. `type` is what the person picked in the chooser:
 * 'action' — it does something, 'screen' — a person fills something in,
 * 'condition' — it splits true from false.
 */
export function blankStep(type, name, existingKeys, layout) {
  var kind = type === 'condition' ? 'condition' : type === 'screen' ? 'wait' : 'auto'
  return {
    stepKey: keyFor(name || (type === 'condition' ? 'condition' : type === 'screen' ? 'screen' : 'step'), existingKeys),
    name: name || '',
    // A screen step names its action from the start: there is nothing to pick
    // — the question it still has is WHICH screen, which lives in values.
    actionName: type === 'screen' ? SCREEN_ACTION : '',
    kind: kind,
    onError: 'stop',
    values: {},
    transitions: null,
    position: (existingKeys || []).length,
    layout: layout || { x: 60, y: 100 }
  }
}

/** Where a box born from `from` lands: directly under it. */
function below(from) {
  var at = (from && from.layout) || { x: 60, y: 100 }
  return { x: at.x, y: at.y + ROW_GAP }
}

/** Where a second box out of the same one lands: beside the first. */
function beside(from) {
  var at = below(from)
  return { x: at.x + NODE_W + 60, y: at.y }
}

/**
 * ADD, FROM A BOX'S OWN ARROW. The new step is linked from `index`, and lands
 * under it — or beside, when that box already leads somewhere.
 *
 * @returns { workflow, index } — the new step's index, so the canvas can
 *          select it and put the cursor in its name.
 */
export function addAfter(workflow, index, type, name) {
  var from = (workflow.steps || [])[index]
  var already = transitionsOf(from).length > 0
  var step = blankStep(type, name, keysOf(workflow), already ? beside(from) : below(from))
  var steps = (workflow.steps || []).concat([step])
  var next = Object.assign({}, workflow, { steps: steps })
  return { workflow: link(next, index, steps.length - 1), index: steps.length - 1 }
}

/**
 * LINK, BY DRAGGING. An arrow from `fromIndex` to `toIndex`.
 *
 * Linking twice is not two arrows: a repeated link is the same path, and two
 * identical rows would make "first match wins" read as a coin toss.
 */
export function link(workflow, fromIndex, toIndex) {
  var from = (workflow.steps || [])[fromIndex]
  var to = (workflow.steps || [])[toIndex]
  if (!from || !to || fromIndex === toIndex) return workflow
  var rows = transitionsOf(from)
  if (rows.some(function (t) { return t.target === to.stepKey })) return workflow
  return withStep(workflow, fromIndex, { transitions: rows.concat([{ target: to.stepKey }]) })
}

/** Removes one arrow, leaving both boxes where they are. */
export function unlink(workflow, fromIndex, target) {
  var from = (workflow.steps || [])[fromIndex]
  if (!from) return workflow
  var rows = transitionsOf(from).filter(function (t) { return t.target !== target })
  return withStep(workflow, fromIndex, { transitions: rows.length ? rows : null })
}

/**
 * INSERT, ON AN ARROW THAT EXISTS. The new step takes the arrow's place, and
 * the arrow's old target becomes the new step's own — so the path it was part
 * of still ends where it did.
 *
 * A condition inserted this way keeps the existing path as its TRUE side and
 * leaves FALSE empty: inserting never silently drops what was already there.
 */
export function insertOn(workflow, fromIndex, target, type, name) {
  var from = (workflow.steps || [])[fromIndex]
  if (!from) return { workflow: workflow, index: -1 }
  var rows = transitionsOf(from)
  var at = rows.findIndex(function (t) { return t.target === target })
  if (at === -1) return { workflow: workflow, index: -1 }

  var step = blankStep(type, name, keysOf(workflow), below(from))
  // The one it displaces moves down, so the new box has somewhere to be.
  var steps = (workflow.steps || []).map(function (s) {
    if (s.stepKey !== target || !s.layout) return s
    return Object.assign({}, s, { layout: { x: s.layout.x, y: s.layout.y + ROW_GAP } })
  })
  step.transitions = [Object.assign({}, rows[at])]           // it inherits the old arrow
  steps = steps.concat([step])

  var replaced = rows.slice()
  replaced[at] = Object.assign({}, rows[at], { target: step.stepKey })
  delete replaced[at].condition                              // the condition, if any, stays with the old hop
  var next = withStep(Object.assign({}, workflow, { steps: steps }), fromIndex, { transitions: replaced })
  return { workflow: next, index: steps.length - 1 }
}

/**
 * RENAME. The key follows the name while the step is still unnamed-by-hand,
 * and every arrow pointing at it follows too — a rename that broke its own
 * incoming arrows would be a trap.
 */
export function rename(workflow, index, name) {
  var step = (workflow.steps || [])[index]
  if (!step) return workflow
  var others = keysOf(workflow).filter(function (k) { return k !== step.stepKey })
  var nextKey = keyFor(name, others)
  var steps = (workflow.steps || []).map(function (s, i) {
    if (i === index) return Object.assign({}, s, { name: name, stepKey: nextKey })
    var rows = transitionsOf(s)
    if (!rows.some(function (t) { return t.target === step.stepKey })) return s
    return Object.assign({}, s, {
      transitions: rows.map(function (t) {
        return t.target === step.stepKey ? Object.assign({}, t, { target: nextKey }) : t
      })
    })
  })
  return Object.assign({}, workflow, { steps: steps })
}

/**
 * REMOVE. The step goes, and so does every arrow into it — a transition to a
 * step that no longer exists fails the run at exactly the wrong moment
 * (routeAfterStep: "targets unknown step").
 */
export function removeStep(workflow, index) {
  var step = (workflow.steps || [])[index]
  if (!step) return workflow
  var steps = (workflow.steps || []).map(function (s, i) {
    if (i === index) return Object.assign({}, s, { deleted: true })
    var rows = transitionsOf(s)
    if (!rows.some(function (t) { return t.target === step.stepKey })) return s
    var kept = rows.filter(function (t) { return t.target !== step.stepKey })
    return Object.assign({}, s, { transitions: kept.length ? kept : null })
  })
  return Object.assign({}, workflow, { steps: steps })
}

/** The arrows to draw: one per transition, by step index. */
export function edgesOf(workflow) {
  var byKey = {}
  liveSteps(workflow).forEach(function (e) { byKey[e.step.stepKey] = e.index })
  var edges = []
  liveSteps(workflow).forEach(function (e) {
    transitionsOf(e.step).forEach(function (t) {
      if (byKey[t.target] === undefined) return                // an end, or a broken target
      edges.push({
        id: e.index + '→' + t.target,
        from: e.index,
        to: byKey[t.target],
        target: t.target,
        fromIndex: e.index,
        mode: t.mode || null,
        condition: t.condition || null
      })
    })
  })
  return edges
}
