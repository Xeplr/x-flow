import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import { compileCondition, conditionToText, referencesFor, conditionFieldsFor } from '../conditions.js'
import { layoutParams, askedFields, paramSamples, collectDeclarations, parseCellValue, formatCellValue, PARAM_TYPES, blankParam, validateDeclaration } from '../paramGroups.js'
import { lastStepOutput, tryStep } from '../api/workflows.js'
import { XeplrCanvas } from '@xeplr/ui-canvas'
import './workflow.css'
import './workflowCanvas.css'

var NODE_W = 220
var NODE_H = 74

function defaultLayout(index) {
  return { x: 60 + index * 280, y: 100 }
}

// The canvas addresses steps by id. A step not saved yet has none, so it goes
// by its position — the same thing its React key always was.
function stepItemId(entry) {
  return entry.step.id || 'new-' + entry.index
}

// Steps → boxes on the shared canvas (@xeplr/ui-canvas).
function buildItems(visibleSteps) {
  return visibleSteps.map((entry) => {
    var layout = entry.step.layout || defaultLayout(entry.index)
    return { id: stepItemId(entry), x: layout.x, y: layout.y, w: NODE_W, h: NODE_H, entry: entry }
  })
}

// One edge per outgoing transition — an explicit transition row, or (when a
// step has none) the old implicit "advance by position" default, which
// visually is just a connection to the next visible step. A transition
// targeting end_success/end_failed has no node to point at, so it gets a
// short stub (toOffset) to a floating pill instead.
function buildEdges(visibleSteps) {
  var byKey = {}
  visibleSteps.forEach((entry) => { if (entry.step.stepKey) byKey[entry.step.stepKey] = stepItemId(entry) })

  var edges = []
  visibleSteps.forEach((entry, i) => {
    var id = stepItemId(entry)
    var transitions = entry.step.transitions || []

    if (!transitions.length) {
      var next = visibleSteps[i + 1]
      if (next) edges.push({ id: id + '-next', from: id, to: stepItemId(next) })
      return
    }

    transitions.forEach((t, ti) => {
      var variant = t.mode === 'each' ? 'dashed' : null
      if (t.target === 'end_success' || t.target === 'end_failed') {
        edges.push({
          id: id + '-t' + ti, from: id, variant: variant,
          toOffset: { x: 130, y: (ti - (transitions.length - 1) / 2) * 36 },
          className: 'wf-connector-end',
          end: t.target
        })
        return
      }
      var target = byKey[t.target]
      if (!target) return
      edges.push({ id: id + '-t' + ti, from: id, to: target, variant: variant })
    })
  })
  return edges
}

// The Success/Failed pill at the end of a stub. Positioned from the edge's
// live end point, so it follows its step while it is dragged.
function renderEndMarker(edge, points) {
  if (!edge.end) return null
  return (
    <div
      className={'wf-end-marker ' + (edge.end === 'end_success' ? 'wf-end-marker-success' : 'wf-end-marker-failed')}
      style={{ left: points.to.x, top: points.to.y }}
    >
      {edge.end === 'end_success' ? 'Success' : 'Failed'}
    </div>
  )
}

function StepNode({ entry, selected }) {
  var step = entry.step
  var index = entry.index

  return (
    <div className={'wf-node' + (step.kind === 'wait' ? ' wf-node-wait' : '') + (selected ? ' wf-node-selected' : '')}>
      <div className="wf-node-head">
        <span>{step.name || step.stepKey || 'Step ' + (index + 1)}</span>
        <span className={'wf-node-badge' + (step.kind === 'wait' ? ' wf-node-badge-wait' : '')}>{step.kind}</span>
      </div>
      <div className="wf-node-body">
        {/* A SCREEN STEP SAYS WHICH SCREEN, not which action. Every step of a
            flow names the same action (screen-show), so printing it on all of
            them tells a reader nothing and hides the one fact that differs.
            Read off the step's own values rather than passed in, because this
            node is drawn from the step and nothing else. */}
        {step.actionName === 'screen-show'
          ? <span className="wf-node-action">{(step.values && step.values.screen) || 'no screen chosen'}</span>
          : step.actionName
            ? <span className="wf-node-action">{step.actionName}</span>
            : <span className="wf-node-empty-action">No action chosen</span>}
      </div>
    </div>
  )
}

// The sample-output box is parsed on every keystroke to keep the condition
// picker live, so a half-typed edit is expected rather than exceptional —
// it just means "no fields to offer yet", never a crash.
function safeParse(text) {
  try { return JSON.parse(text || '{}') } catch (_) { return {} }
}

// visibleWhen / layoutParams / askedFields live in ../paramGroups.js — which
// fields an action is asking for is logic, not drawing, and this file draws
// what it is handed. See the MVC note in the workspace CLAUDE.md.

// A picker of the references in scope, opened from the { } button beside a
// field. It exists because the alternative is remembering — the binding
// syntax AND the field names of every earlier step. Each entry shows the
// sample value next to the token, so you can tell `id` from `userId` without
// leaving the drawer.
function RefMenu({ groups, onPick, onClose }) {
  if (!groups.length) {
    return (
      <div className="wf-ref-menu">
        <p className="wf-ref-empty">
          Nothing to reference yet — add a sample output to an earlier step and its
          fields appear here.
        </p>
      </div>
    )
  }
  return (
    <div className="wf-ref-menu">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="wf-ref-heading">{g.label}</div>
          {g.items.map((item) => (
            <button
              key={item.token}
              type="button"
              className="wf-ref-item"
              onClick={() => { onPick(item.token); onClose() }}
            >
              <span className="wf-ref-name">{item.name}</span>
              <span className="wf-ref-preview">{item.preview}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// One ROW per declared input, built from the ACTION'S OWN inputSchema — the
// same schema runAction validates against on the server. That is the point of
// generating rather than hand-writing this form: a field list maintained here
// would be a second description of the action, and the day the two disagree
// the form collects something the action ignores.
//
// A RULED GRID, not a stack of labelled boxes and not boxes inside a table.
// email-send declares thirteen inputs and db-move sixteen; as labelled boxes
// each one cost three lines before anything was typed, and the shape of the
// message was somewhere inside the scroll. Here the cell border IS the field
// boundary — the controls are transparent and borderless, so a row is one
// ruled line you type into rather than a bordered input floating inside a
// bordered row. That is most of the density, and all of the calm.
//
// DESCRIPTIONS ARE ON DEMAND for the same reason. They are worth having — they
// are the only place that says a bare string is accepted for `to` — but
// printed under all thirteen at once they are wallpaper, and wallpaper is what
// people learn to skip. Behind ⓘ they get read.
//
// Emits CELLS, not a wrapper: the whole block is one grid, so every column
// line runs unbroken from the header to the last group. Nested grids would let
// each section pick its own width, which is the thing that makes a generated
// form look generated.
function ParamRow({ field, value, error, onChange, onInsert, onCaret, onZoom, openRef, setOpenRef, openHelp, setOpenHelp, refGroups }) {
  var refKey = 'param:' + field.name
  var isRefOpen = openRef === refKey
  var isHelpOpen = openHelp === field.name
  var placeholder = field.default !== undefined
    ? JSON.stringify(field.default)
    : (field.required ? 'required' : '')

  // No reference button on a fixed choice or a checkbox — a binding token
  // would never be one of the allowed options, so offering it only invites a
  // value the server will reject.
  var fixed = field.type === 'boolean' || (field.options && field.options.length)

  // onSelect fires on clicks, arrow keys and drags alike, so this stays
  // current without a keystroke handler of its own.
  function caret(e) {
    if (onCaret) onCaret(field.name, e.target.selectionStart, e.target.selectionEnd)
  }

  var control
  if (field.options && field.options.length) {
    // `options` is the schema layer's own constraint (see
    // @xeplr/schema-handler's validate.js) — the server REJECTS anything not
    // in this list, so rendering it as a free-text box would just let people
    // type a value that is guaranteed to fail.
    control = (
      <select className="wf-cell-input" value={value === '' ? (field.default == null ? '' : field.default) : value} onChange={(e) => onChange(e.target.value)}>
        {field.default === undefined && <option value="">— choose —</option>}
        {field.options.map((o) => {
          var val = o && typeof o === 'object' ? o.value : o
          var label = o && typeof o === 'object' ? (o.label || o.value) : o
          return <option key={val} value={val}>{label}</option>
        })}
      </select>
    )
  } else if (field.type === 'boolean') {
    // A real checkbox, not a true/false dropdown. A yes/no question should
    // read as one — and this is also what makes "tick it and the connection
    // row appears" feel like one decision rather than three.
    control = (
      <input
        type="checkbox"
        className="wf-cell-check"
        checked={value === true || value === 'true'}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={field.name}
      />
    )
  } else if (field.type === 'object' || field.type === 'array') {
    // Typed as JSON, so it gets a monospace box that can be dragged taller.
    // Still borderless: it is a tall cell, not a widget sitting in one.
    control = <textarea className="wf-cell-input wf-cell-json" rows={2} value={value} onChange={(e) => onChange(e.target.value)} onSelect={caret} onBlur={caret} placeholder={placeholder} />
  } else {
    control = <input className="wf-cell-input" value={value} onChange={(e) => onChange(e.target.value)} onSelect={caret} onBlur={caret} placeholder={placeholder} />
  }

  return (
    <>
      <div className={'wf-cell wf-cell-key' + (error ? ' is-bad' : '')}>
        <span className="wf-cell-name">{field.label || field.name}</span>
        {field.required && <span className="wf-req" title="Required">*</span>}
        {field.type && <span className="wf-cell-type">{field.type}</span>}
        {/* `title` as well as the toggle, so a pointer gets the answer without
            a click and a keyboard or touch user still has one. */}
        {field.description && (
          <button
            type="button"
            className={'wf-help-btn' + (isHelpOpen ? ' is-on' : '')}
            title={field.description}
            aria-expanded={isHelpOpen}
            aria-label={'What is ' + field.name + '?'}
            onClick={() => setOpenHelp(isHelpOpen ? null : field.name)}
          >i</button>
        )}
      </div>
      {/* Double-click opens the value in a lens. Not on a checkbox or a fixed
          choice — there is nothing to compose in either, and a double-click on
          a checkbox is two toggles, which would leave it where it started and
          look like nothing happened. */}
      <div
        className={'wf-cell wf-cell-val' + (error ? ' is-bad' : '') + (fixed ? '' : ' is-zoomable')}
        onDoubleClick={fixed ? undefined : (e) => onZoom(field.name, e.currentTarget.getBoundingClientRect())}
        title={fixed ? undefined : 'Double-click to open in a larger editor'}
      >
        {control}
        {!fixed && (
          <button
            type="button"
            className="wf-ref-btn"
            onClick={() => setOpenRef(isRefOpen ? null : refKey)}
            aria-label={'Insert a reference into ' + field.name}
            title="Insert a reference"
          >{'{ }'}</button>
        )}
        {isRefOpen && <RefMenu groups={refGroups} onPick={onInsert} onClose={() => setOpenRef(null)} />}
      </div>
      {isHelpOpen && <div className="wf-cell wf-cell-note">{field.description}</div>}
      {error && <div className="wf-cell wf-cell-note is-bad">{error}</div>}
    </>
  )
}

// ONE VALUE, POPPED OUT AND MADE WRITABLE.
//
// The grid buys its density by giving every value one short line, which is
// right for `{params.email}` and hopeless for an html body or a connection
// object — you end up composing a paragraph through a letterbox. Double-click
// the cell and it opens here at a size you can actually work in.
//
// Follows @xeplr/ui-table's CellZoom in behaviour — grows out of the cell it
// came from so the eye does not lose its place, Escape or a click outside
// dismisses — but is NOT that component: CellZoom renders a TanStack cell
// through its column's renderer and is deliberately read-only, "a reading aid,
// not a task". This one is the task.
//
// Two deliberate divergences from it:
//
//   scrolling does NOT close it. CellZoom gets out of the way rather than
//   chase its cell, which is right for reading and intolerable while typing.
//
//   there is nothing to commit. Edits go straight into the same draft the
//   grid writes to, so closing is just closing — Cancel on the drawer still
//   walks away from everything, exactly as before.
//
// The references are laid out FLAT here rather than behind the { } button.
// There is room, and the whole point of the picker is that binding should be
// a click; making it a click inside a menu inside a popup is not that.
function CellLens({ field, value, anchorRect, refGroups, onChange, onInsert, onCaret, onClose }) {
  var boxRef = useRef(null)
  var areaRef = useRef(null)

  // Positioned after render, once the box's real size is known.
  useLayoutEffect(() => {
    var box = boxRef.current
    if (!box || !anchorRect) return
    var margin = 8
    var rect = box.getBoundingClientRect()
    var left = anchorRect.left
    var top = anchorRect.top
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin
    box.style.left = Math.max(margin, left) + 'px'
    box.style.top = Math.max(margin, top) + 'px'
    if (areaRef.current) {
      areaRef.current.focus()
      // Caret to the END rather than selecting everything: this is opened to
      // keep working on a value, and a select-all means the first keystroke
      // destroys it.
      var len = areaRef.current.value.length
      areaRef.current.setSelectionRange(len, len)
    }
  }, [anchorRect])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    function onPointer(e) { if (boxRef.current && !boxRef.current.contains(e.target)) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [onClose])

  var isJson = field.type === 'object' || field.type === 'array'

  return (
    <div ref={boxRef} className="wf-lens" role="dialog" aria-label={'Edit ' + field.name}>
      <div className="wf-lens-head">
        <span className="wf-lens-name">{field.name}</span>
        {field.required && <span className="wf-req" title="Required">*</span>}
        <span className="wf-cell-type">{field.type}</span>
        <button type="button" className="wf-close-btn wf-lens-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {field.description && <p className="wf-lens-help">{field.description}</p>}

      <textarea
        ref={areaRef}
        className={'wf-lens-area' + (isJson ? ' is-json' : '')}
        rows={isJson ? 10 : 7}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={(e) => onCaret(field.name, e.target.selectionStart, e.target.selectionEnd)}
        placeholder={isJson ? '{ }' : ''}
      />

      <div className="wf-lens-refs">
        <div className="wf-lens-refs-title">Insert a reference</div>
        {!refGroups.length ? (
          <p className="wf-ref-empty">
            Nothing to reference yet — declare a step input above, or add a sample
            output to an earlier step.
          </p>
        ) : refGroups.map((g) => (
          <div key={g.label}>
            <div className="wf-ref-heading">{g.label}</div>
            <div className="wf-lens-chips">
              {g.items.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  className="wf-lens-chip"
                  title={item.preview}
                  onClick={() => onInsert(item.token)}
                >{item.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// A collapsed tail of always-legitimate options — cc, reply-to, batch size.
// Real inputs, none of them what you opened the drawer for. Drawn as a ruled
// row spanning both columns, with the member count on it: a shut section with
// no number is a section nobody opens.
function ParamGroupHeader({ name, count, open, onToggle }) {
  return (
    <button
      type="button"
      className={'wf-cell wf-cell-group' + (open ? ' is-open' : '')}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="wf-cell-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span className="wf-cell-group-name">{name}</span>
      <span className="wf-cell-count">{count}</span>
    </button>
  )
}

// THIS STEP'S INPUTS — what it needs the CALLER to supply when the run starts.
//
// Two different grids sit in this drawer and the difference is the hierarchy
// the drawer is arranged around:
//
//   Step   → what this step is, and what it needs supplied from outside.
//            THIS grid EDITS a schema.
//   Action → the action it calls, and the arguments passed to it.
//            That grid FILLS IN a schema — the action's own.
//
// Declared here rather than on the workflow because here is where you find out
// you need it: you are typing {params.customerId} into `to` and there is no
// such parameter. Sending somebody to another screen to declare it, and back,
// is three navigations to add one row — and the row you came to add is the one
// you are most likely to mistype once you have lost sight of the field it was
// for. Deleting the step deletes the requirement with it, which a separate
// workflow-level list cannot do.
//
// The run's schema is the UNION of every step's declaration (see
// workflowRunner's collectParams), so a parameter declared here is bindable
// from any step — and IMMEDIATELY, because the picker reads the draft rather
// than the saved workflow.
function StepParamsGrid({ declared, errors, expanded, setExpanded, onChange }) {
  function patch(i, key, value) {
    onChange(declared.map((f, n) => (n === i ? { ...f, [key]: value } : f)))
  }
  function remove(i) {
    onChange(declared.filter((_, n) => n !== i))
  }

  return (
    <div className="wf-decl">
      <div className="wf-decl-head">Name</div>
      <div className="wf-decl-head">Type</div>
      <div className="wf-decl-head wf-decl-mid" title="Required — the run is refused without it">Req</div>
      <div className="wf-decl-head" />

      {declared.map((f, i) => (
        <Fragment key={i}>
          <div className={'wf-decl-cell' + (errors[i] ? ' is-bad' : '')}>
            <input
              className="wf-cell-input"
              value={f.name || ''}
              onChange={(e) => patch(i, 'name', e.target.value)}
              placeholder="customerId"
              aria-label={'Parameter ' + (i + 1) + ' name'}
            />
          </div>
          <div className={'wf-decl-cell' + (errors[i] ? ' is-bad' : '')}>
            <select className="wf-cell-input" value={f.type || 'string'} onChange={(e) => patch(i, 'type', e.target.value)} aria-label="Type">
              {PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className={'wf-decl-cell wf-decl-mid' + (errors[i] ? ' is-bad' : '')}>
            <input
              type="checkbox"
              className="wf-cell-check"
              checked={Boolean(f.required)}
              onChange={(e) => patch(i, 'required', e.target.checked)}
              aria-label={'Is ' + (f.name || 'this parameter') + ' required'}
            />
          </div>
          <div className={'wf-decl-cell wf-decl-mid' + (errors[i] ? ' is-bad' : '')}>
            {/* Default, sample and description are real but rarely touched —
                the same tail-vs-branch split the action grids use. */}
            <button
              type="button"
              className={'wf-help-btn' + (expanded === i ? ' is-on' : '')}
              onClick={() => setExpanded(expanded === i ? null : i)}
              aria-expanded={expanded === i}
              aria-label={'More options for ' + (f.name || 'this parameter')}
            >{expanded === i ? '\u2212' : '+'}</button>
          </div>

          {errors[i] && <div className="wf-cell-note is-bad wf-decl-span">{errors[i]}</div>}

          {expanded === i && (
            <div className="wf-decl-span wf-decl-more">
              <label>
                <span>Default</span>
                <input
                  value={f.default == null ? '' : f.default}
                  onChange={(e) => patch(i, 'default', e.target.value === '' ? undefined : e.target.value)}
                  placeholder="used when the caller omits it"
                />
              </label>
              <label>
                {/* Not sent anywhere and not validated — it exists so the { }
                    picker can show `cus_8812` beside `customerId`, which is
                    what turns a list of names you must already know into one
                    you can recognise. */}
                <span>Sample</span>
                <input
                  value={f.sample == null ? '' : f.sample}
                  onChange={(e) => patch(i, 'sample', e.target.value === '' ? undefined : e.target.value)}
                  placeholder="shown in the { } picker"
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  value={f.description || ''}
                  onChange={(e) => patch(i, 'description', e.target.value || undefined)}
                  placeholder="what a caller needs to know"
                />
              </label>
              <button type="button" className="wf-link-danger wf-decl-remove" onClick={() => remove(i)}>
                Remove this parameter
              </button>
            </div>
          )}
        </Fragment>
      ))}

      <button
        type="button"
        className="wf-decl-add wf-decl-span"
        onClick={() => onChange(declared.concat(blankParam(declared.length + 1)))}
      >+ Add a parameter</button>
    </div>
  )
}

// EVERY block in the drawer collapses, not just the parameter groups. A step
// editor shows five separate concerns — identity, action, parameters, routing,
// sample output — and a drawer that renders all five expanded is a scroll,
// which is the thing that made it feel heavy however tight the rows got.
// Collapsing the group tail inside Parameters did nothing for the three
// sections below it.
//
// The count on the header is what makes a shut section safe to leave shut: a
// header that says nothing about what is behind it is one you have to open to
// rule out.
function DrawerSection({ title, count, hint, open, onToggle, children }) {
  return (
    <div className={'wf-sec' + (open ? ' is-open' : '')}>
      <button type="button" className="wf-sec-head" aria-expanded={open} onClick={onToggle}>
        <span className="wf-sec-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="wf-sec-title">{title}</span>
        {hint && !open && <span className="wf-sec-hint">{hint}</span>}
        {count != null && <span className="wf-sec-count">{count}</span>}
      </button>
      {open && <div className="wf-sec-body">{children}</div>}
    </div>
  )
}

// Every stored value rendered as the text its cell should show. Anything the
// schema does not declare is passed through untouched — switching action must
// not silently reshape a binding the other action was using.
function textValues(schema, stored) {
  var byName = {}
  schema.forEach((f) => { byName[f.name] = f })
  var out = {}
  Object.keys(stored).forEach((name) => {
    out[name] = byName[name] ? formatCellValue(byName[name], stored[name]) : stored[name]
  })
  return out
}

// The drawer edits a local DRAFT, committed on Save — an in-progress,
// not-yet-valid JSON edit must not corrupt the real step, and a Cancel must
// be able to walk away from everything typed since opening. Stops its own
// clicks from reaching the backdrop, which is what actually closes it.
function StepDrawer({ entry, actions, steps, workflowId, workflowParams, onSave, onCancel, onDelete }) {
  var step = entry.step
  var index = entry.index
  var [draft, setDraft] = useState(null)
  var [errors, setErrors] = useState({})
  var [openRef, setOpenRef] = useState(null)
  var [openHelp, setOpenHelp] = useState(null)
  // Only the groups somebody has TOGGLED BY HAND, name → boolean. Everything
  // else falls through to layoutParams' own answer, which depends on what is
  // filled in and therefore changes as you type. Storing the default here
  // instead would freeze whatever was true when the drawer opened.
  var [groupOverrides, setGroupOverrides] = useState({})
  // Which drawer sections are open. Seeded per step in the effect below rather
  // than fixed here, because "is there anything in it" is the answer that
  // decides — an empty Transitions block is worth nothing expanded.
  var [openSections, setOpenSections] = useState({})
  var [expandedParam, setExpandedParam] = useState(null)
  // A ref, not state: the caret changes on every click and keypress and none
  // of those should re-render the drawer.
  var caretRef = useRef({})
  // { name, rect } — which value is open in the lens, and the cell it grew
  // out of. Null when nothing is.
  var [lens, setLens] = useState(null)
  var backdropGuard = useRef(false)
  // null | 'last' | 'live' — which fetch is in flight, so each button can
  // show its own progress rather than both going dead together.
  var [sampling, setSampling] = useState(null)
  var [sampleNote, setSampleNote] = useState(null)
  var [confirmLive, setConfirmLive] = useState(false)

  useEffect(() => {
    // Resolved here rather than reusing `action` below: this effect runs on
    // open, and the value it needs is the schema of the action the STEP names.
    var action0 = actions.find((a) => a.name === step.actionName)
    setDraft({
      stepKey: step.stepKey || '',
      name: step.name || '',
      actionName: step.actionName || '',
      kind: step.kind || 'auto',
      onError: step.onError || 'stop',
      // Each declared input gets its own draft entry. Anything not in the
      // action's schema is preserved in `extraValues` rather than dropped —
      // switching action must not silently delete what was already bound.
      // Stored values become TEXT to edit — see formatCellValue. Without this
      // a saved array of attachment descriptors renders into its textarea as
      // "[object Object]", and the next save writes that string back over the
      // real value.
      values: textValues((action0 && action0.inputSchema) || [], step.values || {}),
      // Conditions are edited as formula TEXT and compiled on save; see
      // ../conditions.js for why that is the same package the engine runs.
      transitions: (step.transitions || []).map((t) => ({
        _id: Math.random().toString(36).slice(2),
        conditionText: conditionToText(t.condition),
        mode: t.mode || 'single',
        target: t.target || ''
      })),
      joinStep: step.joinStep || '',
      sampleOutputText: JSON.stringify(step.sampleOutput || {}, null, 2),
      // Copied, not referenced: the drawer's contract is that Cancel walks
      // away from everything typed since it opened, and a half-declared
      // parameter is exactly the thing that contract exists for.
      params: (step.params || []).map((f) => ({ ...f }))
    })
    setErrors({})
    setOpenRef(null)
    setOpenHelp(null)
    setGroupOverrides({})
    // Step and Parameters are why the drawer was opened. Routing and sample
    // output are worth a look only when they hold something, so they start
    // shut when they are empty and open when there is something to see.
    setExpandedParam(null)
    setLens(null)
    setOpenSections({
      step: true,
      action: true,
      transitions: (step.transitions || []).length > 0,
      sample: Boolean(step.sampleOutput && Object.keys(step.sampleOutput).length)
    })
    // Re-initialise whenever a DIFFERENT step is opened, not on every
    // keystroke of the step this drawer is already showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.step.id, entry.index])

  if (!draft) return null

  function field(key, value) { setDraft((d) => ({ ...d, [key]: value })) }

  function toggleSection(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function setValue(name, value) {
    setDraft((d) => ({ ...d, values: { ...d.values, [name]: value } }))
  }

  // WHERE THE CARET IS, not on the end. Appending is fine for an empty box and
  // useless for a subject line: "Welcome to Acme" with the cursor after
  // "Welcome" should become "Welcome {params.name} to Acme", and a picker that
  // can only produce "Welcome to Acme{params.name}" leaves you retyping the
  // thing the picker was there to save you typing.
  //
  // Falls back to appending when nothing has been focused yet, which is the
  // one case where the end IS the caret.
  function insertInto(name, token) {
    setDraft((d) => {
      var current = String(d.values[name] == null ? '' : d.values[name])
      var at = caretRef.current[name]
      var start = at && at.start != null ? Math.min(at.start, current.length) : current.length
      var end = at && at.end != null ? Math.min(at.end, current.length) : start
      var next = current.slice(0, start) + token + current.slice(end)
      // Move the remembered caret past what was just inserted, so picking two
      // tokens in a row does not put the second inside the first.
      caretRef.current[name] = { start: start + token.length, end: start + token.length }
      return { ...d, values: { ...d.values, [name]: next } }
    })
  }

  function rememberCaret(name, start, end) {
    caretRef.current[name] = { start: start, end: end }
  }

  function setTransition(id, key, value) {
    setDraft((d) => ({
      ...d,
      transitions: d.transitions.map((t) => (t._id === id ? { ...t, [key]: value } : t))
    }))
  }

  function addTransition() {
    setDraft((d) => ({
      ...d,
      transitions: d.transitions.concat({ _id: Math.random().toString(36).slice(2), conditionText: '', mode: 'single', target: '' })
    }))
  }

  function removeTransition(id) {
    setDraft((d) => ({ ...d, transitions: d.transitions.filter((t) => t._id !== id) }))
  }

  // Pulls the output this step produced the last time a real run reached it.
  // Read-only — nothing runs.
  async function fillFromLastRun() {
    setSampling('last'); setSampleNote(null)
    try {
      var last = await lastStepOutput(workflowId, draft.stepKey)
      if (!last) {
        setSampleNote({ kind: 'muted', text: 'No completed run of this step yet — run the workflow once, or use Run now.' })
      } else {
        field('sampleOutputText', JSON.stringify(last.output || {}, null, 2))
        setSampleNote({ kind: 'ok', text: 'Filled from the last run.' })
      }
    } catch (err) {
      setSampleNote({ kind: 'error', text: err.message })
    } finally { setSampling(null) }
  }

  // Executes the action FOR REAL. Only ever reached through the confirm below.
  async function runLive() {
    setConfirmLive(false); setSampling('live'); setSampleNote(null)
    try {
      var res = await tryStep(workflowId, {
        actionName: draft.actionName, stepKey: draft.stepKey, values: draft.values
      })
      if (!res) { setSampleNote({ kind: 'error', text: 'No response' }); return }
      if (res.status !== 'success') {
        // A failed try-run is nearly always a binding that resolved to
        // something unexpected, so show what was actually sent.
        setSampleNote({
          kind: 'error',
          text: (res.error && res.error.message) || 'Failed',
          input: res.input
        })
        return
      }
      field('sampleOutputText', JSON.stringify(res.output || {}, null, 2))
      setSampleNote({ kind: 'ok', text: `Ran for real in ${res.durationMs}ms — output captured.` })
    } catch (err) {
      setSampleNote({ kind: 'error', text: err.message })
    } finally { setSampling(null) }
  }

  function save() {
    var nextErrors = {}

    // Values: object/array-typed inputs are typed as JSON text, so they parse
    // here. Everything else is passed through as the string it is — an
    // interpolation like {params.email} is a string, not JSON.
    //
    // ONLY THE FIELDS THIS ACTION IS CURRENTLY ASKING FOR. A field branched
    // away by `showWhen` is not part of what this step does: type a subject,
    // then pick a template, and that subject would otherwise be saved onto the
    // step, displayed nowhere, ignored by the action — and back in force the
    // day somebody clears the template. Anything the schema does not mention
    // at all is a different case and still dropped here, as before.
    //
    // Collapsed is not hidden. A shut group's fields are asked for and
    // submitted like any other; which sections happened to be open is a
    // drawing detail and must not change what gets stored.
    var values = {}
    var schema = (action && action.inputSchema) || []
    var asked = askedFields(schema, draft.values)
    asked.forEach((spec) => {
      var raw = draft.values[spec.name]
      if (raw === '' || raw === undefined) return
      // See parseCellValue: an array field takes a bare address or a
      // comma-separated list, and a value holding a binding token is kept as
      // the template it is rather than parsed as JSON.
      var parsed = parseCellValue(spec, raw)
      if (parsed.error) { nextErrors['param:' + spec.name] = spec.name + ': ' + parsed.error; return }
      values[spec.name] = parsed.value
    })

    // A required input left empty is caught HERE rather than by the server on
    // the first run — the whole reason the form is generated from the schema.
    // Against `asked` rather than the whole schema: a field the form never
    // showed cannot be one the user failed to fill in, and flagging it would
    // block Save on something not on screen.
    //
    // NEVER over an error already raised. A field whose text failed to parse
    // has no value, so this used to relabel "to: Unexpected token" as "to is
    // required" — pointing at a box with an address plainly sitting in it and
    // saying it was empty.
    asked.forEach((f) => {
      if (nextErrors['param:' + f.name]) return
      if (f.required && (values[f.name] === undefined || values[f.name] === '')) {
        nextErrors['param:' + f.name] = f.name + ' is required'
      }
    })

    // The DECLARATION is checked too — a blank or duplicate name is skipped by
    // applySchema rather than rejected, so it would become a required param
    // that the run never asks for and nothing anywhere explains.
    var declErrors = validateDeclaration(draft.params)
    Object.keys(declErrors).forEach((i) => { nextErrors['decl:' + i] = declErrors[i] })

    var transitions = []
    draft.transitions.forEach((t, i) => {
      var compiled = compileCondition(t.conditionText)
      if (!compiled.ok) { nextErrors['trans:' + t._id] = compiled.error; return }
      if (!t.target) { nextErrors['trans:' + t._id] = 'Pick where this goes'; return }
      transitions.push({ condition: compiled.node, mode: t.mode, target: t.target })
    })

    // The engine FAILS a run when transitions exist and none match — there is
    // no implicit fall-through (routeAfterStep: "No transition matched ... and
    // there is no catch-all row"). Warning here, at build time, is the only
    // place that costs nothing; the alternative is finding out on a live run.
    var hasCatchAll = draft.transitions.some((t) => !t.conditionText.trim())
    if (draft.transitions.length && !hasCatchAll) {
      nextErrors.catchAll = 'No catch-all: if no condition matches, the run FAILS. Add a row with an empty condition.'
    }

    var sampleOutput
    try {
      sampleOutput = draft.sampleOutputText.trim() === '' ? null : JSON.parse(draft.sampleOutputText)
    } catch (err) { nextErrors.sampleOutput = err.message }

    if (Object.keys(nextErrors).length) {
      // An error message pointing at a field behind a shut header is an error
      // message nobody can act on. Dropping the hand-set override — rather
      // than forcing the group open — hands it back to layoutParams, which
      // opens any group holding an error and lets it shut again once fixed.
      setGroupOverrides((prev) => {
        var next = { ...prev }
        schema.forEach((f) => {
          if (f.group && nextErrors['param:' + f.name]) delete next[f.group]
        })
        return next
      })
      // Same rule one level up: an error inside a shut SECTION is one nobody
      // can act on, so any section holding a message is opened.
      setOpenSections((prev) => ({
        ...prev,
        action: prev.action || Object.keys(nextErrors).some((k) => k.startsWith('param:')),
        step: prev.step || Object.keys(declErrors).length > 0,
        transitions: prev.transitions || Object.keys(nextErrors).some((k) => k.startsWith('trans:') || k === 'catchAll'),
        sample: prev.sample || Boolean(nextErrors.sampleOutput)
      }))
      setErrors(nextErrors)
      return
    }

    onSave(index, {
      stepKey: draft.stepKey, name: draft.name, actionName: draft.actionName,
      kind: draft.kind, onError: draft.onError, values: values,
      transitions: transitions.length ? transitions : null,
      joinStep: draft.joinStep || null,
      sampleOutput: sampleOutput,
      // `order` is rewritten from position on the way out — it is what the
      // grids sort by, and leaving it to whatever the rows were created with
      // means a reordered list that still draws in its original order.
      params: draft.params.length
        ? draft.params.map((f, i) => ({ ...f, name: f.name.trim(), order: i + 1 }))
        : null
    })
  }

  var action = actions.find((a) => a.name === draft.actionName)
  // visibleSteps carries each step's index in the UNFILTERED list (deleted
  // steps are dropped but the indices are not renumbered — see the
  // controller), so `index` cannot be used to position this step within the
  // filtered array. Locating it by identity is the only thing that stays
  // correct once anything has been deleted; getting this wrong would offer
  // references from steps that run AFTER this one.
  var entries = steps || []
  var visiblePos = entries.findIndex((e) => (e.step || e) === step)
  if (visiblePos < 0) visiblePos = entries.length
  var allSteps = entries.map((s) => s.step || s)
  // The workflow's OWN declared params, as sample values — see paramSamples
  // for why the declaration cannot be passed through as-is. This was a
  // literal `{}`, which is why the picker's "Run parameters" group has
  // always been coded and always been empty.
  // The union across EVERY step, not just this one — a parameter declared on
  // step 1 is bindable from step 4, which is the whole point of unioning them
  // (see paramGroups' collectDeclarations). This step's DRAFT stands in for
  // its saved row, so something declared a moment ago is offered immediately
  // rather than after a save and a reopen.
  var declaredEverywhere = collectDeclarations(
    allSteps.map((st) => (st === step ? { params: draft.params } : st)),
    workflowParams
  )
  var refGroups = referencesFor(allSteps, visiblePos, paramSamples(declaredEverywhere), draft.kind === 'wait')
  var condGroups = conditionFieldsFor({ sampleOutput: safeParse(draft.sampleOutputText), kind: draft.kind }, paramSamples(declaredEverywhere))
  var hasEach = draft.transitions.some((t) => t.mode === 'each')

  // Recomputed every render rather than memoised: `open` depends on what is
  // filled in, so a group holding the field you are typing into has to be able
  // to stay open as you type.
  var paramRows = layoutParams(
    (action && action.inputSchema) || [],
    draft.values,
    (name) => Boolean(errors['param:' + name])
  )

  function groupIsOpen(row) {
    return groupOverrides[row.name] === undefined ? row.open : groupOverrides[row.name]
  }

  function toggleGroup(row) {
    var next = !groupIsOpen(row)
    setGroupOverrides((prev) => ({ ...prev, [row.name]: next }))
  }

  // Resolved from the schema rather than remembered on open: an action change
  // while the lens is up would otherwise leave it editing a field that is no
  // longer declared. Missing means the lens simply does not render.
  var lensField = lens
    ? ((action && action.inputSchema) || []).find((f) => f.name === lens.name)
    : null

  function paramRowProps(f) {
    return {
      field: f,
      value: draft.values[f.name] == null ? '' : draft.values[f.name],
      error: errors['param:' + f.name],
      onChange: (v) => setValue(f.name, v),
      onInsert: (token) => insertInto(f.name, token),
      onCaret: rememberCaret,
      onZoom: (name, rect) => setLens({ name: name, rect: rect }),
      openRef: openRef, setOpenRef: setOpenRef,
      openHelp: openHelp, setOpenHelp: setOpenHelp,
      refGroups: refGroups
    }
  }

  return (
    <>
      {/* With the lens open over the canvas, a click just outside it lands
          here — and cancelling the whole drawer, discarding every edit, is a
          brutal answer to "I clicked slightly off". The capture-phase guard
          reads `lens` before the lens's own document listener has closed it,
          so that click dismisses the lens and nothing else. */}
      <div
        className="wf-drawer-backdrop"
        onMouseDownCapture={() => { backdropGuard.current = Boolean(lens) }}
        onClick={() => {
          if (backdropGuard.current) { backdropGuard.current = false; return }
          onCancel()
        }}
      />
      <div className="wf-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="wf-drawer-head">
          <strong>Step {index + 1}</strong>
          <button type="button" className="wf-close-btn" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className="wf-drawer-body">
          <DrawerSection
            title="Step"
            hint={draft.actionName || 'no action'}
            open={openSections.step}
            onToggle={() => toggleSection('step')}
          >
          <div className="wf-field">
            <label>Step key</label>
            <input value={draft.stepKey} onChange={(e) => field('stepKey', e.target.value)} placeholder="e.g. list_tables" />
          </div>
          <div className="wf-field">
            <label>Name</label>
            <input value={draft.name} onChange={(e) => field('name', e.target.value)} placeholder="Optional, shown on the node" />
          </div>
          <div className="wf-field-row">
            <div className="wf-field">
              <label>Kind</label>
              <select value={draft.kind} onChange={(e) => field('kind', e.target.value)}>
                <option value="auto">auto</option>
                <option value="wait">wait</option>
              </select>
            </div>
            <div className="wf-field">
              <label>On error</label>
              <select value={draft.onError} onChange={(e) => field('onError', e.target.value)}>
                <option value="stop">stop</option>
                <option value="continue">continue</option>
              </select>
            </div>
          </div>

          {/* THIS STEP'S INPUTS — under Step, because they are part of what
              this step IS, not arguments to the action it happens to call. */}
          <h5 className="wf-sub-title">Step inputs</h5>
          <p className="wf-field-help">
            What a caller must supply to START the run. A required one is enforced
            before any step executes — the run is refused, not failed halfway. Bind
            them in the action below as <code>{'{params.<name>}'}</code>.
          </p>
          <StepParamsGrid
            declared={draft.params}
            errors={Object.keys(errors)
              .filter((k) => k.startsWith('decl:'))
              .reduce((acc, k) => { acc[k.slice(5)] = errors[k]; return acc }, {})}
            expanded={expandedParam}
            setExpanded={setExpandedParam}
            onChange={(next) => setDraft((d) => ({ ...d, params: next }))}
          />

          {draft.kind === 'wait' && (
            <p className="wf-wait-note">
              Pauses until something calls <code>resumeByKey</code>. The key is minted
              BEFORE this step&rsquo;s action runs, so bind <code>{'{resumeKey}'}</code> in any
              parameter below to put it in a link.
            </p>
          )}

          </DrawerSection>

          {/* ── Parameters ─────────────────────────────────────────────── */}
          <DrawerSection
            title="Action"
            count={action ? askedFields(action.inputSchema || [], draft.values).length : null}
            hint={draft.actionName || 'none chosen'}
            open={openSections.action}
            onToggle={() => toggleSection('action')}
          >
          <div className="wf-field">
            <label>Action</label>
            <select value={draft.actionName} onChange={(e) => field('actionName', e.target.value)}>
              <option value="">— choose —</option>
              {actions.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </div>
          <h5 className="wf-sub-title">Action parameters</h5>
          {!action ? (
            <p className="wf-field-help">Choose an action to see what it takes.</p>
          ) : !(action.inputSchema || []).length ? (
            <p className="wf-field-help">{action.name} takes no input.</p>
          ) : (
            <>
              <p className="wf-field-help">
                Bind a literal, or a reference with the <code>{'{ }'}</code> button —
                {' '}<code>{'{params.x}'}</code>, <code>{'{previous_step.output.x}'}</code>,
                {' '}<code>{'{steps.<key>.output.x}'}</code>.
              </p>
              {/* One grid for every row, groups included, so the column line
                  runs unbroken from the header to the last group instead of
                  each section picking its own width. */}
              <div className="wf-params">
                <div className="wf-cell wf-cell-head">Parameter</div>
                <div className="wf-cell wf-cell-head">Value</div>
                {paramRows.map((row) => (
                  row.kind === 'field'
                    ? <ParamRow key={row.field.name} {...paramRowProps(row.field)} />
                    : (
                      <Fragment key={'group:' + row.name}>
                        <ParamGroupHeader
                          name={row.name}
                          count={row.fields.length}
                          open={groupIsOpen(row)}
                          onToggle={() => toggleGroup(row)}
                        />
                        {groupIsOpen(row) && row.fields.map((f) => (
                          <ParamRow key={f.name} {...paramRowProps(f)} />
                        ))}
                      </Fragment>
                    )
                ))}
              </div>
            </>
          )}

          </DrawerSection>

          {/* ── Transitions ────────────────────────────────────────────── */}
          <DrawerSection
            title="Transitions"
            count={draft.transitions.length}
            hint="advances to the next step"
            open={openSections.transitions}
            onToggle={() => toggleSection('transitions')}
          >
          <p className="wf-field-help">
            First match wins. An empty condition is the catch-all. With no transitions
            at all, the run simply advances to the next step.
          </p>
          {draft.transitions.map((t) => (
            <div className="wf-trans-row" key={t._id}>
              <div className="wf-trans-condwrap">
                <input
                  className="wf-trans-cond"
                  value={t.conditionText}
                  onChange={(e) => setTransition(t._id, 'conditionText', e.target.value)}
                  placeholder="empty = catch-all, e.g. output.approved = true"
                />
                <button
                  type="button"
                  className="wf-ref-btn"
                  onClick={() => setOpenRef(openRef === 'cond:' + t._id ? null : 'cond:' + t._id)}
                  title="Insert a field"
                >{'{ }'}</button>
                {openRef === 'cond:' + t._id && (
                  <RefMenu
                    groups={condGroups}
                    onPick={(token) => setTransition(t._id, 'conditionText', t.conditionText + token + ' = ')}
                    onClose={() => setOpenRef(null)}
                  />
                )}
              </div>
              <div className="wf-trans-meta">
                <select value={t.mode} onChange={(e) => setTransition(t._id, 'mode', e.target.value)}>
                  <option value="single">Single</option>
                  <option value="each">Each item</option>
                </select>
                <select value={t.target} onChange={(e) => setTransition(t._id, 'target', e.target.value)}>
                  <option value="">choose target…</option>
                  {allSteps.filter((s) => s.stepKey && s.stepKey !== draft.stepKey).map((s) => (
                    <option key={s.stepKey} value={s.stepKey}>{s.name || s.stepKey}</option>
                  ))}
                  <option value="end_success">— End run (success) —</option>
                  <option value="end_failed">— End run (failed) —</option>
                </select>
                <button type="button" className="wf-trans-remove" onClick={() => removeTransition(t._id)} aria-label="Remove transition">×</button>
              </div>
              {errors['trans:' + t._id] && <div className="wf-req">{errors['trans:' + t._id]}</div>}
            </div>
          ))}
          <button type="button" className="wf-trans-add" onClick={addTransition}>+ Add transition</button>
          {errors.catchAll && <div className="wf-req">{errors.catchAll}</div>}

          {hasEach && (
            <div className="wf-field">
              <label>Run once after all items <span className="wf-muted">— optional</span></label>
              <select value={draft.joinStep} onChange={(e) => field('joinStep', e.target.value)}>
                <option value="">— none —</option>
                {allSteps.filter((s) => s.stepKey && s.stepKey !== draft.stepKey).map((s) => (
                  <option key={s.stepKey} value={s.stepKey}>{s.name || s.stepKey}</option>
                ))}
              </select>
              <div className="wf-field-help">
                Fires a single time once every fanned-out item has finished — e.g. one
                batch move, rather than once per item.
              </div>
            </div>
          )}

          </DrawerSection>

          {/* ── Sample output ──────────────────────────────────────────── */}
          <DrawerSection
            title="Sample output"
            hint="not filled in"
            open={openSections.sample}
            onToggle={() => toggleSection('sample')}
          >
          <p className="wf-field-help">
            An EXAMPLE of what this step returns — never what it did return. Later steps
            and this step&rsquo;s own conditions offer these field names in their pickers,
            so filling it in is what stops the next step being written from memory.
          </p>
          <div className="wf-sample-actions">
            <button
              type="button"
              className="wf-secondary"
              onClick={fillFromLastRun}
              disabled={!workflowId || !draft.stepKey || sampling !== null}
              title="Read what this step returned last time a run reached it — nothing is executed"
            >{sampling === 'last' ? 'Fetching…' : 'Use last run'}</button>
            <button
              type="button"
              className="wf-secondary"
              onClick={() => setConfirmLive(true)}
              disabled={!workflowId || !draft.actionName || sampling !== null}
              title="Runs the action for real"
            >{sampling === 'live' ? 'Running…' : 'Run now'}</button>
          </div>

          {/* Deliberately a blocking step, not a tooltip. "Run now" on
              email-delete expunges a real message; on email-send it sends.
              The action is NAMED here because "are you sure?" tells you
              nothing when you have twelve steps open in a day. */}
          {confirmLive && (
            <div className="wf-confirm">
              <p className="wf-confirm-title">Really run <code>{draft.actionName}</code>?</p>
              <p className="wf-confirm-body">
                This is <strong>not a simulation</strong> — it runs the action for real,
                right now, with the parameters above. Anything it sends, writes or deletes
                actually happens.
              </p>
              <div className="wf-confirm-actions">
                <button type="button" className="wf-secondary" onClick={() => setConfirmLive(false)}>Cancel</button>
                <button type="button" className="wf-primary" onClick={runLive}>Run it</button>
              </div>
            </div>
          )}

          {sampleNote && (
            <div className={'wf-sample-note is-' + sampleNote.kind}>
              {sampleNote.text}
              {sampleNote.input && (
                <pre className="wf-json">{JSON.stringify(sampleNote.input, null, 2)}</pre>
              )}
            </div>
          )}

          <textarea
            className="wf-sample-json"
            rows={5}
            value={draft.sampleOutputText}
            onChange={(e) => field('sampleOutputText', e.target.value)}
            placeholder={'{ "approved": true, "approver": "ops@xeplr.io" }'}
          />
          {errors.sampleOutput && <div className="wf-req">{errors.sampleOutput}</div>}
          </DrawerSection>
        </div>

        {lens && lensField && (
          <CellLens
            field={lensField}
            value={draft.values[lens.name] == null ? '' : draft.values[lens.name]}
            anchorRect={lens.rect}
            refGroups={refGroups}
            onChange={(v) => setValue(lens.name, v)}
            onInsert={(token) => insertInto(lens.name, token)}
            onCaret={rememberCaret}
            onClose={() => setLens(null)}
          />
        )}

        <div className="wf-drawer-foot">
          <button type="button" className="wf-link-danger" onClick={() => onDelete(index)}>Remove step</button>
          <div className="wf-drawer-foot-actions">
            <button type="button" className="wf-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="wf-primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </>
  )
}

function RunPanel({ run, running, handleRun }) {
  var [paramsText, setParamsText] = useState('{}')
  var [paramsError, setParamsError] = useState(null)

  function onRun() {
    try {
      var parsed = paramsText.trim() === '' ? {} : JSON.parse(paramsText)
      setParamsError(null)
      handleRun(parsed)
    } catch (err) {
      setParamsError(err.message)
    }
  }

  return (
    <div className="wf-panel" style={{ marginTop: 16 }}>
      <div className="wf-field-row" style={{ alignItems: 'flex-end' }}>
        <div className="wf-field" style={{ marginBottom: 0 }}>
          <label>Run params <span className="wf-muted">— JSON</span></label>
          <input value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
        </div>
        <button type="button" className="wf-primary" onClick={onRun} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
      {paramsError && <div className="wf-req">{paramsError}</div>}

      {run && (
        <div className="wf-run-result">
          <span className={
            'wf-status wf-status-' +
            (run.status === 'success' ? 'good' : run.status === 'failed' ? 'bad' : run.status === 'waiting' ? 'busy' : 'current')
          }>
            {run.status}
          </span>
          <span className="wf-muted" style={{ marginLeft: 8, fontSize: 12 }}>run {run.id}</span>
          {run.status === 'waiting' && (
            <p className="wf-field-help" style={{ marginTop: 8 }}>
              Paused on a wait step, waiting on <code>POST /public/resume/&lt;key&gt;</code> — the resume
              key isn't surfaced in this page yet.
            </p>
          )}
          {run.error && <pre className="wf-json">{JSON.stringify(run.error, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}

export default function WorkflowCanvasSample(props) {
  var {
    workflow, actions, saving, running, run, visibleSteps, selectedIndex, readOnly,
    updateField, addStep, updateStep, updateStepPosition, removeStep,
    selectStep, closeDrawer, handleSave, handleRun,
    palette, source, addStepFromPalette
  } = props

  var [showRun, setShowRun] = useState(false)
  var [picked, setPicked] = useState('')

  if (!workflow) return <p className="wf-muted">Loading…</p>

  var selectedEntry = selectedIndex != null ? visibleSteps.find((e) => e.index === selectedIndex) : null

  var items = buildItems(visibleSteps)
  var edges = buildEdges(visibleSteps)
  var indexById = {}
  items.forEach((item) => { indexById[item.id] = item.entry.index })

  function saveStepDraft(index, fields) {
    Object.keys(fields).forEach((key) => updateStep(index, key, fields[key]))
    closeDrawer()
  }

  function deleteFromDrawer(index) {
    removeStep(index)
  }

  return (
    <section>
      {/* BACK TO WHERE THIS WAS OPENED FROM. Reading the destination off the
          source rather than always sending people to the workflow list:
          somebody who came from Jobs to connect two jobs never asked to visit
          a list of workflows, and landing there is where the seam between the
          two products starts to show. */}
      <Link
        to={(source && source.backTo) === 'jobs' ? ROUTES.jobs() : ROUTES.workflows()}
        className="wf-muted"
        style={{ fontSize: 13 }}
      >
        ← {(source && source.backLabel) || 'Workflows'}
      </Link>

      <div className="wf-builder-bar" style={{ marginTop: 8 }}>
        <div className="wf-builder-titles">
          <input
            id="wf-editor-name"
            className="wf-title-input"
            value={workflow.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder={(source && source.namePlaceholder) || 'Workflow name'}
            readOnly={readOnly}
          />
          <input
            className="wf-desc-input"
            value={workflow.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Description"
            readOnly={readOnly}
          />
        </div>
        {/* READ-ONLY IS AN ABSENCE OF CONTROLS, NOT DISABLED ONES.
            A flow of screens is designed in another app (source.readOnly —
            see stepSources.js), and its steps here are generated. A greyed-out
            Save invites somebody to work out how to un-grey it; a sentence
            saying where the thing IS editable answers the question they
            actually have. The status picker goes with it — publishing a flow
            is what its own facade's publish endpoint does, after validating
            it, and flipping this dropdown would skip all of that.
            Run and history stay, because neither is editing. */}
        <div className="wf-actions">
          {readOnly ? (
            <span className="wf-muted" data-role="read-only-notice">
              {(source && source.readOnlyNotice) || 'Read-only here'}
            </span>
          ) : (
            <select value={workflow.status || 'draft'} onChange={(e) => updateField('status', e.target.value)}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          )}
          {workflow.id && (
            <button type="button" className="wf-secondary" onClick={() => setShowRun((s) => !s)}>
              {showRun ? 'Hide run' : 'Run'}
            </button>
          )}
          {!readOnly && (
            <button type="button" className="wf-primary" data-role="save-workflow" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* THE SHARED CANVAS. Drag and alignment snapping come from
          @xeplr/ui-canvas; a step's position is committed once, on drop. A
          press that never becomes a drag is a click, and opens the drawer.

          NEITHER OF THOSE ON A READ-ONLY CANVAS. The drawer is an editor —
          every control in it writes to a draft this page is not allowed to
          save — and a form somebody can fill in but never submit is worse
          than no form. What a flow's steps ARE is already drawn: the screen
          on each node, the branches as the arrows between them. */}
      <XeplrCanvas
        className="wf-canvas-shell"
        items={items}
        edges={edges}
        selection={selectedEntry ? [stepItemId(selectedEntry)] : []}
        onItemChange={(id, patch) => { if (!readOnly) updateStepPosition(indexById[id], patch.x, patch.y) }}
        onItemClick={(id) => { if (!readOnly) selectStep(indexById[id]) }}
        renderItem={(item, state) => <StepNode entry={item.entry} selected={state.selected} />}
        renderEdgeLabel={renderEndMarker}
        padding={{ x: 240, y: 200 }}
        minWidth={1400}
        minHeight={460}
        underlay={visibleSteps.length === 0 && (
          <div className="wf-canvas-empty">
            {(source && source.emptyCanvas) || 'No steps yet — add one to start the canvas.'}
          </div>
        )}
      />

      {/* TWO WAYS TO ADD A STEP, chosen by the SOURCE rather than by the
          workflow's kind — so a source added later (saved API calls) needs no
          edit here, only an entry in stepSources.js.

          pickFirst false — the ordinary canvas. A blank step is a valid thing
            to add; the author picks the action in the drawer afterwards.

          pickFirst true — the jobs canvas. There is no such thing as a blank
            job step: without a jobId it names nothing, and it would sit on the
            canvas looking like a step while being unrunnable. So the choice
            comes first and the drop produces something complete. */}
      {readOnly ? null : source && source.pickFirst ? (
        <div className="wf-palette" style={{ marginTop: 14 }}>
          <select
            className="wf-palette-pick"
            value={picked}
            aria-label={'Choose a ' + (source.label || 'step').toLowerCase().replace(/s$/, '')}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">Choose a job…</option>
            {(palette || []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="wf-secondary"
            data-role="add-step"
            disabled={!picked}
            onClick={() => {
              var item = (palette || []).find((p) => p.id === picked)
              if (!item) return
              addStepFromPalette(item)
              // Cleared so adding the same job twice takes two deliberate
              // choices. It is a legitimate thing to want — the same movement
              // for two windows — but never something to do by double-click.
              setPicked('')
            }}
          >
            + Add job
          </button>
          {(palette || []).length === 0 && (
            <span className="wf-muted wf-palette-empty">
              No jobs to connect yet — create one on the Jobs screen first.
            </span>
          )}
        </div>
      ) : (
        <button type="button" className="wf-secondary" data-role="add-step" style={{ marginTop: 14 }} onClick={addStep}>
          + Add step
        </button>
      )}

      {showRun && workflow.id && <RunPanel run={run} running={running} handleRun={handleRun} />}

      {selectedEntry && (
        <StepDrawer
          entry={selectedEntry}
          actions={actions}
          steps={visibleSteps}
          workflowId={workflow && workflow.id}
          workflowParams={workflow && workflow.params}
          onSave={saveStepDraft}
          onCancel={closeDrawer}
          onDelete={deleteFromDrawer}
        />
      )}
    </section>
  )
}
