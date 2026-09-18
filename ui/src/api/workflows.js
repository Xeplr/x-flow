import { authFetch } from '@xeplr/ui-account'
import { configureApiBase, apiPath } from './base.js'

// The mount path now lives in ./base.js so that EVERY api/* module reads the
// same one — see the note there. This re-export keeps registerWorkflowUI's
// public name unchanged.
export function configureWorkflowApi(base) {
  configureApiBase(base)
}

// The workflow document. genericRoute mounts this hierarchy as
// { key: 'workflow', model: Workflow, children: [{ key: 'steps', ... }] } —
// see @xeplr/workflow's lib/router.js — so `steps` comes back eager-loaded on every
// list/get, and a save's changeset carries `steps` nested inside the
// workflow entry, following the same insert/patch/soft-delete rules
// recursively (see genericController.js's processEntry).

// GET /workflows?limit=0 → { dataArray: [...] }, each with `steps` eager-loaded.
export async function listWorkflows() {
  const res = await authFetch(apiPath(`/workflows?limit=0`))
  return res.dataArray || []
}

// GET /workflows/:id → { dataArray: [record] }, `steps` eager-loaded.
export async function getWorkflow(id) {
  const res = await authFetch(apiPath(`/workflows/${id}`))
  return (res.dataArray && res.dataArray[0]) || null
}

// POST /workflows/save — one changeset entry. No `id` on the workflow (or on
// a step inside it) inserts; an `id` patches; `{ id, deleted: true }` soft-
// deletes. Returns every id touched (workflow + any steps).
export async function saveWorkflow(workflow) {
  const res = await authFetch(apiPath(`/workflows/save`), {
    method: 'POST',
    body: JSON.stringify([workflow])
  })
  return res.updatedIds || []
}

export async function deleteWorkflow(id) {
  const res = await authFetch(apiPath(`/workflows/delete`), {
    method: 'POST',
    body: JSON.stringify({ ids: [id] })
  })
  return res.updatedIds || []
}

// POST /workflows/:id/run → { dataArray: [run] }. The engine runs
// synchronously up to the first wait step (or to completion), so the
// returned run's status is already the real outcome of this burst — no
// polling needed to know whether it finished, failed, or is now waiting.
export async function runWorkflow(id, params) {
  const res = await authFetch(apiPath(`/workflows/${id}/run`), {
    method: 'POST',
    body: JSON.stringify(params || {})
  })
  return (res.dataArray && res.dataArray[0]) || null
}

// ── filling in a step's sample output ──────────────────────────────────
// Two endpoints, two very different risk profiles — see @xeplr/workflow's lib/router.js.

// The SAFE one: what this step actually returned last time a real run reached
// it. Returns null when the workflow has never run that far, which is the
// normal state for a workflow being built.
export async function lastStepOutput(workflowId, stepKey) {
  const res = await authFetch(apiPath(`/workflows/${workflowId}/steps/${encodeURIComponent(stepKey)}/last-output`))
  return (res.dataArray && res.dataArray[0]) || null
}

// The LIVE one: RUNS THE ACTION FOR REAL. Not a preview, not a dry run — the
// caller is responsible for confirming with the user first, because this is
// the same runAction the engine calls and email-delete really does expunge.
export async function tryStep(workflowId, { actionName, stepKey, values, params }) {
  const res = await authFetch(apiPath(`/workflows/${workflowId}/steps/try`), {
    method: 'POST',
    body: JSON.stringify({ actionName, stepKey, values, params })
  })
  return (res.dataArray && res.dataArray[0]) || null
}
