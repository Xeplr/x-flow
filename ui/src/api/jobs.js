import { authFetch } from '@xeplr/ui-account'

// THE JOB LIST, for the "connect jobs" palette.
//
// Its OWN base, not workflow's apiPath(). @xeplr/jobs is a separate router and
// a host is free to mount it somewhere unrelated — BI serves workflow at
// /workflow and jobs at the API root. Assuming one prefix covers both is the
// bug base.js was written to fix, one package over.
//
// Read only, and only ever for the palette. This UI never triggers a job: a
// job step is STARTED BY THE ENGINE at run time, through the jobs API, from
// the server. A browser that could trigger jobs directly would be a second
// path to the same side effects with none of the run's bookkeeping.

let jobsBase = ''

export function configureJobsApi(base) {
  jobsBase = (base || '').replace(/\/+$/, '')
}

// NO hasJobsApi() HERE, deliberately. An empty base is the VALID standalone
// case — jobs mounted at the root — so "was it configured" is not a question
// this module can answer, and a function that always returned true would be
// worse than not offering one. A host that has no jobs API simply never opens
// a workflow of kind 'jobs'; if it does, the fetch fails and says so.

export async function listJobs() {
  const res = await authFetch(jobsBase + '/jobs?limit=0')
  return res.dataArray || []
}
