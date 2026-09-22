// @flags: --preserve-symlinks
// The step editor's form layout, checked against the REAL action schemas that
// ship in @xeplr/actions rather than against fixtures. A fixture would keep
// passing the day send-email renames a field.
//
// @xeplr/actions and the peers it loads with are DEV dependencies of this
// package, for this test only — nothing a consumer installs. (It used to live in
// the workflow backend, which had them; the two are separate packages now.)
// --preserve-symlinks: see actionCatalog.test.mjs.

import { createRequire } from 'node:module'
import { layoutParams, askedFields, paramTabs, MAIN_TAB } from '../src/paramGroups.js'

const require = createRequire(import.meta.url)
const builtins = require('@xeplr/actions').builtins

const results = []
const check = (n, c) => { results.push([n, c]); console.log((c ? '  ok   ' : '  FAIL ') + n) }
const never = () => false
const names = (rows) => rows.map((r) => r.kind === 'field' ? r.field.name : '▸' + r.name)

const sendEmail = builtins.sendEmail.inputSchema

console.log('\nthe first question is which server sends it')
{
  check('useCustomConnection is declared first', sendEmail[0].name === 'useCustomConnection')
  const rows = layoutParams(sendEmail, {}, never)
  check('and it is the first row drawn', rows[0].kind === 'field' && rows[0].field.name === 'useCustomConnection')
  check('its connection box is not asked until it is ticked', !names(rows).includes('connection'))
  const ticked = layoutParams(sendEmail, { useCustomConnection: true }, never)
  check('ticking it asks for the connection', names(ticked).includes('connection'))
}

console.log('\n13 declared inputs collapse to a form you can read')
{
  const rows = layoutParams(sendEmail, {}, never)
  const fields = rows.filter((r) => r.kind === 'field')
  const groups = rows.filter((r) => r.kind === 'group')
  check('every input is accounted for',
    fields.length + groups.reduce((n, g) => n + g.fields.length, 0) === askedFields(sendEmail, {}).length)
  check('at most 6 open rows', fields.length <= 6)
  check('the rest are behind group headers', groups.length > 0)
  check('nothing opens by default here', groups.every((g) => !g.open))
}

console.log('\nshowWhen is a BRANCH — the field is not asked at all')
{
  const withTemplate = { templateName: 'user-registration' }
  const asked = askedFields(sendEmail, withTemplate).map((f) => f.name)
  check('picking a template stops asking for a subject', !asked.includes('subject'))
  check('...and for html', !asked.includes('html'))
  check('...and for text, which is inside a group', !asked.includes('text'))
  check('it does ask for the template variables', asked.includes('templateVars'))
  check('`to` is asked either way', asked.includes('to'))

  const blank = askedFields(sendEmail, {}).map((f) => f.name)
  check('with no template, subject comes back', blank.includes('subject'))
  check('and templateVars is gone', !blank.includes('templateVars'))
}

console.log('\na branched-away field leaves no empty group header behind')
{
  // 'Message options' holds `text` (branched) and `attachments` (always).
  const withTemplate = layoutParams(sendEmail, { templateName: 'x' }, never)
  const g = withTemplate.find((r) => r.kind === 'group' && r.name === 'Message options')
  check('the group survives on its remaining member', g && g.fields.length === 1)
  check('and that member is attachments', g && g.fields[0].name === 'attachments')
}

console.log('\nwhen a group starts open')
{
  const shut = layoutParams(sendEmail, {}, never)
  const addresses = () => shut.find((r) => r.kind === 'group' && r.name === 'More addresses')
  check('shut when nothing in it is set', !addresses().open)

  const filled = layoutParams(sendEmail, { cc: 'ops@example.com' }, never)
  check('open when a member is filled in',
    filled.find((r) => r.kind === 'group' && r.name === 'More addresses').open)

  const erroring = layoutParams(sendEmail, {}, (n) => n === 'bcc')
  check('open when a member is erroring — the message must not point somewhere invisible',
    erroring.find((r) => r.kind === 'group' && r.name === 'More addresses').open)

  // db-move puts writeMode (default 'append') in a group; leaving the default
  // alone must not count as "filled in", or every group springs open.
  const move = builtins.dbMove.inputSchema
  const untouched = layoutParams(move, { writeMode: 'append' }, never)
  check('a value equal to the default does not count as set',
    !untouched.find((r) => r.kind === 'group' && r.name === 'Write options').open)
  const changed = layoutParams(move, { writeMode: 'upsert' }, never)
  check('a value different from the default does',
    changed.find((r) => r.kind === 'group' && r.name === 'Write options').open)
}

console.log('\na required field is never hidden behind a shut header')
{
  const every = Object.keys(builtins)
    .map((k) => builtins[k])
    .filter((d) => d && Array.isArray(d.inputSchema))
  check('there are schemas to check', every.length >= 10)
  let bad = []
  every.forEach((d) => {
    layoutParams(d.inputSchema, {}, never).forEach((r) => {
      if (r.kind !== 'group' || r.open) return
      r.fields.filter((f) => f.required).forEach((f) => bad.push(d.name + '.' + f.name))
    })
  })
  check('no required field sits inside a collapsed group: ' + (bad.join(', ') || 'none'), bad.length === 0)
}

console.log('\nevery shipped schema still lays out')
{
  const every = Object.keys(builtins).map((k) => builtins[k]).filter((d) => d && Array.isArray(d.inputSchema))
  let lost = []
  every.forEach((d) => {
    const rows = layoutParams(d.inputSchema, {}, never)
    const drawn = rows.reduce((n, r) => n + (r.kind === 'field' ? 1 : r.fields.length), 0)
    if (drawn !== askedFields(d.inputSchema, {}).length) lost.push(d.name)
    rows.forEach((r) => { if (r.kind === 'group' && !r.fields.length) lost.push(d.name + ' empty group') })
  })
  check('no field is dropped or duplicated: ' + (lost.join(', ') || 'none'), lost.length === 0)
}

// ── THE SAME DECLARATIONS AS TABS ──────────────────────────────────────
// The canvas draws this form inside a box that sits ON the canvas, where a
// collapsed group is still a row of box and opening one moves every arrow
// below it. Tabs cost one line whatever is behind them.
console.log('\ninputs as tabs')
{
  const read = Object.keys(builtins).map((k) => builtins[k]).find((d) => d.name === 'email-read')
  const tabs = paramTabs(read.inputSchema, {})
  check('the main tab leads', tabs[0].name === MAIN_TAB)
  check('one tab per group, in the order they are declared',
    tabs.map((t) => t.name).join(' | ') === MAIN_TAB + ' | Filters | Output')
  check('a grouped field is on its group, not on the main tab',
    !tabs[0].fields.some((f) => f.group))
  check('every asked field lands on exactly one tab',
    tabs.reduce((n, t) => n + t.fields.length, 0) === askedFields(read.inputSchema, {}).length)

  // A tab says it is holding something without being opened — otherwise the
  // only way to find a filter somebody set last month is to click every tab.
  const filled = paramTabs(read.inputSchema, { since: '2026-01-01' })
  check('a tab counts what is set on it', filled.find((t) => t.name === 'Filters').filled === 1)
  check('…and counts nothing on the tabs that are empty', filled[0].filled === 0)
  check('a default sitting in the box is not something somebody set',
    paramTabs(read.inputSchema, { folder: 'INBOX' })[0].filled === 0)
}

console.log('\nbranching still decides what is asked')
{
  const read = Object.keys(builtins).map((k) => builtins[k]).find((d) => d.name === 'email-read')
  const off = paramTabs(read.inputSchema, {})[0].fields.map((f) => f.name)
  const on = paramTabs(read.inputSchema, { useCustomConnection: true })[0].fields.map((f) => f.name)
  check('a branched-away field is on no tab at all', !off.includes('connection'))
  check('…and appears once the branch is taken', on.includes('connection'))

  // The caller has to cope with the tab it was showing going away: an action
  // whose whole group is branched away must not leave a tab pointing at
  // nothing.
  const every = Object.keys(builtins).map((k) => builtins[k]).filter((d) => d && Array.isArray(d.inputSchema))
  let empty = []
  every.forEach((d) => paramTabs(d.inputSchema, {}).forEach((t) => { if (!t.fields.length) empty.push(d.name + '.' + t.name) }))
  check('no tab is ever empty: ' + (empty.join(', ') || 'none'), empty.length === 0)

  let lost = []
  every.forEach((d) => {
    const drawn = paramTabs(d.inputSchema, {}).reduce((n, t) => n + t.fields.length, 0)
    if (drawn !== askedFields(d.inputSchema, {}).length) lost.push(d.name)
  })
  check('no field is dropped or duplicated across every shipped schema: ' + (lost.join(', ') || 'none'), lost.length === 0)
  check('an action with no inputs has no tabs', paramTabs([], {}).length === 0)
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
