// The URL convention, as a test.
//
// Every state worth returning to has a URL — the rule the whole routes file
// exists to keep. When edit mode is internal state instead, the back button
// does nothing, a refresh drops you back to view, and an edit link cannot be
// shared. These checks are what stop that creeping back in as pages are added.
//
// Deliberately tests `withId` rather than only the routes defined today: it is
// the builder every route the workflow document brings will be made from, so it
// is the piece worth pinning down before those exist.
import { ROUTES, withId, setRouteBase } from '../src/routes.js'

const results = []
const check = (name, cond) => { results.push([name, cond]); console.log((cond ? '  ok   ' : '  FAIL ') + name) }

console.log('\nthe pages that exist')
check('home', ROUTES.home() === '/')
check('the workspace', ROUTES.workspace() === '/workspace')
check('the action catalog', ROUTES.actions() === '/workspace/actions')
check('dashboards', ROUTES.dashboards() === '/workspace/dashboards')
check('jobs', ROUTES.jobs() === '/workspace/jobs')

console.log('\nthe two scope pickers sit at different levels')
// Not a tidiness point. Company selection is what you use when you have NO
// company, and every workspace-scoped route 403s until you do — so it cannot
// live under /workspace, or the page that fixes the problem would be behind
// the problem. A workspace is chosen from within a company, so it can.
check('company selection is outside the workspace', ROUTES.selectCompany() === '/select-company')
check('...and does not sit under it', !ROUTES.selectCompany().startsWith(ROUTES.workspace()))
check('workspace selection is inside', ROUTES.selectWorkspace().startsWith(ROUTES.workspace() + '/'))

console.log('\nthe convention new routes are built from')
check('no id is the list', withId('/workspace/things') === '/workspace/things')
check('an id is that record', withId('/workspace/things', 'abc') === '/workspace/things?id=abc')
// The routes that already take one. They are single pages today and become
// list-or-record without the URL changing, which is the point of adopting the
// convention before there is anything to address.
check('dashboards take an id', ROUTES.dashboards('d1') === '/workspace/dashboards?id=d1')
check('jobs take an id', ROUTES.jobs('j1') === '/workspace/jobs?id=j1')
// A mode is a path SEGMENT with the id still in the query, so switching mode is
// a path change and nothing else — which is what makes the toggle a real
// navigation the back button can undo.
check('a mode keeps the id in the query', withId('/workspace/things/edit', 'abc') === '/workspace/things/edit?id=abc')

console.log('\nids are encoded')
// Ids are generated, so this is belt and braces — but a raw & in a URL
// silently truncates the parameter, and a truncated id reads as "not found"
// rather than as a bug.
check('a & does not start a second parameter', withId('/x', 'a&b=c') === '/x?id=a%26b%3Dc')
check('a space is encoded', withId('/x', 'a b') === '/x?id=a%20b')

console.log('\nno route builds an empty query')
{
  // `?id=` with nothing after it is a URL that looks like a record and is not
  // one — every reader of useRouteId would get '' and try to load it.
  const empties = ['', null, undefined, 0].map((v) => withId('/x', v))
  check('a missing id omits the query entirely', empties.every((p) => p === '/x'))
  // Narrowed from "no fixed route contains a ?" to "none builds an EMPTY
  // parameter", which is what the comment above has always said this is for.
  // connectJobs() carries a real one — ?kind=jobs, the palette a new canvas
  // opens on — and forbidding every query would forbid that whole shape of
  // route rather than the bug being guarded against.
  const emptyParam = /[?&][^=&]+=(?:&|$)|\?$/
  check('...and no fixed route builds an empty parameter',
    Object.values(ROUTES).every((build) => !emptyParam.test(build())))
}

console.log('\nconnecting jobs')
{
  // The same editor, opened on an empty jobs canvas — not a second page, and
  // nothing created up front.
  check('opens the editor rather than a page of its own', ROUTES.connectJobs().includes('/workflows/edit'))
  check('names the palette', ROUTES.connectJobs().includes('kind=jobs'))
  check('creates nothing up front — no id', !ROUTES.connectJobs().includes('id='))
  setRouteBase('/acme/main')
  check('honours the host route base', ROUTES.connectJobs().startsWith('/acme/main/'))
  setRouteBase('')
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
