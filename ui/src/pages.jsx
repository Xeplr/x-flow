import { useNavigate } from 'react-router-dom'
import { useDesignValidator } from '@xeplr/ui-account'
import { ROUTES } from './routes.js'
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
  // The ROUTED host is where react-router lives now: the controller and the
  // canvas take callbacks, so the designer can also be dropped onto a page
  // with no Router above it (see WorkflowDesigner).
  var navigate = useNavigate()
  var controller = useWorkflowEditorController({
    workflowId: workflowId,
    newKind: newKind,
    onOpened: (id) => navigate(ROUTES.workflowEditor(id), { replace: true }),
    ...props
  })
  var ref = useDesignValidator('WorkflowEditorPage', WORKFLOW_EDITOR_RULES)
  var View = design || WorkflowCanvasSample
  // wf-builder opts this route out of the centred column (see index.css) —
  // the canvas wants the width, unlike every other page in this app.
  return (
    <div ref={ref} className="wf-builder">
      <View
        {...controller}
        onBack={() => navigate((controller.source && controller.source.backTo) === 'jobs' ? ROUTES.jobs() : ROUTES.workflows())}
      />
    </div>
  )
}
