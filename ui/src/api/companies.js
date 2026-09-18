import { authFetch, getActiveScope, setActiveScope } from '@xeplr/ui-account'
import { apiPath } from './base.js'

// App-data endpoints are bare paths on the api (proxied in dev — see
// vite.config.js, which reads the target from .env). authFetch adds Bearer +
// x-company-id (l1) and JSON-parses the response.
//
// The active COMPANY *is* the l1 scope, so it is read and written through the
// framework's generic per-level scope helpers rather than a localStorage key of
// our own — that is what makes the header actually go out on every request. See
// main.jsx's registerMTs() for the level→header mapping.

// GET /companies?limit=0 → { dataArray: [...] }
export async function listCompanies() {
  const res = await authFetch(apiPath('/companies?limit=0'))
  return res.dataArray || []
}

// POST /companies/save with a changeset [{ name }] → { updatedIds: [id] }.
// Returns the created row so the picker can auto-select it.
export async function createCompany(name) {
  const res = await authFetch(apiPath('/companies/save'), {
    method: 'POST',
    body: JSON.stringify([{ name }])
  })
  const id = res.updatedIds && res.updatedIds[0]
  return { id, name }
}

export function getActiveCompany() {
  return getActiveScope('l1')
}

export function setActiveCompany(company) {
  setActiveScope('l1', company)
}

export function getActiveWorkspace() {
  return getActiveScope('l2')
}

export function setActiveWorkspace(workspace) {
  setActiveScope('l2', workspace)
}
