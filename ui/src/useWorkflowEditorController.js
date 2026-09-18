import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { raiseSnackbar } from '@xeplr/ui-utils'
import { getWorkflow, saveWorkflow, runWorkflow } from './api/workflows.js'
import { listActions } from './api/actions.js'
import { listJobs } from './api/jobs.js'
import { sourceFor, isReadOnly } from './stepSources.js'
import { ROUTES } from './routes.js'

// WHICH FUNCTION FETCHES EACH PALETTE.
//
// Here rather than in stepSources.js so that module stays free of api/* — and
// therefore of React — and can be tested with plain node. That file says what
// an item BECOMES; this one says where items come from. The next source (saved
// API calls) is one entry in each.
const LISTERS = {
  workflow: listActions,
  jobs: listJobs
}

// `kind` decides which palette the canvas offers. Only ever applied to a NEW
// workflow: a saved one carries its kind on the row, and letting a query
// string override that would repaint the palette around steps it cannot
// describe — see useRouteKind.
function blankWorkflow(kind) {
  return { name: '', description: '', params: [], status: 'draft', kind: kind || 'workflow', steps: [] }
}

function blankStep(position) {
  return {
    stepKey: '', name: '', actionName: '', kind: 'auto', onError: 'stop',
    values: {}, transitions: null, position: position
  }
}

export function useWorkflowEditorController({ workflowId, newKind }) {
  const [workflow, setWorkflow] = useState(null)
  const [actions, setActions] = useState([])
  // The palette for THIS workflow's kind. Separate from `actions`, which the
  // step drawer still needs whatever the canvas is: a job step is an ordinary
  // step, and opening it shows the same action picker as any other.
  const [palette, setPalette] = useState([])
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState(null)
  const [jsonErrors, setJsonErrors] = useState({})
  const [selectedIndex, setSelectedIndex] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    listActions().then(setActions).catch((err) => raiseSnackbar(err.message, { design: 'error' }))
  }, [])

  // Loaded once the workflow is known, because its `kind` is what decides
  // which list to ask for. An action-kind workflow re-uses the catalogue it
  // already has rather than fetching it twice.
  const kind = (workflow && workflow.kind) || 'workflow'
  useEffect(() => {
    const list = LISTERS[kind] || LISTERS.workflow
    if (list === listActions) { setPalette(actions); return }
    let cancelled = false
    list()
      .then((rows) => { if (!cancelled) setPalette(rows) })
      .catch((err) => {
        if (cancelled) return
        setPalette([])
        // NAMED, because an empty palette is indistinguishable from "there are
        // no jobs yet" and somebody would go looking for the wrong problem.
        raiseSnackbar('Could not load the job list: ' + err.message, { design: 'error' })
      })
    return () => { cancelled = true }
  }, [kind, actions])

  useEffect(() => {
    setRun(null)
    // ONLY here, where the workflow does not exist yet. Below, a fetched
    // workflow's own `kind` is whatever the row says and nothing overwrites it.
    if (!workflowId) { setWorkflow(blankWorkflow(newKind)); return }
    let cancelled = false
    getWorkflow(workflowId)
      .then((w) => { if (!cancelled) setWorkflow(w) })
      .catch((err) => raiseSnackbar(err.message, { design: 'error' }))
    return () => { cancelled = true }
  }, [workflowId, newKind])

  function updateField(field, value) {
    setWorkflow((w) => ({ ...w, [field]: value }))
  }

  function addStep() {
    setWorkflow((w) => {
      var steps = w.steps || []
      var visibleCount = steps.filter((s) => !s.deleted).length
      var step = blankStep(visibleCount)
      step.layout = { x: 60 + visibleCount * 280, y: 100 }
      var nextSteps = [...steps, step]
      setSelectedIndex(nextSteps.length - 1)
      return { ...w, steps: nextSteps }
    })
  }

  /**
   * Add a step from the palette — the job canvas's version of addStep().
   *
   * Unlike addStep this produces a COMPLETE step: the job is already chosen,
   * so its action, its wait behaviour and its three bindings are all filled in
   * (see stepSources.jobToStep). The author draws arrows; there is nothing to
   * type.
   *
   * The existing keys are passed in so the same job dropped twice becomes
   * load_sales and load_sales_2. Two steps sharing a key would silently
   * overwrite each other in the run context — {steps.load_sales.output} would
   * mean whichever ran last — and nothing anywhere would report it.
   */
  function addStepFromPalette(item) {
    setWorkflow((w) => {
      var steps = w.steps || []
      var visible = steps.filter((s) => !s.deleted)
      var existingKeys = visible.map((s) => s.stepKey).filter(Boolean)
      var source = sourceFor(w)
      var step = source.toStep(item, visible.length, existingKeys)
      step.layout = { x: 60 + visible.length * 280, y: 100 }
      var nextSteps = [...steps, step]
      setSelectedIndex(nextSteps.length - 1)
      return { ...w, steps: nextSteps }
    })
  }

  // Called once per drag, on drop — the shared canvas (@xeplr/ui-canvas)
  // moves the node itself while the pointer is down.
  function updateStepPosition(index, x, y) {
    setWorkflow((w) => {
      var steps = w.steps.slice()
      steps[index] = { ...steps[index], layout: { x: x, y: y } }
      return { ...w, steps: steps }
    })
  }

  function selectStep(index) { setSelectedIndex(index) }
  function closeDrawer() { setSelectedIndex(null) }

  function updateStep(index, field, value) {
    setWorkflow((w) => {
      var steps = w.steps.slice()
      steps[index] = { ...steps[index], [field]: value }
      return { ...w, steps: steps }
    })
  }

  // `values`/`transitions` are edited as raw JSON text. Only commits into
  // the step on valid JSON — a mid-edit string that doesn't parse yet just
  // surfaces an inline error instead of corrupting the step's real value.
  function updateStepJSON(index, field, text) {
    var key = index + ':' + field
    try {
      var parsed = text.trim() === '' ? (field === 'transitions' ? null : {}) : JSON.parse(text)
      updateStep(index, field, parsed)
      setJsonErrors((e) => { var n = Object.assign({}, e); delete n[key]; return n })
    } catch (err) {
      setJsonErrors((e) => Object.assign({}, e, { [key]: err.message }))
    }
  }

  // An unsaved step (no id yet) is just dropped. A saved one has to reach
  // the server as a tombstone — { id, deleted: true } — so the next save
  // actually soft-deletes the row; genericController only acts on entries
  // present in the changeset, it does not diff against what already exists
  // in the DB. Hidden from the visible list immediately either way.
  function removeStep(index) {
    setWorkflow((w) => {
      var target = w.steps[index]
      var steps = target.id
        ? w.steps.map((s, i) => (i === index ? Object.assign({}, s, { deleted: true }) : s))
        : w.steps.filter((_, i) => i !== index)
      return { ...w, steps: steps }
    })
    setSelectedIndex((current) => (current === index ? null : current))
  }

  async function handleSave() {
    // A LAST STOP, not the only one. The Design hides the Save button on a
    // read-only workflow and the SERVER refuses the save outright — this is
    // here because a Design is replaceable (see registerWorkflowUI's
    // editorDesign) and a replacement that forgot must not be able to send a
    // change that the server then answers with a snackbar full of jargon.
    if (readOnly) {
      raiseSnackbar(sourceFor(workflow).readOnlyNotice || 'This workflow is read-only here', { design: 'error' })
      return
    }
    setSaving(true)
    try {
      // A NAME NOBODY WAS ASKED FOR.
      //
      // The row requires one — it is how this is found again — but on the jobs
      // canvas asking for it is asking somebody to invent a label for
      // something that already describes itself. So the steps become the name
      // (see stepSources.autoNameFromSteps: "Load Sales → Refresh Cube") and
      // the field stays optional.
      //
      // Only when it is BLANK, and only for a source that offers one. A name
      // somebody typed is never replaced, and renaming on every save would
      // undo their edit the moment they added a step.
      var source = sourceFor(workflow)
      var toSave = workflow
      if (!String(workflow.name || '').trim() && source.autoName) {
        var derived = source.autoName(workflow.steps)
        if (derived) toSave = Object.assign({}, workflow, { name: derived })
      }
      var ids = await saveWorkflow(toSave)
      var wasNew = !workflow.id
      var savedId = workflow.id || ids[0]
      var fresh = await getWorkflow(savedId)
      setWorkflow(fresh)
      raiseSnackbar('Workflow saved', { design: 'success' })
      if (wasNew) navigate(ROUTES.workflowEditor(fresh.id), { replace: true })
    } catch (err) {
      raiseSnackbar(err.message, { design: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleRun(params) {
    if (!workflow.id) { raiseSnackbar('Save the workflow before running it', { design: 'error' }); return }
    setRunning(true)
    try {
      var result = await runWorkflow(workflow.id, params)
      setRun(result)
    } catch (err) {
      raiseSnackbar(err.message, { design: 'error' })
    } finally {
      setRunning(false)
    }
  }

  var visibleSteps = ((workflow && workflow.steps) || [])
    .map((step, index) => ({ step: step, index: index }))
    .filter((entry) => !entry.step.deleted)

  // Whether this workflow may be edited HERE. True for a flow of screens,
  // whose steps are generated from a design held in another app — the canvas
  // draws it so a run can be followed, and edits nothing.
  var readOnly = isReadOnly(workflow)

  return {
    workflow, actions, saving, running, run, jsonErrors, visibleSteps, selectedIndex, readOnly,
    updateField, addStep, updateStep, updateStepJSON, updateStepPosition, removeStep,
    selectStep, closeDrawer, handleSave, handleRun,
    // The palette and its shape. A Design reads `source.pickFirst` to decide
    // whether "Add step" is a button (pick the action later) or a picker
    // (choose the job first) — rather than branching on the kind itself, which
    // would need editing again for every source added after this one.
    palette, source: sourceFor(workflow), addStepFromPalette
  }
}
