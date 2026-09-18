import { authFetch } from '@xeplr/ui-account'
import { apiPath } from './base.js'

// THE CATALOG — what a step can be.
//
// Served from the server's own action registry, which is also what the runner
// validates against. That is the point: a step editor told separately what
// `httpRequest` accepts would be a second description of the action, and the
// day the two disagree the form collects a field the action ignores.
export async function listActions() {
  const res = await authFetch(apiPath('/actions'))
  return res.dataArray || []
}
