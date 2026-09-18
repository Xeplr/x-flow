import { useEffect, useState, useCallback } from 'react'
import { raiseSnackbar } from '@xeplr/ui-utils'
import { listWorkflows, saveWorkflow, deleteWorkflow } from './api/workflows.js'

export function useWorkflowListController() {
  const [rows, setRows] = useState(null)

  const reload = useCallback(() => {
    listWorkflows()
      .then(setRows)
      .catch((err) => { setRows([]); raiseSnackbar(err.message, { design: 'error' }) })
  }, [])

  useEffect(() => { reload() }, [reload])

  // Returns the new workflow's id so the Design can navigate straight into
  // the editor — a name with nothing else is a valid, saveable draft.
  //
  // `kind` is what "Connect jobs" passes, and it is fixed AT CREATION rather
  // than switchable afterwards. Flipping an existing workflow from 'jobs' to
  // 'workflow' would leave its job steps in place with a palette that can no
  // longer explain them — the steps still run, but the canvas they are drawn
  // on has stopped being about them. A new workflow is cheap; a half-converted
  // one is not.
  async function handleCreate(name, kind) {
    try {
      const ids = await saveWorkflow({ name, kind: kind || 'workflow', status: 'draft', steps: [] })
      await reload()
      return ids[0]
    } catch (err) {
      raiseSnackbar(err.message, { design: 'error' })
      return null
    }
  }

  async function handleDelete(id) {
    try {
      await deleteWorkflow(id)
      await reload()
    } catch (err) {
      raiseSnackbar(err.message, { design: 'error' })
    }
  }

  return { rows, handleCreate, handleDelete, reload }
}
