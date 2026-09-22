// THE DESIGNER, AS ONE COMPONENT YOU DROP ONTO A PAGE.
//
//   import { WorkflowDesigner } from '@xeplr/ui-workflow'
//
//   <WorkflowDesigner apiBase="/api/workflow" workflowId={id} />
//
// No Router above it, no routes to register, no layout of its own: it renders
// where you put it. That is the difference between this and
// registerWorkflowUI, which mounts a LIST page and an EDITOR page at URLs and
// is the right thing for a product with a Workflows section of its own. An app
// that already has its own page — "Flows", inside its own shell — wants the
// designer, not a section.
//
// WHY THIS EXISTS AT ALL: there were two flow designers over one engine —
// this canvas, and a screens-only builder in @xeplr/ui-factory that generated
// apps used because mounting a section into their shell was the only way to
// get this one. One designer over one engine means the trigger, the
// conditions and the reference pickers are built once and every app has them.
//
// HEADLESS is the layer below: useWorkflowEditorController is exported too, so
// a host that wants its own look passes `design`, or calls the controller
// itself and renders nothing of ours.

import { useEffect } from 'react'
import { useDesignValidator } from '@xeplr/ui-account'
import { useWorkflowEditorController } from './useWorkflowEditorController.js'
import FlowCanvas from './designs/FlowCanvas.jsx'
import { WORKFLOW_EDITOR_RULES } from './validateDesign.js'
import { configureApiBase } from './api/base.js'
import { configureJobsApi } from './api/jobs.js'
import './designs/workflow.css'
import './designs/workflowCanvas.css'

/**
 * @param apiBase      where THIS app serves @xeplr/workflow — e.g.
 *                     '/api/workflow'. Set before the first request goes out,
 *                     which is why it is a prop and not a context.
 * @param jobsApiBase  where the jobs API is, only for the "connect jobs"
 *                     palette. A separate string because they are separate
 *                     routers — see registerWorkflowUI.
 * @param workflowId   the flow to edit, by id. Omit with `newKind` to start
 *                     a new one.
 * @param workflowKey  the flow to edit, by the name the HOST addresses it
 *                     with (workflows.key). Use this when your own URLs read
 *                     /flows/pool: a page holding a key has nothing to
 *                     translate it with, and passing it as an id is a 404.
 * @param newKind      'workflow' | 'jobs' — the palette a new flow starts with.
 * @param onOpened     (id) → void, once a NEW flow has been saved and has an
 *                     id. A host with URLs per flow navigates here.
 * @param onBack       () → void. Draws a back link when given, nothing when not.
 * @param screens      the screens a Screen step can show: [{ key, name }] or
 *                     ['key', …]. THE HOST'S, because they are: this engine
 *                     carries a screen key and never resolves it (see
 *                     lib/actions/screenShow.js), so the app that owns the
 *                     screens is the only thing that can list them. Given
 *                     none, a Screen step asks for the key as text rather
 *                     than offering an empty menu.
 * @param screenEditor how to design a screen, WITHOUT leaving the flow:
 *                     ({ screenKey, onDone, onClose }) => your editor. The
 *                     designer opens it in a big modal; `screenKey` is null
 *                     for "make a new one". Call `onDone({ key, name, fields })`
 *                     once it is saved — the step takes that screen, and every
 *                     other step showing the same one is brought up to date.
 *                     A render prop because a screen belongs to the APP: this
 *                     package knows a screen key and nothing else about forms.
 * @param design       your own view, taking the controller's props.
 */
export function WorkflowDesigner({ apiBase, jobsApiBase, workflowId, workflowKey, newKind, onOpened, onBack, screens, screenEditor, design, ...rest }) {
  // Before the controller's first effect, not inside one: a page's own mount
  // effect can fire a request, which is too late to be told where the API is.
  if (apiBase !== undefined) configureApiBase(apiBase)
  if (jobsApiBase !== undefined) configureJobsApi(jobsApiBase)
  useEffect(() => {
    if (apiBase !== undefined) configureApiBase(apiBase)
    if (jobsApiBase !== undefined) configureJobsApi(jobsApiBase)
  }, [apiBase, jobsApiBase])

  var controller = useWorkflowEditorController({ workflowId: workflowId, workflowKey: workflowKey, newKind: newKind, onOpened: onOpened, ...rest })
  var ref = useDesignValidator('WorkflowDesigner', WORKFLOW_EDITOR_RULES)
  // FlowCanvas is the designer we are building: a box is born from the arrow
  // of the one before it, and what it is comes first. The older
  // WorkflowCanvasSample still serves the routed pages until every slice of
  // this one has landed (inputs in tabs, conditions, item-wise, triggers).
  var View = design || FlowCanvas
  // wf-builder opts out of a centred column — the canvas wants the width.
  return <div ref={ref} className="wf-builder"><View {...controller} screens={screens} screenEditor={screenEditor} onBack={onBack} /></div>
}

export default WorkflowDesigner
