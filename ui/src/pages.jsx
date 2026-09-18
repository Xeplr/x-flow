import { useDesignValidator } from '@xeplr/ui-account'
import { useWorkflowListController } from './useWorkflowListController.js'
import { useWorkflowEditorController } from './useWorkflowEditorController.js'
import WorkflowListSample from './designs/WorkflowListSample.jsx'
import WorkflowCanvasSample from './designs/WorkflowCanvasSample.jsx'
import { WORKFLOW_LIST_RULES, WORKFLOW_EDITOR_RULES } from './validateDesign.js'

// Ready-made pages — controller + Design wired together. Each takes an
// optional `design` prop to re-skin while keeping the controller and the
// validation wrapper, the same shape @xeplr/ui-account's LoginPage etc. use.

export function WorkflowListPage({ design, ...props }) {
  var controller = useWorkflowListController(props)
  var ref = useDesignValidator('WorkflowListPage', WORKFLOW_LIST_RULES)
  var View = design || WorkflowListSample
  return <div ref={ref}><View {...controller} /></div>
}

export function WorkflowEditorPage({ workflowId, newKind, design, ...props }) {
  var controller = useWorkflowEditorController({ workflowId: workflowId, newKind: newKind, ...props })
  var ref = useDesignValidator('WorkflowEditorPage', WORKFLOW_EDITOR_RULES)
  var View = design || WorkflowCanvasSample
  // wf-builder opts this route out of the centred column (see index.css) —
  // the canvas wants the width, unlike every other page in this app.
  return <div ref={ref} className="wf-builder"><View {...controller} /></div>
}
