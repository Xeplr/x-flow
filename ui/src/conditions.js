// Transition conditions, as text.
//
// The ENGINE evaluates a structured node — { left: { field }, op, right: {
// value } } — via @xeplr/expression-handler (see @xeplr/workflow's lib/workflowRunner.js's
// routeAfterStep). Nobody should have to hand-write that in a textarea, which
// is what the step editor used to ask for.
//
// So the editor shows a one-line formula and compiles it with the SAME package
// the engine evaluates with. That is the whole point of using it rather than a
// bespoke parser: there is one definition of what a condition means, and a
// condition that compiles here is one the engine can run. A second
// implementation would drift, and the drift would only show up at run time on
// somebody's live workflow.
//
// Pure logic, no React — see the MVC note in the workspace CLAUDE.md.

import xf from '@xeplr/expression-handler'

// ── text → node ─────────────────────────────────────────────────────────

/**
 * Compile a condition written as a formula into the node the engine evaluates.
 *
 * @param {string} text  e.g. `output.approved = true`
 * @returns {{ ok: true, node: object|null } | { ok: false, error: string }}
 *   node is null for BLANK text, which is not an error — a transition with no
 *   condition is the catch-all, and the engine treats a missing condition as
 *   "always matches" (routeAfterStep: `!t.condition || xf.evaluate(...)`).
 */
export function compileCondition(text) {
  var trimmed = (text || '').trim()
  if (!trimmed) return { ok: true, node: null }
  try {
    return { ok: true, node: xf.formula.parse(trimmed) }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

// ── node → text ─────────────────────────────────────────────────────────

function operandToText(operand) {
  if (!operand || typeof operand !== 'object') return ''
  if ('field' in operand) {
    return operand.fn ? `${operand.fn}(${operand.field})` : operand.field
  }
  if ('value' in operand) {
    var v = operand.value
    if (typeof v === 'string') return JSON.stringify(v)
    if (Array.isArray(v)) return '[' + v.map(function (x) { return typeof x === 'string' ? JSON.stringify(x) : String(x) }).join(', ') + ']'
    return String(v)
  }
  return ''
}

// The formula spellings of the operators, so a round-trip through
// decompile → compile lands on the same node rather than on a parse error.
var OP_TEXT = {
  eq: '=', equals: '=',
  neq: '!=', notEquals: '!=',
  gt: '>', gte: '>=', lt: '<', lte: '<='
}

/**
 * Render a stored condition node back as editable formula text.
 *
 * Anything without an infix spelling (contains, in, between, isNull, …) has no
 * lossless one-liner, so it is handed back as JSON rather than mangled into a
 * form that would not compile. Those are rare in transitions and the textarea
 * still round-trips them safely.
 */
export function conditionToText(node) {
  if (!node) return ''
  var sym = OP_TEXT[node.op]
  if (!sym || !node.left) return JSON.stringify(node)
  var left = operandToText(node.left)
  var right = operandToText(node.right)
  if (!left || (node.right && !right)) return JSON.stringify(node)
  return `${left} ${sym} ${right}`
}

// ── field references ────────────────────────────────────────────────────

/**
 * Flatten an object into the dot paths a condition or a value can bind to.
 * `{ user: { id: 1 } }` → `[{ path: 'user.id', preview: '1' }]`.
 *
 * Arrays stop the walk: their elements are addressed positionally, and
 * offering `rows.0.name` invites a binding that breaks the moment the order
 * changes. The array itself is still offered, so `each` can fan out over it.
 */
export function flattenPaths(obj, prefix) {
  prefix = prefix || ''
  if (!obj || typeof obj !== 'object') return []
  var out = []
  Object.keys(obj).forEach(function (key) {
    var path = prefix ? prefix + '.' + key : key
    var val = obj[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out = out.concat(flattenPaths(val, path))
      return
    }
    out.push({ path: path, preview: previewOf(val) })
  })
  return out
}

function previewOf(val) {
  if (val === null) return 'null'
  if (Array.isArray(val)) return `[${val.length} item${val.length === 1 ? '' : 's'}]`
  if (typeof val === 'string') return val.length > 40 ? val.slice(0, 40) + '…' : val
  return String(val)
}

/**
 * Every reference the step being edited can bind to, grouped for a picker.
 *
 * Mirrors what buildContext() actually puts in scope at run time
 * (@xeplr/workflow's lib/workflowRunner.js) — params, the previous step's output, each
 * earlier step's output by key, and on a wait step the injected resumeKey.
 * Built from each step's SAMPLE OUTPUT, which is why sample output is worth
 * capturing: it is what makes the picker able to list real field names instead
 * of asking you to remember them.
 *
 * @param {object[]} steps      all steps, in order
 * @param {number}   index      position of the step being edited
 * @param {object}   params     the workflow's declared params (sample values)
 * @param {boolean}  isWait     whether the edited step is a wait step
 */
export function referencesFor(steps, index, params, isWait) {
  var groups = []

  var paramPaths = flattenPaths(params || {})
  if (paramPaths.length) {
    groups.push({
      label: 'Run parameters',
      items: paramPaths.map(function (p) { return { token: `{params.${p.path}}`, name: p.path, preview: p.preview } })
    })
  }

  if (isWait) {
    groups.push({
      label: 'This step',
      items: [{
        token: '{resumeKey}',
        name: 'resumeKey',
        // Not from sample output — the engine mints it before the step's own
        // action runs, precisely so the action can put it in a link.
        preview: 'minted when this step starts waiting'
      }]
    })
  }

  var previous = index > 0 ? steps[index - 1] : null
  if (previous) {
    var prevPaths = flattenPaths(previous.sampleOutput || {})
    if (prevPaths.length) {
      groups.push({
        label: `Previous step — ${previous.name || previous.stepKey}`,
        items: prevPaths.map(function (p) { return { token: `{previous_step.output.${p.path}}`, name: p.path, preview: p.preview } })
      })
    }
  }

  steps.slice(0, index).forEach(function (s) {
    var paths = flattenPaths(s.sampleOutput || {})
    if (!paths.length) return
    groups.push({
      label: `${s.name || s.stepKey}`,
      items: paths.map(function (p) { return { token: `{steps.${s.stepKey}.output.${p.path}}`, name: p.path, preview: p.preview } })
    })
  })

  return groups
}

/**
 * The bare field paths a CONDITION can test, which are not the same as the
 * tokens a VALUE binds to. A condition is evaluated against
 * { output, item, params } and takes raw paths (`output.approved`), never the
 * {braced} interpolation form — see routeAfterStep's `row`.
 */
export function conditionFieldsFor(step, params) {
  var groups = []

  var out = flattenPaths(step && step.sampleOutput ? step.sampleOutput : {}).map(function (p) {
    return { token: `output.${p.path}`, name: `output.${p.path}`, preview: p.preview }
  })
  // Always offered: the engine synthesises it on an expired wait step, so it
  // is bindable before any run has ever produced it.
  if (step && step.kind === 'wait') {
    out.push({ token: 'output.expired', name: 'output.expired', preview: 'true when the wait timed out' })
  }
  if (out.length) groups.push({ label: 'This step\'s output', items: out })

  // The run's own parameters are in scope for a CONDITION too — routeAfterStep
  // evaluates against { output, item, params }, so `params.tier = "enterprise"`
  // is a valid branch. They were never offered here, which meant the one place
  // you still had to type a parameter name from memory was the place a typo is
  // hardest to notice: an unmatched condition is not an error, it is a branch
  // that quietly never fires.
  //
  // RAW paths, not the braced form — a condition takes `params.tier`, never
  // `{params.tier}`. Same names, different syntax, which is exactly why the
  // picker is worth having in both places.
  var paramPaths = flattenPaths(params || {}).map(function (p) {
    return { token: `params.${p.path}`, name: `params.${p.path}`, preview: p.preview }
  })
  if (paramPaths.length) groups.push({ label: 'Run parameters', items: paramPaths })

  return groups
}
