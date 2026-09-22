// HOW A FLOW STARTS, and what comes in with it.
//
// Both belong to the FLOW, not to a step: every step was being asked for "step
// inputs" that were really the run's, and the same list appeared on all of
// them. A flow has one beginning, so it is asked once — name, then what starts
// it, then what arrives.
//
// WHAT ARRIVES IS WRITTEN AS AN EXAMPLE, because that is how anyone has it to
// hand: a response pasted from the system that will call us. The example is
// not the contract — the engine's contract is `params`, which it enforces
// before a run starts (workflowRunner: a required one missing means the run is
// refused, not failed halfway) — so the example is READ INTO params here, and
// each param keeps the example value so every picker can show it beside the
// name.
//
// An example never becomes a DEFAULT. `ada@acme.com` is what the field looks
// like, not what should be sent when nobody sends anything; quietly running a
// flow against sample data is exactly the kind of help nobody wants.
//
// Pure: no React, no api/*.

/** What starts a run. One shape per kind — see migrations/0014. */
export var TRIGGERS = [
  { kind: 'manual', label: 'Someone presses Start', fields: [] },
  { kind: 'api', label: 'Another system calls it', fields: [] },
  {
    kind: 'schedule',
    label: 'On a schedule',
    fields: [{ name: 'cron', label: 'When', placeholder: '0 9 * * 1', help: 'Minute hour day month weekday' }]
  },
  {
    kind: 'file',
    label: 'A file arrives',
    fields: [
      { name: 'folder', label: 'Folder', placeholder: '/hr/incoming' },
      { name: 'named', label: 'Named', placeholder: '*.csv' }
    ]
  },
  {
    kind: 'email',
    label: 'An email arrives',
    fields: [
      { name: 'mailbox', label: 'Mailbox', placeholder: 'invoices@acme.com' },
      { name: 'folder', label: 'Folder', placeholder: 'INBOX' }
    ]
  }
]

export function triggerFor(kind) {
  return TRIGGERS.find(function (t) { return t.kind === kind }) || TRIGGERS[0]
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'string'
}

/**
 * An example → the params the engine enforces.
 *
 * Only the top level: `{ customer: { id } }` is one param named `customer`
 * holding an object, not two. A caller sends that object whole, and a step
 * picks `customer.id` out of it — flattening here would invent two required
 * inputs nobody agreed to send.
 *
 * @param text     the example, as typed (JSON)
 * @param existing the params already declared, so `required` and a real
 *                 `default` somebody set are not thrown away on a re-read
 * @returns { params, error } — error is the parse message, params untouched
 */
export function paramsFromSample(text, existing) {
  var raw = String(text == null ? '' : text).trim()
  if (!raw) return { params: [], error: null }

  var parsed
  try { parsed = JSON.parse(raw) } catch (err) {
    return { params: existing || [], error: err.message }
  }
  if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
    return { params: existing || [], error: 'The example has to be an object — { "name": "Ada" }' }
  }

  var before = {}
  ;(existing || []).forEach(function (p) { if (p && p.name) before[p.name] = p })

  return {
    params: Object.keys(parsed).map(function (name, order) {
      var was = before[name] || {}
      return {
        name: name,
        type: typeOf(parsed[name]),
        // Kept from what was already declared: the example says what a field
        // LOOKS like and never whether it may be left out.
        required: was.required === undefined ? false : was.required,
        default: was.default === undefined ? null : was.default,
        description: was.description || null,
        example: parsed[name],
        order: order
      }
    }),
    error: null
  }
}

/** params → the example again, so the box can be reopened and edited. */
export function sampleFromParams(params) {
  var out = {}
  ;(params || []).forEach(function (p) {
    if (!p || !p.name) return
    out[p.name] = p.example === undefined ? (p.default === undefined ? '' : p.default) : p.example
  })
  return Object.keys(out).length ? JSON.stringify(out, null, 2) : ''
}

/** The one line the flow's bar shows: how it starts, and how much comes in. */
export function describeStart(trigger, params) {
  var how = triggerFor(trigger && trigger.kind).label
  var count = (params || []).filter(function (p) { return p && p.name }).length
  if (!count) return how
  return how + ' · ' + count + (count === 1 ? ' field in' : ' fields in')
}

/**
 * WHAT A SCREEN HANDS BACK, from the screen's own definition.
 *
 * A screen step is the one step whose output is NOT a guess. The form has
 * fields, the person fills them in, and those values become the step's output
 * (screenShow.js) — so asking somebody to paste an example of it is asking
 * them to retype something the app already knows, and to keep retyping it
 * every time the form changes.
 *
 * `recordId` is added because the facade adds it: the app writes the record to
 * its own table before resuming, and POST /flows/runs/:id/submit keeps the id
 * beside the submitted values, so a later step can point at the row.
 *
 * @param screen  one entry of the host's `screens`: { key, name, fields }
 * @returns a sample output object, or null when the host did not say what the
 *          screen holds — then it is typed, as any other step's is.
 */
export function outputOfScreen(screen) {
  var fields = screen && screen.fields
  if (!Array.isArray(fields) || !fields.length) return null

  var out = {}
  fields.forEach(function (f) {
    var name = typeof f === 'string' ? f : (f && f.name)
    if (!name) return
    out[name] = exampleForType(typeof f === 'string' ? 'text' : (f && f.type))
  })
  if (!Object.keys(out).length) return null
  // Last, so it reads as what it is: not a field on the form.
  out.recordId = 'rec_1'
  return out
}

/**
 * A stand-in value of the right SHAPE for a field type.
 *
 * The shape is the part that matters: a condition on a number has to know it
 * is comparing numbers, and a picker showing `true` beside a checkbox says
 * more than one showing `""`. The values themselves are never used at run
 * time — see the note at the top of this file.
 */
function exampleForType(type) {
  switch (type) {
    case 'number':
    case 'currency': return 0
    case 'checkbox':
    case 'switch':
    case 'boolean': return false
    case 'date': return '2026-01-31'
    case 'datetime': return '2026-01-31T09:00'
    case 'time': return '09:00'
    case 'file':
    case 'files':
    // A multi-select holds a LIST, and that is the difference between a
    // condition asking "is it this" and one asking "does it include this".
    case 'multiselect':
    case 'checkboxes': return []
    default: return ''
  }
}

/** One entry of the host's `screens`, however it was written. */
export function screenEntry(screens, key) {
  return (screens || [])
    .map(function (sc) { return typeof sc === 'string' ? { key: sc, name: sc } : sc })
    .find(function (sc) { return sc && sc.key === key }) || null
}

/**
 * CHOOSING A SCREEN, as a patch to the step.
 *
 * Both halves at once, because they are one decision: which screen it shows,
 * and what it therefore hands back. Returning a patch rather than mutating
 * keeps this testable and keeps the canvas a drawing.
 */
export function applyScreen(step, screen) {
  var patch = { values: Object.assign({}, step && step.values, { screen: screen ? screen.key : '' }) }
  var sample = outputOfScreen(screen)
  // Only when the screen says what it holds: a host that gave names alone
  // leaves the example to be typed, and a re-pick must not wipe what somebody
  // typed there.
  if (sample) patch.sampleOutput = sample
  return patch
}

/**
 * A FIELD ADDED TO A FORM APPEARS IN EVERY STEP THAT SHOWS IT.
 *
 * The whole reason a screen's output is derived rather than typed: add
 * `assignee` to the Task form and every step showing Task hands it on, so
 * every step after those can pick it — without anybody reopening them.
 *
 * Returns only what CHANGED, so the caller can leave the rest of the workflow
 * alone: [{ index, sampleOutput }].
 *
 * A step whose screen the host did not describe is not touched — there is
 * nothing to derive, and its sample is somebody's own typing.
 */
export function syncScreenOutputs(steps, screens, screenAction) {
  var out = []
  ;(steps || []).forEach(function (step, index) {
    if (!step || step.actionName !== screenAction) return
    var key = step.values && step.values.screen
    if (!key) return
    var derived = outputOfScreen(screenEntry(screens, key))
    if (!derived) return
    if (JSON.stringify(derived) !== JSON.stringify(step.sampleOutput || null)) {
      out.push({ index: index, sampleOutput: derived })
    }
  })
  return out
}

/** What a picker offers from the flow's own input, with its example. */
export function startReferences(params) {
  return (params || [])
    .filter(function (p) { return p && p.name })
    .map(function (p) {
      return {
        token: 'params.' + p.name,
        name: p.name,
        type: p.type || 'string',
        example: p.example === undefined ? null : p.example
      }
    })
}
