// Which parameters an action actually asks for, and how they are laid out.
//
// An action's inputSchema is a flat list, and drawn flat it is a wall: email-send
// declares 13 inputs, db-move 16. Almost none of them are the question. Two
// declarations in the schema cut that down, and this module is the one place
// that interprets them — the design file draws what it is handed.
//
//   showWhen  a BRANCH. The field is not asked at all right now. Choosing a
//             stored template means there is no subject to write, so the
//             subject box does not exist rather than sitting there inviting a
//             value that would be discarded.
//
//   group     a TAIL. The field is always legitimate, just rarely wanted. cc,
//             bcc, reply-to, batch size — real inputs, and none of them what
//             you opened the drawer for. Same group name → one collapsible
//             section.
//
// Both are LAYOUT ONLY. @xeplr/schema-handler's applySchema ignores them and
// validates every declared field the same way, which is the point: what the
// server accepts must not depend on which sections somebody had open.
//
// Pure logic, no React — see the MVC note in the workspace CLAUDE.md.

/**
 * Is this field asked for, given what is currently filled in?
 *
 * A field can declare `showWhen: { field, equals }` or `{ field, isSet }` and
 * only appear once that holds — so an email step asks "use your own mail
 * server?" and shows the host/user/password box ONLY if you say yes. Without
 * this the form asks every question every time.
 */
export function visibleWhen(field, values) {
  var rule = field.showWhen
  if (!rule || !rule.field) return true
  var current = values ? values[rule.field] : undefined
  if ('equals' in rule) {
    // Loose on purpose: an unset boolean is `undefined` here but `false` in
    // the rule, and those mean the same thing to a person.
    if (rule.equals === true) return current === true || current === 'true'
    if (rule.equals === false) return !(current === true || current === 'true')
    return current === rule.equals
  }
  // `isSet` is for "shown only once something has been chosen" — picking an
  // email template hides subject/html, because the template supplies them and
  // leaving both on screen invites filling in a subject that gets discarded.
  if ('isSet' in rule) {
    var filled = current !== undefined && current !== null && current !== ''
    return rule.isSet ? filled : !filled
  }
  return true
}

/**
 * Has somebody actually put something here?
 *
 * Compared against the field's own default rather than just emptiness, so a
 * checkbox that was ticked and unticked again reads as untouched. Otherwise
 * every group holding a boolean would spring open the moment you looked at it.
 */
export function hasValue(field, values) {
  var v = values ? values[field.name] : undefined
  if (v === undefined || v === null || v === '') return false
  if (field.default !== undefined && v === field.default) return false
  // A boolean left off is the same as never set, whether it reached here as
  // `false` or as the string a <select> would have produced.
  if (field.type === 'boolean' && (v === false || v === 'false')) return false
  return true
}

/**
 * Lay a schema out for the step editor.
 *
 * Returns a flat list of ROWS in schema order, each either a lone field or a
 * collapsible group:
 *
 *   { kind: 'field', field }
 *   { kind: 'group', name, fields: [...], open: boolean }
 *
 * Fields hidden by `showWhen` are gone entirely — not passed through as an
 * empty group, which is why a group whose every member is currently branched
 * away leaves no stray header behind.
 *
 * A group's position is where its FIRST member appears, so a schema can
 * interleave grouped and ungrouped fields and still control the reading order
 * by `order` alone. Members are gathered from the whole schema, not just a
 * run of adjacent entries — the group name is the grouping, not adjacency.
 *
 * @param {object[]} schema   the action's inputSchema
 * @param {object}   values   current draft values, for showWhen and openness
 * @param {function} hasError (fieldName) => boolean — see `open` below
 */
export function layoutParams(schema, values, hasError) {
  var rows = []
  var byGroup = {}

  ;(schema || []).forEach(function(f) {
    if (!f || !f.name) return
    if (!visibleWhen(f, values)) return
    if (!f.group) { rows.push({ kind: 'field', field: f }); return }
    if (!byGroup[f.group]) {
      byGroup[f.group] = { kind: 'group', name: f.group, fields: [], open: false }
      rows.push(byGroup[f.group])
    }
    byGroup[f.group].fields.push(f)
  })

  // WHEN A GROUP STARTS OPEN. A collapsed section that is hiding something the
  // user has to deal with is worse than no collapsing at all — they are being
  // asked to guess which header the problem is behind. So:
  //
  //   required  — the form cannot be saved without it, so do not make finding
  //               it a step. (Usually means the group was named badly, but the
  //               form should degrade to "visible" rather than to "stuck".)
  //   filled    — reopening a step must show what that step is actually doing.
  //               A cc that was set six weeks ago is not a detail to hide.
  //   erroring  — the message says "cc: Unexpected token" and cc is three
  //               clicks away. Open it.
  //
  // Everything else starts shut, which is the whole point.
  Object.keys(byGroup).forEach(function(name) {
    var g = byGroup[name]
    g.open = g.fields.some(function(f) {
      return f.required || hasValue(f, values) || (hasError && hasError(f.name))
    })
  })

  return rows
}

/**
 * The fields an action is asking for right now, flat — every visible field,
 * grouped or not, collapsed or not.
 *
 * Save uses this rather than the raw schema. A field branched away by
 * `showWhen` must not be submitted: type a subject, then pick a template, and
 * that subject is no longer part of what this step does — keeping it would
 * leave the step carrying a value it does not use, that nothing displays, and
 * that quietly reappears the day the template is cleared.
 *
 * Collapsed is NOT hidden: a group's fields are all here. Openness is a
 * drawing decision and must not change what gets saved.
 */
export function askedFields(schema, values) {
  return (schema || []).filter(function(f) {
    return f && f.name && visibleWhen(f, values)
  })
}

// ── what the STEPS ask the caller for ───────────────────────────────────
//
// A step declares what it needs supplied when the run starts — `workflow_steps.
// params`, the same field shape as an action's inputSchema — and the run's
// schema is the UNION of every step's declaration. Declared on the step
// because the step is where you find out you need it: you are binding
// `{params.customerEmail}` into an email-send's `to`, and that is the moment
// to say so. See @xeplr/workflow's migrations/0011_workflow_steps_params.sql.
//
// One schema vocabulary at both levels, so the engine validates a run's params
// with the same applySchema that validates a step's input against its action.

/**
 * Turn a DECLARATION (a list of fields) into a SAMPLE VALUE OBJECT, which is
 * what the reference picker needs.
 *
 * These are two different things and conflating them is the bug this function
 * exists to prevent: `referencesFor` runs flattenPaths over what it is given,
 * so handing it the declaration array directly yields `{params.0.name}` and
 * `{params.0.type}` — tokens that look plausible and resolve to nothing.
 *
 * The preview value is `sample` if the declaration carries one, then `default`,
 * then a stand-in for the type. `sample` is worth filling in for the same
 * reason a step's sample output is: it turns the picker from a list of names
 * you must already know into a list you can recognise — `cus_8812` beside
 * `customerId` settles what the field is without leaving the drawer.
 */
export function paramSamples(declared) {
  var out = {}
  ;(declared || []).forEach(function(f) {
    if (!f || !f.name) return
    if (f.sample !== undefined) { out[f.name] = f.sample; return }
    if (f.default !== undefined) { out[f.name] = f.default; return }
    out[f.name] = PLACEHOLDER[f.type] === undefined ? 'text' : PLACEHOLDER[f.type]
  })
  return out
}

var PLACEHOLDER = {
  string: 'text', number: 0, boolean: false,
  date: '2026-01-01', array: [], object: {}
}

/**
 * The types a workflow param can be declared as — the same set
 * @xeplr/schema-handler's check() knows about, because the engine validates a
 * run's params with the very same applySchema that validates a step's input.
 * Offering a type here that check() cannot test would declare a constraint
 * nothing enforces.
 */
export var PARAM_TYPES = ['string', 'number', 'boolean', 'date', 'array', 'object']

/** A new, empty declaration row. `order` is positional and rewritten on save. */
export function blankParam(order) {
  return { name: '', type: 'string', required: false, order: order || 1 }
}

/**
 * Check a declaration before it is saved onto the workflow.
 *
 * Returns { [index]: message }. Two rules, both of which produce silent
 * nonsense rather than an error if they get through:
 *
 *   a blank name    applySchema skips fields with no name, so the row is
 *                   simply ignored — you declare a required param, the run
 *                   does not ask for it, and nothing anywhere says why.
 *
 *   a duplicate     the later one wins in the values object while BOTH are
 *                   validated, so a row can be required, invisible, and
 *                   permanently unsatisfiable.
 *
 * Names are also the binding token — `{params.<name>}` — so a space or a dot
 * in one produces a token that cannot resolve.
 */
export function validateDeclaration(declared) {
  var errors = {}
  var seen = {}
  ;(declared || []).forEach(function(f, i) {
    var name = (f && f.name ? f.name : '').trim()
    if (!name) { errors[i] = 'Needs a name'; return }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      errors[i] = 'Letters, digits and _ only — it becomes {params.' + name + '}'
      return
    }
    if (seen[name]) { errors[i] = 'Already declared above'; return }
    seen[name] = true
  })
  return errors
}


/**
 * The run's parameter schema: the union of every step's declaration.
 *
 * MIRRORS workflowRunner's collectParams, which is the authority — this copy
 * exists so the builder's { } picker can offer a parameter the moment it is
 * declared, without a round trip. The rules are its rules: required anywhere
 * makes it required, and otherwise the first declaration by step order wins,
 * so two steps disagreeing about a type resolve the same way here as there.
 *
 * `workflowParams` is folded in first when present — workflows that declared
 * at the workflow level before steps could carry it keep working.
 */
export function collectDeclarations(steps, workflowParams) {
  var byName = {}
  var order = []

  function fold(declared) {
    ;(Array.isArray(declared) ? declared : []).forEach(function(f) {
      if (!f || !f.name) return
      if (!byName[f.name]) { byName[f.name] = { ...f }; order.push(f.name); return }
      if (f.required) byName[f.name].required = true
    })
  }

  fold(workflowParams)
  ;(steps || []).forEach(function(step) { fold(step && step.params) })

  return order.map(function(name, i) { return { ...byName[name], order: i + 1 } })
}


// ── typing a value into a cell ──────────────────────────────────────────

// A binding token: {params.email}, {previous_step.output.id}, {resumeKey}.
// Distinguishable from a JSON object because JSON's first character inside the
// brace is a quote, never an identifier.
var TOKEN = /\{[A-Za-z_][\w.]*\}/

/**
 * Turn what somebody typed into a cell into the value to store.
 *
 * Only `array` and `object` fields need this: the grid is one text box per
 * field, and those two are the ones whose text has to become something else.
 *
 * The rules, in order, and the order is the whole design:
 *
 *   1. HOLDS A TOKEN → keep the raw string. It is a template, not a value:
 *      the engine interpolates it at run time and @xeplr/actions' runAction
 *      wraps the result for an array field. Parsing it here would mean
 *      `to = {params.email}` had to be typed as `["{params.email}"]`, which
 *      is the single most common thing anyone will ever bind.
 *
 *   2. STARTS WITH [ OR { → JSON, and a syntax error is reported as one.
 *      Somebody writing `[{ "filename": "a.pdf" }]` means it literally.
 *
 *   3. ARRAY, PLAIN TEXT → split on commas. `a@b.com, c@d.com` is what a
 *      person types for a list of two, and demanding JSON brackets for it is
 *      the reason `to` was unusable.
 *
 *   4. OBJECT, PLAIN TEXT → a real error. There is no honest guess at the
 *      shape somebody meant, so say so rather than store something wrong.
 *
 * Returns { value } or { error }.
 */
export function parseCellValue(field, raw) {
  if (typeof raw !== 'string') return { value: raw }
  var type = field && field.type
  if (type !== 'array' && type !== 'object') return { value: raw }

  var text = raw.trim()
  if (text === '') return { value: raw }
  if (TOKEN.test(text)) return { value: raw }

  if (text[0] === '[' || text[0] === '{') {
    try { return { value: JSON.parse(text) } } catch (err) { return { error: err.message } }
  }

  if (type === 'array') {
    var items = text.split(',').map(function(v) { return v.trim() }).filter(function(v) { return v !== '' })
    return { value: items }
  }

  return { error: 'Needs to be JSON — e.g. { "host": "smtp.example.com" }' }
}


/**
 * The inverse of parseCellValue: a STORED value, as text to edit.
 *
 * Needed because a step reopened from the database carries real arrays and
 * objects, and React renders those into a textarea by calling toString — an
 * array of attachment descriptors becomes the literal text
 * "[object Object]", and saving again writes that string back over the real
 * value. The damage is silent and total.
 *
 * Chosen to ROUND-TRIP through parseCellValue, which is the only property that
 * matters here: open a step, touch nothing, save, and the stored value must be
 * what it was.
 *
 *   array of scalars   joined with ", " — `to` reads as the list of addresses
 *                      it is, and splits back into the same array.
 *   anything deeper    pretty JSON, which parseCellValue routes to JSON.parse
 *                      because it starts with [ or {.
 */
export function formatCellValue(field, value) {
  if (value === undefined || value === null) return ''
  var type = field && field.type
  if (type !== 'array' && type !== 'object') {
    return typeof value === 'string' ? value : String(value)
  }
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    var allScalar = value.every(function(v) {
      return v === null || (typeof v !== 'object' && typeof v !== 'undefined')
    })
    // A scalar list only survives the join if no element contains the comma
    // that would split it back apart differently.
    var commaFree = value.every(function(v) { return String(v).indexOf(',') === -1 })
    if (allScalar && commaFree) return value.join(', ')
  }
  return JSON.stringify(value, null, 2)
}
