import { authFetch } from '@xeplr/ui-account'
import { apiPath } from './base.js'

export async function listWorkspaces() {
  const res = await authFetch(apiPath('/workspaces?limit=0'))
  return res.dataArray || []
}

export async function createWorkspace(name, companyId) {
  const res = await authFetch(apiPath('/workspaces/save'), {
    method: 'POST',
    body: JSON.stringify([{ name, companyId }])
  })
  const id = res.updatedIds && res.updatedIds[0]
  return { id, name, companyId }
}
