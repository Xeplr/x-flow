// THE CANVAS, AS THE FLOW DESIGNER.
//
// A box is never added from a toolbar. It is born from the arrow of the one
// before it, spliced into an arrow that already exists, or linked by dragging
// a loose arrow onto another box:
//
//   selected box  →  a next-step arrow under it   → click → what is it?
//   any arrow     →  a + on the arrow itself      → click → what is it?
//   selected box  →  a ? handle beside the arrow  → drag onto a box to link
//
// What each of those DOES to the workflow lives in ../flowEdits.js, with its
// tests. This file is only what it looks like and how it is grabbed.
//
// The box shows the two things a step always has — its NAME and WHAT IT IS —
// and nothing else until it is opened. Everything else (what it does, its
// inputs, what it gives back) belongs inside it, in tabs.

import { useEffect, useRef, useState } from 'react'
import { XeplrCanvas } from '@xeplr/ui-canvas'
import { liveSteps, edgesOf, SCREEN_ACTION } from '../flowEdits.js'
import { TRIGGERS, triggerFor, paramsFromSample, sampleFromParams, describeStart, applyScreen, screenEntry, syncScreenOutputs } from '../flowStart.js'
import { paramTabs, askedFields, parseCellValue, formatCellValue } from '../paramGroups.js'
import { flattenPaths } from '../conditions.js'
import './workflow.css'
import './flowCanvas.css'

var NODE_W = 252
var NODE_H = 76
// An open box is wider: it is holding a form now, and a 252px column turns
// every value into a slot two words long.
var OPEN_W = 340

/** What a step IS, in the one word the box shows. */
function typeOf(step) {
  if (step && step.kind === 'condition') return 'condition'
  if (step && step.actionName === SCREEN_ACTION) return 'screen'
  return 'action'
}

var TYPE_LABEL = { action: 'Action', screen: 'Screen', condition: 'Condition' }

function StepIcon({ type }) {
  if (type === 'screen') {
    // A window with something in it, and a cursor: a person is involved.
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="2" /><path d="M3 8h18M8 21h8" />
      </svg>
    )
  }
  if (type === 'condition') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 6 9l6 6 6-6z" /><path d="M12 15v6" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h5" />
    </svg>
  )
}

/** The one question a new box asks: what is it. */
function TypeChooser({ onPick, onClose }) {
  return (
    <div className="fc-chooser" role="dialog" aria-label="What comes next">
      <div className="fc-chooser-head">Next step</div>
      <button type="button" className="fc-chooser-row" onClick={() => onPick('action')}>
        <span className="fc-chooser-icon"><StepIcon type="action" /></span>
        <span>
          <strong>Action</strong>
          <small>Do something — a form, an email, data</small>
        </span>
      </button>
      <button type="button" className="fc-chooser-row" onClick={() => onPick('screen')}>
        <span className="fc-chooser-icon"><StepIcon type="screen" /></span>
        <span>
          <strong>Screen</strong>
          <small>Show a form and wait for a person to fill it in</small>
        </span>
      </button>
      <button type="button" className="fc-chooser-row" onClick={() => onPick('condition')}>
        <span className="fc-chooser-icon"><StepIcon type="condition" /></span>
        <span>
          <strong>Condition</strong>
          <small>Split into true and false</small>
        </span>
      </button>
      <button type="button" className="fc-chooser-cancel" onClick={onClose}>Cancel</button>
    </div>
  )
}

/**
 * HOW THIS FLOW STARTS, and what comes in with it — the flow's own settings,
 * opened from the gear beside its name.
 *
 * Both were being asked of a STEP, and the run's inputs were repeated on every
 * one of them. A flow has one beginning, so it is asked once, here.
 */
function StartPanel({ workflow, onChange, onClose }) {
  var trigger = workflow.trigger || { kind: 'manual' }
  var shape = triggerFor(trigger.kind)
  var [text, setText] = useState(function () { return sampleFromParams(workflow.params) })
  var [error, setError] = useState(null)

  function setTrigger(changes) {
    onChange({ trigger: Object.assign({}, trigger, changes) })
  }

  function readExample(next) {
    setText(next)
    var out = paramsFromSample(next, workflow.params)
    setError(out.error)
    if (!out.error) onChange({ params: out.params })
  }

  var named = (workflow.params || []).filter(function (p) { return p && p.name })

  return (
    <div className="fc-panel" role="dialog" aria-label="How this flow starts">
      <div className="fc-panel-head">
        <strong>Start</strong>
        <span className="fc-spacer" />
        <button type="button" className="fc-panel-close" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <div className="fc-panel-body">
        <label className="fc-field">
          <span className="fc-label">Starts when</span>
          <select
            value={trigger.kind || 'manual'}
            onChange={function (e) { setTrigger({ kind: e.target.value }) }}
          >
            {TRIGGERS.map(function (t) { return <option key={t.kind} value={t.kind}>{t.label}</option> })}
          </select>
        </label>

        {shape.fields.map(function (field) {
          return (
            <label className="fc-field" key={field.name}>
              <span className="fc-label">{field.label}</span>
              <input
                value={trigger[field.name] || ''}
                placeholder={field.placeholder}
                onChange={function (e) { setTrigger({ [field.name]: e.target.value }) }}
              />
              {field.help && <small className="wf-muted">{field.help}</small>}
            </label>
          )
        })}

        <label className="fc-field">
          <span className="fc-label">What comes in</span>
          <small className="wf-muted">
            An example, not real data — these names are what every step picks from.
          </small>
          <textarea
            className="fc-example"
            rows={7}
            spellCheck={false}
            value={text}
            placeholder={'{\n  "employeeId": "E-1042"\n}'}
            onChange={function (e) { readExample(e.target.value) }}
          />
        </label>

        {error ? (
          <p className="fc-note is-bad">{error}</p>
        ) : (
          <p className="fc-note">
            {named.length
              ? 'Reads as ' + named.length + (named.length === 1 ? ' field — ' : ' fields — ') + named.map(function (p) { return p.name }).join(', ') + '.'
              : 'Nothing comes in — this flow starts with what its steps fetch.'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * ONE INPUT the step is asking for.
 *
 * The shapes come from the action's own inputSchema, which is also what the
 * server validates against (@xeplr/schema-handler), so a fixed set of options
 * is a <select> rather than a text box somebody can type a rejected value
 * into, and a yes/no is a checkbox rather than a true/false dropdown.
 *
 * The value picker — every param and every earlier step's output, clickable —
 * lands on top of this: it fills the same box, so nothing here changes shape
 * when it does.
 */
function StepInput({ field, value, onChange }) {
  // TEXT WHILE IT IS BEING TYPED, the real value once it is not.
  //
  // `connection` is an object and `to` is a list, and half-typed JSON is
  // neither. So a text box holds its own text and hands the step a parsed
  // value when it is left — and a stored value comes back as text through
  // formatCellValue, because React renders a real array into a textarea as
  // "[object Object]" and saving that writes it over the value. Silently.
  var stored = formatCellValue(field, value)
  var [text, setText] = useState(stored)
  var [live, setLive] = useState(false)
  var [bad, setBad] = useState(null)

  // Reopened, or changed by something other than this box — take the new
  // value, unless the box is being typed in right now.
  useEffect(function () { if (!live) { setText(stored); setBad(null) } }, [stored, live])

  function commit(next) {
    var out = parseCellValue(field, next)
    if (out.error) { setBad(out.error); return }
    setBad(null)
    onChange(next === '' ? undefined : out.value)
  }

  var current = value === undefined || value === null ? '' : value
  var control

  // A DEFAULT IS SHOWN, NOT SUBMITTED. Leaving `limit` blank does not mean no
  // limit — it means 50, which the action supplies. So the default sits in the
  // box as grey placeholder text: what will happen if you say nothing. Typing
  // over it is what makes it a value of yours; the step stores nothing until
  // you do, so an action that changes its default later changes this step too.
  var hint = field.placeholder || (field.default === undefined || field.default === null ? '' : String(field.default))

  if (field.options && field.options.length) {
    control = (
      <select
        className="fc-in-control"
        value={current === '' ? (field.default == null ? '' : field.default) : current}
        onMouseDown={keepPress}
        onChange={function (e) { onChange(e.target.value) }}
      >
        {field.default === undefined && <option value="">— choose —</option>}
        {field.options.map(function (o) {
          var val = o && typeof o === 'object' ? o.value : o
          var label = o && typeof o === 'object' ? (o.label || o.value) : o
          return <option key={val} value={val}>{label}</option>
        })}
      </select>
    )
  } else if (field.type === 'boolean') {
    control = (
      <input
        type="checkbox"
        className="fc-in-check"
        checked={current === '' ? field.default === true : (current === true || current === 'true')}
        aria-label={field.label || field.name}
        onMouseDown={keepPress}
        onChange={function (e) { onChange(e.target.checked) }}
      />
    )
  } else if (field.type === 'object' || field.type === 'array') {
    control = (
      <textarea
        className={'fc-in-control fc-in-json' + (bad ? ' is-bad' : '')}
        rows={2}
        spellCheck={false}
        value={text}
        placeholder={hint || (field.type === 'array' ? '[ ]' : '{ }')}
        onMouseDown={keepPress}
        onFocus={function () { setLive(true) }}
        onChange={function (e) { setText(e.target.value) }}
        onBlur={function (e) { setLive(false); commit(e.target.value) }}
      />
    )
  } else {
    control = (
      <input
        className={'fc-in-control' + (bad ? ' is-bad' : '')}
        value={text}
        placeholder={hint}
        onMouseDown={keepPress}
        onFocus={function () { setLive(true) }}
        onChange={function (e) { setText(e.target.value) }}
        onBlur={function (e) { setLive(false); commit(e.target.value) }}
      />
    )
  }

  // TWO CELLS IN A TABLE, not a label stacked over a box. A step with eight
  // inputs laid out as a form is eight labels, eight boxes and eight gaps —
  // three hundred pixels of box hanging over the canvas, and it READS as a
  // hard form before a word of it has been understood. Name on the left,
  // value on the right, one line each.
  //
  // The description is a `title` rather than a line of its own for the same
  // reason: it is worth having, and not worth a row.
  return (
    <>
      <div className={'fc-cell fc-cell-key' + (bad ? ' is-bad' : '')} title={field.description || undefined}>
        <span className="fc-cell-name">{field.label || field.name}</span>
        {field.required && <span className="fc-in-req" title="Required">*</span>}
      </div>
      <div className={'fc-cell fc-cell-val' + (bad ? ' is-bad' : '')}>
        {control}
        {bad && <small className="fc-in-help is-bad">{bad}</small>}
      </div>
    </>
  )
}

/**
 * WHAT THIS STEP HANDS ON — an example of it, and the names it gives later
 * steps to pick from.
 *
 * AN EXAMPLE, NOT THE ANSWER. Nothing here has run: at design time there is
 * no real output and there cannot be one, so this is a sample of the shape —
 * the same bargain as the flow's "What comes in", for the same reason. It is
 * never sent anywhere and never stands in for a real value at run time; a
 * step that reads `{steps.fetch.output.total}` reads whatever the run
 * produced, not what is typed here.
 *
 * What it BUYS is the whole principle: a later step offers `total` in a list
 * with `1420` beside it instead of asking somebody to remember the word. That
 * is what referencesFor() builds, off exactly this (see conditions.js).
 */
function OutputTab({ step, onSample, submitted, known }) {
  var stored = step.sampleOutput ? JSON.stringify(step.sampleOutput, null, 2) : ''
  var [text, setText] = useState(stored)
  var [live, setLive] = useState(false)
  var [bad, setBad] = useState(null)

  useEffect(function () { if (!live) { setText(stored); setBad(null) } }, [stored, live])

  function commit(next) {
    var raw = next.trim()
    if (!raw) { setBad(null); onSample(null); return }
    try {
      var parsed = JSON.parse(raw)
      setBad(null)
      onSample(parsed)
    } catch (err) { setBad(err.message) }
  }

  // The tokens this step will offer, spelled exactly as a later step writes
  // them. Arrays stop the walk — see flattenPaths: `rows.0.name` is a binding
  // that breaks the moment the order changes.
  var offers = flattenPaths(step.sampleOutput || {})
  var key = step.stepKey || 'this_step'

  // ALREADY KNOWN, SO NOT ASKED. A screen's output is its own fields — the
  // app has the form's definition, and a box inviting somebody to retype it
  // is a box that will disagree with the form the first time a field is
  // added. So the names are simply listed, and there is nothing to fill in.
  if (known) {
    return (
      <div className="fc-out">
        <p className="fc-note">{known}</p>
        <div className="fc-offers">
          {offers.map(function (o) {
            return (
              <div className="fc-offer" key={o.path}>
                <code>{'{steps.' + key + '.output.' + o.path + '}'}</code>
                <span className="fc-offer-eg">{o.preview}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="fc-out">
      <textarea
        className={'fc-out-area' + (bad ? ' is-bad' : '')}
        rows={6}
        spellCheck={false}
        value={text}
        placeholder={'{\n  "total": 1420,\n  "rows": []\n}'}
        onMouseDown={keepPress}
        onFocus={function () { setLive(true) }}
        onChange={function (e) { setText(e.target.value) }}
        onBlur={function (e) { setLive(false); commit(e.target.value) }}
      />
      {bad
        ? <p className="fc-note is-bad">{bad}</p>
        : (
          <p className="fc-note">
            {submitted
              ? 'An example of what the person submits. Later steps pick from these names.'
              : 'An example of what this step hands on — nothing has run yet. Later steps pick from these names.'}
          </p>
        )}

      {offers.length > 0 && (
        <div className="fc-offers">
          {offers.map(function (o) {
            return (
              <div className="fc-offer" key={o.path}>
                <code>{'{steps.' + key + '.output.' + o.path + '}'}</code>
                <span className="fc-offer-eg">{o.preview}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * WHAT THE STEP NEEDS TO RUN — tabs, open inside the box.
 *
 * Inside the box rather than in a drawer, because a drawer asked for the step
 * key, the kind, the error behaviour, the inputs, the action, its parameters
 * and its transitions at once, and the answer to "what does this step do" was
 * somewhere in the middle of it. Here the box is the step: its name and its
 * type on the front, and what it needs the moment there is something to need.
 *
 * ONE TAB PER GROUP, so the box is the same height whichever is open. The
 * action's own declarations decide them (see paramTabs): `Inputs` is what it
 * needs to run, and `Filters`, `Output`, `Performance` are what it will also
 * accept. A collapsed group would have grown the box instead, moving the
 * arrow under it and shifting the whole flow below to make room for four
 * filters nobody was looking at.
 */
function StepPanel({ step, type, action, screen, onValue, onSample, tab, onTab }) {
  var values = step.values || {}

  // A SCREEN HAS NO INPUTS TAB. Its one input is which screen, and that is
  // already the question on the front of the box; `screen-show` is also kept
  // out of the action catalogue, so there is nothing to look up here either.
  // What is worth a tab is what comes BACK — the fields the person filled in,
  // which is what a later step will pick from.
  if (type === 'screen') {
    return (
      <>
        <div className="fc-tabs" role="tablist">
          <button type="button" className="fc-tab is-on" role="tab" aria-selected="true" onMouseDown={keepPress}>
            Step's Output
          </button>
        </div>
        <OutputTab
          step={step}
          onSample={onSample}
          submitted
          known={screen && screen.fields && screen.fields.length
            ? 'The fields of the ' + (screen.name || screen.key) + ' form — what the person fills in. Later steps pick from these.'
            : null}
        />
      </>
    )
  }

  if (!action) {
    return <p className="fc-note">This action is not in the catalogue any more, so what it takes is unknown.</p>
  }

  // TABS CARRY AN ID, not just their label. The action's own groups are named
  // by whoever wrote the action — email-read declares one called `Output`,
  // meaning "options about the output" — and the step's own output tab must
  // not be confusable with it by the code, whatever the two end up called.
  var tabs = paramTabs(action.inputSchema, values).map(function (t) {
    return { id: 'in:' + t.name, label: t.name, filled: t.filled, fields: t.fields }
  })
  // An action that asks for nothing still gets its tab, saying so. Dropping
  // it would leave a strip whose only entry is the step's output, and "where
  // did the inputs go" is a worse question than "it needs none".
  if (!tabs.length) tabs.push({ id: 'in:none', label: 'Inputs', filled: 0, fields: [], empty: true })
  tabs.push({
    id: 'out',
    label: "Step's Output",
    filled: step.sampleOutput && Object.keys(step.sampleOutput).length ? 1 : 0,
    fields: null
  })

  // The tab being shown can stop existing under you: tick a box and a whole
  // group can branch away. Falling back to the first one keeps the panel
  // showing something real rather than going blank.
  var current = tabs.find(function (t) { return t.id === tab }) || tabs[0]

  return (
    <>
      <div className="fc-tabs" role="tablist">
        {tabs.map(function (t) {
          var on = t.id === current.id
          return (
            <button
              type="button"
              key={t.id}
              className={'fc-tab' + (on ? ' is-on' : '')}
              role="tab"
              aria-selected={on}
              onMouseDown={keepPress}
              onClick={function () { onTab(t.id) }}
            >
              {t.label}
              {/* What is SET on a tab, not how many fields it has — the
                  question a shut tab has to answer is whether anything of
                  yours is behind it. */}
              {t.filled > 0 && <span className="fc-tab-dot" aria-label="has something set" />}
            </button>
          )
        })}
      </div>

      {current.id === 'out' ? (
        <OutputTab step={step} onSample={onSample} />
      ) : current.empty ? (
        <p className="fc-note">{action.name} takes no input — it runs as it is.</p>
      ) : (
        <div className="fc-table">
          {current.fields.map(function (f) {
            return (
              <StepInput
                key={f.name}
                field={f}
                value={values[f.name]}
                onChange={function (v) { onValue(f.name, v) }}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

/**
 * THE FORM ITSELF, WITHOUT LEAVING THE FLOW.
 *
 * Designing the screen a step shows used to mean going to another page,
 * finding the form, changing it, coming back and hoping the step still
 * matched. That is the switch this exists to remove: the flow is what somebody
 * is thinking about, and a form is a detail of one step in it.
 *
 * The designer owns the WINDOW and the host owns what is inside it, because a
 * screen belongs to the app: @xeplr/ui-workflow knows a screen key and
 * nothing else about forms, and a package that reached for @xeplr/ui-factory
 * to draw one would only work for the apps built on it. So `screenEditor` is
 * a render prop, and this is the big, plain frame it renders into.
 *
 * Big on purpose — a form designer needs the room, and a modal that scrolls
 * its own canvas is worse than no modal.
 */
function ScreenEditorModal({ screenKey, render, onDone, onClose }) {
  useEffect(function () {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return function () { document.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className="fc-modal-back" onMouseDown={onClose}>
      <div
        className="fc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={screenKey ? 'Design ' + screenKey : 'New form'}
        onMouseDown={function (e) { e.stopPropagation() }}
      >
        <div className="fc-modal-head">
          <strong>{screenKey || 'New form'}</strong>
          <span className="fc-spacer" />
          <button type="button" className="fc-panel-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="fc-modal-body">
          {render({ screenKey: screenKey || null, onDone: onDone, onClose: onClose })}
        </div>
      </div>
    </div>
  )
}

/**
 * Keeps a press inside a control from becoming a drag of the box.
 *
 * @xeplr/ui-canvas now leaves controls alone by itself (press.js's
 * NOT_A_DRAG), so this is belt and braces — it is what makes the designer
 * work on a host that has an older canvas installed, and it costs one line
 * per control. MOUSEDOWN, not pointerdown: the drag is bound to mousedown,
 * and stopping the wrong event is exactly the bug this replaced.
 */
function keepPress(e) {
  e.stopPropagation()
}

export default function FlowCanvas(props) {
  var {
    workflow, actions, screens, screenEditor, saving, readOnly, selectedIndex,
    selectStep, updateStepPosition, handleSave, updateField, updateStep,
    addAfter, addFirst, insertOn, linkSteps, renameStep, removeStepAndArrows,
    onBack
  } = props

  // Where the "what is it?" panel is, and what picking one will do:
  //   { kind: 'after', index }            the selected box's own arrow
  //   { kind: 'on', fromIndex, target }   the + on an arrow
  var [choosing, setChoosing] = useState(null)
  // A loose arrow being dragged: where it started, and where the pointer is.
  var [linking, setLinking] = useState(null)
  var [startOpen, setStartOpen] = useState(false)
  // Which step's screen is being designed, and whether it is a new form:
  //   { index, screenKey }   screenKey null means "make one"
  var [designing, setDesigning] = useState(null)
  // Which tab of the open box is showing. One box is open at a time — it is
  // the selected one — so this is one name, cleared with the selection.
  var [tab, setTab] = useState(null)
  // HOW TALL THE OPEN BOX IS. Measured, not guessed: the canvas positions an
  // item from its `h`, and everything hanging off the box — the next-step
  // arrow, the ? handle, every arrow drawn to it — is placed from that number.
  // A height worked out from a field count is wrong the moment a label wraps
  // or a group opens, and being wrong puts the arrow through the middle of
  // the form.
  //
  // No feedback loop: an OPEN box is `height: auto` (see the css), so what is
  // measured is its content, not the height being set from it.
  var [openH, setOpenH] = useState(0)
  var areaRef = useRef(null)
  var nodeObs = useRef(null)

  // Nothing is open for a step that is not selected, so both reset with it.
  useEffect(function () {
    setTab(null)
    setOpenH(0)
  }, [selectedIndex])

  useEffect(function () {
    return function () { if (nodeObs.current) nodeObs.current.disconnect() }
  }, [])

  function measureNode(node) {
    if (nodeObs.current) { nodeObs.current.disconnect(); nodeObs.current = null }
    if (!node) { setOpenH(0); return }
    setOpenH(node.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    nodeObs.current = new ResizeObserver(function (entries) {
      var h = entries[0] && entries[0].target.offsetHeight
      if (h) setOpenH(h)
    })
    nodeObs.current.observe(node)
  }

  useEffect(function () {
    if (!linking) return undefined
    function move(e) {
      var box = areaRef.current && areaRef.current.getBoundingClientRect()
      if (!box) return
      setLinking(function (l) {
        return l && Object.assign({}, l, { x: e.clientX - box.left, y: e.clientY - box.top })
      })
    }
    function drop() { setLinking(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', drop)
    return function () {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', drop)
    }
  }, [linking && linking.fromIndex])

  if (!workflow) return <p className="wf-muted">Loading…</p>

  var steps = liveSteps(workflow)
  var edges = edgesOf(workflow)

  // A BOX OPENS WHEN IT HAS SOMETHING TO ASK. Selected and holding an action
  // means there is a form to fill in; selected and still blank means the only
  // question is the one already on the front of the box, so it stays a box.
  function isOpen(entry) {
    if (readOnly) return false
    if (selectedIndex !== entry.index) return false
    var type = typeOf(entry.step)
    // A screen opens as soon as it is chosen: what comes back from it is the
    // fields the person filled in, and a later step needs those names.
    if (type === 'screen') return Boolean(entry.step.values && entry.step.values.screen)
    return type === 'action' && Boolean(entry.step.actionName)
  }

  var items = steps.map(function (entry) {
    var at = entry.step.layout || { x: 60 + entry.index * 280, y: 100 }
    var open = isOpen(entry)
    return {
      id: String(entry.index),
      x: at.x,
      y: at.y,
      w: open ? OPEN_W : NODE_W,
      h: open && openH ? openH : NODE_H,
      entry: entry
    }
  })
  var indexById = {}
  items.forEach(function (item) { indexById[item.id] = item.entry.index })

  function pick(type) {
    if (!choosing) return
    if (choosing.kind === 'first') addFirst(type)
    else if (choosing.kind === 'after') addAfter(choosing.index, type)
    else insertOn(choosing.fromIndex, choosing.target, type)
    setChoosing(null)
  }

  function renderItem(item, state) {
    var entry = item.entry
    var step = entry.step
    var type = typeOf(step)
    var isSelected = selectedIndex === entry.index || state.selected
    var says = type === 'screen'
      ? ((step.values && step.values.screen) || 'no screen yet')
      : step.actionName || (type === 'condition' ? 'not set yet' : 'no action yet')
    var open = isOpen(entry)
    var action = (actions || []).find(function (a) { return a.name === step.actionName })

    var chosenScreen = screenEntry(screens, step.values && step.values.screen)

    /**
     * Choosing the screen writes what it hands back.
     *
     * Stored on the step rather than worked out wherever it is needed,
     * because the pickers that read it (referencesFor, in conditions.js) run
     * where the screen list is not: a later step's box, a condition, the
     * engine's own history. The step carrying its own answer is what makes
     * "pick from an earlier step's output" work without every one of them
     * knowing about screens.
     *
     * Re-derived on every change of screen, so switching forms does not leave
     * the fields of the old one behind.
     */
    function chooseScreen(key) {
      var patch = applyScreen(step, screenEntry(screens, key) || { key: key })
      updateStep(entry.index, 'values', patch.values)
      if (patch.sampleOutput) updateStep(entry.index, 'sampleOutput', patch.sampleOutput)
    }

    function setValue(name, v) {
      var next = Object.assign({}, step.values)
      if (v === undefined) delete next[name]
      else next[name] = v

      // A FIELD THAT IS NO LONGER ASKED IS NO LONGER SET. Tick "use your own
      // mail server", fill the connection in, untick it: that connection is
      // not part of what this step does any more. Leaving it would store a
      // value the step does not use, that nothing on screen shows, and that
      // comes back into force the day somebody ticks the box again.
      //
      // Only fields the schema knows about — anything else in `values` was
      // put there by something other than this form and is not ours to drop.
      if (action) {
        var asked = {}
        askedFields(action.inputSchema || [], next).forEach(function (f) { asked[f.name] = true })
        ;(action.inputSchema || []).forEach(function (f) {
          if (f && f.name && !asked[f.name]) delete next[f.name]
        })
      }
      updateStep(entry.index, 'values', next)
    }

    return (
      <div
        ref={open ? measureNode : undefined}
        className={'fc-node' + (isSelected ? ' is-selected' : '') + (open ? ' is-open' : '') + (linking ? ' is-target' : '')}
        onPointerUp={function () {
          if (linking && linking.fromIndex !== entry.index) {
            linkSteps(linking.fromIndex, entry.index)
            setLinking(null)
          }
        }}
      >
        <span className="fc-node-head">
        <span className={'fc-node-icon fc-' + type}><StepIcon type={type} /></span>

        <span className="fc-node-body">
          {isSelected && !readOnly ? (
            <input
              className="fc-node-name"
              value={step.name || ''}
              placeholder="Name this step"
              aria-label="Step name"
              onChange={function (e) { renameStep(entry.index, e.target.value) }}
              onMouseDown={keepPress}
              onPointerDown={keepPress}
              autoFocus={!step.name}
            />
          ) : (
            <span className="fc-node-name is-static">{step.name || 'Untitled step'}</span>
          )}
          {/* WHAT IT DOES. On a selected box it is the question itself, not a
              label to read: an Action with no action chosen is a step that
              cannot run, and this is the only thing it is waiting for. */}
          {isSelected && !readOnly && type === 'screen' ? (
            <span className="fc-node-says">
              <span className={'fc-tag fc-' + type}>Screen</span>
              {/* WHICH SCREEN. The list belongs to the app that owns the
                  screens — this engine only carries the key (see
                  screenShow.js) — so the host hands it down. Given none, the
                  key is typed: a designer that cannot be used because its
                  host has not been wired up yet is worse than one that asks
                  you to know the key. */}
              {screens && screens.length ? (
                <select
                  className="fc-node-does"
                  aria-label="Which screen to show"
                  data-empty={(step.values && step.values.screen) ? 'no' : 'yes'}
                  value={(step.values && step.values.screen) || ''}
                  onMouseDown={keepPress}
                  onChange={function (e) { chooseScreen(e.target.value) }}
                >
                  <option value="">Choose a screen…</option>
                  {screens.map(function (sc) {
                    var k = typeof sc === 'string' ? sc : sc.key
                    var label = typeof sc === 'string' ? sc : (sc.name || sc.key)
                    return <option key={k} value={k}>{label}</option>
                  })}
                </select>
              ) : (
                <input
                  className="fc-node-does"
                  aria-label="Which screen to show"
                  placeholder="Screen key…"
                  defaultValue={(step.values && step.values.screen) || ''}
                  onMouseDown={keepPress}
                  onBlur={function (e) { chooseScreen(e.target.value.trim()) }}
                />
              )}
              {/* DESIGN IT HERE. Making the form and using it are one piece of
                  work — going to another page to add a field, then coming back
                  to hope the step still matches, is the switch this removes. */}
              {screenEditor && (
                <span className="fc-node-more">
                  {step.values && step.values.screen ? (
                    <button
                      type="button"
                      className="fc-mini"
                      title={'Design the ' + ((chosenScreen && chosenScreen.name) || step.values.screen) + ' form'}
                      onMouseDown={keepPress}
                      onClick={function () { setDesigning({ index: entry.index, screenKey: step.values.screen }) }}
                    >Edit</button>
                  ) : null}
                  <button
                    type="button"
                    className="fc-mini"
                    title="Make a new form for this step"
                    onMouseDown={keepPress}
                    onClick={function () { setDesigning({ index: entry.index, screenKey: null }) }}
                  >＋ New</button>
                </span>
              )}
            </span>
          ) : isSelected && !readOnly && type === 'action' ? (
            <span className="fc-node-says">
              <span className={'fc-tag fc-' + type}>Action</span>
              <select
                className="fc-node-does"
                aria-label="What this step does"
                data-empty={step.actionName ? 'no' : 'yes'}
                value={step.actionName || ''}
                onMouseDown={keepPress}
                onPointerDown={keepPress}
                onChange={function (e) { updateStep(entry.index, 'actionName', e.target.value) }}
              >
                <option value="">Choose what it does…</option>
                {(actions || []).map(function (a) {
                  return <option key={a.name} value={a.name}>{a.name}</option>
                })}
              </select>
            </span>
          ) : (
            <span className="fc-node-says">
              <span className={'fc-tag fc-' + type}>{TYPE_LABEL[type]}</span>
              <span className="wf-muted">{says}</span>
            </span>
          )}
        </span>

        {isSelected && !readOnly && (
          <button
            type="button"
            className="fc-node-remove"
            aria-label="Remove this step"
            onMouseDown={keepPress}
            onPointerDown={keepPress}
            onClick={function () { removeStepAndArrows(entry.index) }}
          >×</button>
        )}
        </span>

        {/* WHAT IT NEEDS TO RUN. Tabs, because this is the first of several
            things a step is asked — what it gives back and how it handles a
            list are the next two, and they arrive as tabs here rather than as
            another panel somewhere else. */}
        {open && (
          <div className="fc-node-panel" data-canvas-no-drag="">
            <StepPanel
              step={step}
              type={type}
              action={action}
              screen={chosenScreen}
              onValue={setValue}
              onSample={function (v) { updateStep(entry.index, 'sampleOutput', v) }}
              tab={tab}
              onTab={setTab}
            />
          </div>
        )}

        {/* THE NEXT-STEP ARROW and the loose ? beside it. They belong to the
            selection, which is why there is no Add button anywhere. */}
        {isSelected && !readOnly && (
          <span className="fc-handles">
            <button
              type="button"
              className="fc-arrow"
              data-role="add-step"
              aria-label="Add the next step"
              onMouseDown={keepPress}
              onPointerDown={keepPress}
              onClick={function () { setChoosing({ kind: 'after', index: entry.index }) }}
            >
              <svg viewBox="0 0 12 34" width="12" height="34" aria-hidden="true">
                <path d="M6 0v22" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="m1 22 5 10 5-10z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className="fc-loose"
              aria-label="Drag to link this step to another"
              onMouseDown={keepPress}
              onPointerDown={function (e) {
                e.stopPropagation()
                var box = areaRef.current && areaRef.current.getBoundingClientRect()
                setLinking({ fromIndex: entry.index, x: box ? e.clientX - box.left : 0, y: box ? e.clientY - box.top : 0 })
              }}
            >?</button>
          </span>
        )}
      </div>
    )
  }

  // A + sits ON the arrow, so a step can be put between two that exist.
  function renderEdgeLabel(edge, ends) {
    if (readOnly) return null
    return (
      <button
        type="button"
        className="fc-insert"
        aria-label="Insert a step here"
        style={{ left: ends.mid.x - 13, top: ends.mid.y - 13 }}
        onClick={function () { setChoosing({ kind: 'on', fromIndex: edge.fromIndex, target: edge.target }) }}
      >+</button>
    )
  }

  return (
    <div className="fc-wrap">
      <div className="fc-bar">
        {onBack && <button type="button" className="wf-link-btn fc-back" onClick={onBack}>← Flows</button>}
        <input
          id="wf-editor-name"
          className="fc-title"
          value={workflow.name || ''}
          placeholder="Name this flow"
          aria-label="Flow name"
          onChange={function (e) { updateField('name', e.target.value) }}
          readOnly={readOnly}
        />
        <button
          type="button"
          className="fc-gear"
          aria-label="How this flow starts"
          aria-expanded={startOpen}
          onClick={function () { setStartOpen(function (open) { return !open }) }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5 2 2 0 1 1-4 0 1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3 2 2 0 1 1-2.8-2.8 1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1 2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8 2 2 0 1 1 2.8-2.8 1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5 2 2 0 1 1 4 0 1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3 2 2 0 1 1 2.8 2.8 1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1 2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.5 1z" />
          </svg>
        </button>
        <span className="fc-start-says wf-muted">{describeStart(workflow.trigger, workflow.params)}</span>
        <span className={'fc-status is-' + (workflow.status || 'draft')}>{workflow.status || 'draft'}</span>
        <span className="fc-spacer" />
        {readOnly ? (
          <span className="wf-muted" data-role="read-only-notice" style={{ fontSize: 13 }}>
            Designed in the app that owns it — this canvas follows a run, and edits nothing.
          </span>
        ) : (
          <button type="button" className="wf-secondary" data-role="save-workflow" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      <div className="fc-area" ref={areaRef}>
        <XeplrCanvas
          items={items}
          edges={edges.map(function (e) { return { id: e.id, from: String(e.from), to: String(e.to) } })}
          features={{ drag: !readOnly, resize: false, snap: true, marquee: false }}
          selection={selectedIndex == null ? [] : [String(selectedIndex)]}
          onItemClick={function (id) { selectStep(indexById[id]) }}
          onItemChange={function (id, patch) { updateStepPosition(indexById[id], patch.x, patch.y) }}
          renderItem={renderItem}
          renderEdgeLabel={renderEdgeLabel}
          padding={{ x: 200, y: 160 }}
          className="fc-canvas"
        />

        {/* The loose arrow, while it is being dragged. */}
        {linking && (
          <svg className="fc-linking" aria-hidden="true">
            <circle cx={linking.x} cy={linking.y} r="5" />
          </svg>
        )}

        {startOpen && !readOnly && (
          <StartPanel
            workflow={workflow}
            onChange={function (changes) {
              Object.keys(changes).forEach(function (field) { updateField(field, changes[field]) })
            }}
            onClose={function () { setStartOpen(false) }}
          />
        )}

        {designing && screenEditor && (
          <ScreenEditorModal
            screenKey={designing.screenKey}
            render={screenEditor}
            onClose={function () { setDesigning(null) }}
            /**
             * The host has saved the form and says what it now is.
             *
             * The step that opened the editor takes it whether or not it had a
             * screen — that is what "＋ New" means — and every OTHER step
             * showing the same form is brought up to date in the same breath,
             * which is the point of deriving a screen's output rather than
             * storing somebody's typing: add a field to Task and every step
             * that shows Task hands it on, so every step after those can pick
             * it, without anybody reopening them.
             */
            onDone={function (screen) {
              var at = designing.index
              setDesigning(null)
              if (!screen || !screen.key) return
              var patch = applyScreen((workflow.steps || [])[at] || {}, screen)
              updateStep(at, 'values', patch.values)
              if (patch.sampleOutput) updateStep(at, 'sampleOutput', patch.sampleOutput)

              // The list the host gave us is a render old; the screen it just
              // handed back is the current one, so the sync is run against
              // that. The host reloading `screens` does the same for anything
              // this missed.
              var merged = (screens || [])
                .map(function (sc) { return typeof sc === 'string' ? { key: sc, name: sc } : sc })
                .filter(function (sc) { return sc.key !== screen.key })
                .concat([screen])
              syncScreenOutputs(workflow.steps || [], merged, SCREEN_ACTION).forEach(function (change) {
                if (change.index !== at) updateStep(change.index, 'sampleOutput', change.sampleOutput)
              })
            }}
          />
        )}

        {choosing && (
          <div className="fc-chooser-layer" onClick={function () { setChoosing(null) }}>
            <div onClick={function (e) { e.stopPropagation() }}>
              <TypeChooser onPick={pick} onClose={function () { setChoosing(null) }} />
            </div>
          </div>
        )}
      </div>

      {/* A FLOW WITH NOTHING IN IT has no box to grow from yet. This is the
          bridge until Start lands (it is always there, and everything grows
          from its arrow) — at which point this goes. */}
      {steps.length === 0 && !readOnly && (
        <div className="fc-empty">
          <p className="wf-muted">Nothing here yet.</p>
          <button type="button" className="wf-secondary" onClick={function () { setChoosing({ kind: 'first' }) }}>
            Start here
          </button>
        </div>
      )}
    </div>
  )
}
