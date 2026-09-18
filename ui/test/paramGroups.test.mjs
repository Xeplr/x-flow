// The step editor's parameter helpers: visibility, run-parameter tokens,
// declarations, and what a person types into a cell.
//
// The layout checks against the REAL @xeplr/actions schemas live in
// test/paramLayout.test.mjs — with the peers
// @xeplr/actions needs to load; this one does not.

import { visibleWhen, hasValue, paramSamples, collectDeclarations, validateDeclaration, parseCellValue, formatCellValue } from '../src/paramGroups.js'
import { referencesFor } from '../src/conditions.js'

const results = []
const check = (n, c) => { results.push([n, c]); console.log((c ? '  ok   ' : '  FAIL ') + n) }

console.log('\nvisibleWhen / hasValue edge cases')
{
  const f = { name: 'x', showWhen: { field: 'flag', equals: true } }
  check('an unset boolean reads as false', !visibleWhen(f, {}))
  check('the string "true" counts', visibleWhen(f, { flag: 'true' }))
  const g = { name: 'y', showWhen: { field: 'flag', equals: false } }
  check('equals:false matches an unset field', visibleWhen(g, {}))
  check('no showWhen is always visible', visibleWhen({ name: 'z' }, {}))
  check('empty string is not a value', !hasValue({ name: 'a' }, { a: '' }))
  check('false is not a value', !hasValue({ name: 'a', type: 'boolean' }, { a: false }))
  check('0 is a value', hasValue({ name: 'a', type: 'number' }, { a: 0 }))
}

console.log('\na workflow\'s declared params become referenceable tokens')
{
  // The picker needs sample VALUES; workflows.params is a DECLARATION list.
  // Handing the list over directly yields {params.0.name} — plausible tokens
  // that resolve to nothing.
  const declared = [
    { name: 'customerId', type: 'string', required: true, sample: 'cus_8812' },
    { name: 'tier',       type: 'string', default: 'standard' },
    { name: 'seats',      type: 'number' }
  ]
  const samples = paramSamples(declared)
  check('sample wins when given', samples.customerId === 'cus_8812')
  check('default is the fallback', samples.tier === 'standard')
  check('type placeholder is the last resort', samples.seats === 0)
  check('no index-shaped keys leak in', !Object.keys(samples).some((k) => /^\d/.test(k)))

  // And the tokens it produces must be the ones the engine resolves.
  const groups = referencesFor([], 0, samples, false)
  const runGroup = groups.find((g) => g.label === 'Run parameters')
  check('the picker offers a Run parameters group', Boolean(runGroup))
  const tokens = runGroup.items.map((i) => i.token)
  check('offering {params.customerId}', tokens.includes('{params.customerId}'))
  check('and not {params.0.name}', !tokens.some((t) => /params\.\d/.test(t)))
  check('the sample is shown beside it',
    runGroup.items.find((i) => i.name === 'customerId').preview === 'cus_8812')

  check('no declaration means no group', !referencesFor([], 0, paramSamples([]), false)
    .some((g) => g.label === 'Run parameters'))
  check('null is safe', Object.keys(paramSamples(null)).length === 0)
}

console.log('\nthe picker offers the union across every step')
{
  // Mirrors workflowRunner's collectParams — a parameter declared on step 1
  // must be bindable from step 4, and the two must agree on the rules or the
  // builder offers a token the engine will refuse.
  const steps = [
    { stepKey: 'a', params: [{ name: 'orgId', type: 'string', sample: 'org_1' }] },
    { stepKey: 'b', params: [{ name: 'orgId', required: true }, { name: 'since', type: 'date' }] }
  ]
  const union = collectDeclarations(steps)
  check('declared once though named twice', union.length === 2)
  check('required anywhere means required', union.find((f) => f.name === 'orgId').required === true)
  check('the earlier declaration wins otherwise',
    union.find((f) => f.name === 'orgId').type === 'string')

  const tokens = referencesFor([], 0, paramSamples(union), false)
    .find((g) => g.label === 'Run parameters').items.map((i) => i.token)
  check('step a\'s parameter is bindable', tokens.includes('{params.orgId}'))
  check('step b\'s too', tokens.includes('{params.since}'))
  check('a step declaring nothing contributes nothing',
    collectDeclarations([{ stepKey: 'x' }, { stepKey: 'y', params: null }]).length === 0)
}

console.log('\na declaration that would silently do nothing is refused')
{
  // applySchema SKIPS a nameless field and lets a duplicate shadow — either
  // way you get a required parameter the run never asks for, with nothing
  // anywhere saying why. Caught at save instead.
  const errs = validateDeclaration([
    { name: 'ok' }, { name: '' }, { name: 'ok' }, { name: 'has space' }, { name: '9lives' }
  ])
  check('blank name refused', Boolean(errs[1]))
  check('duplicate refused', Boolean(errs[2]))
  check('a space refused — it becomes a token', Boolean(errs[3]))
  check('a leading digit refused', Boolean(errs[4]))
  check('the valid one is not flagged', !errs[0])
  check('a clean declaration passes',
    Object.keys(validateDeclaration([{ name: 'customerId' }, { name: 'tier_2' }])).length === 0)
}

console.log('\nan array field takes what a person actually types')
{
  const to = { name: 'to', type: 'array' }
  // The bug: `to` is declared array, so a typed address was JSON.parsed, threw,
  // and the required check then relabelled it "to is required" — pointing at a
  // box with the address plainly sitting in it.
  check('a bare address becomes a list of one',
    JSON.stringify(parseCellValue(to, 'vikasbhandari2@gmail.com').value) === '["vikasbhandari2@gmail.com"]')
  check('a comma-separated list splits',
    JSON.stringify(parseCellValue(to, 'a@b.com, c@d.com').value) === '["a@b.com","c@d.com"]')
  check('real JSON is still honoured',
    JSON.stringify(parseCellValue(to, '["a@b.com"]').value) === '["a@b.com"]')
  check('broken JSON is an error, not a guess', Boolean(parseCellValue(to, '[bad').error))

  // The one that matters most: a binding is a TEMPLATE, not a value. Parsing
  // it would mean typing ["{params.email}"] for the commonest thing anyone
  // ever binds.
  check('a token is kept as the template it is',
    parseCellValue(to, '{params.email}').value === '{params.email}')
  check('...even mixed into text',
    parseCellValue(to, '{params.email}, ops@x.com').value === '{params.email}, ops@x.com')

  const conn = { name: 'connection', type: 'object' }
  check('an object still needs JSON', Boolean(parseCellValue(conn, 'nonsense').error))
  check('and takes it', parseCellValue(conn, '{"host":"x"}').value.host === 'x')
  check('a token passes through for objects too',
    parseCellValue(conn, '{params.conn}').value === '{params.conn}')
  check('a plain string field is never reshaped',
    parseCellValue({ name: 'subject', type: 'string' }, 'a, b') === 'a, b' ||
    parseCellValue({ name: 'subject', type: 'string' }, 'a, b').value === 'a, b')
}

console.log('\nopen, touch nothing, save — the value must survive')
{
  // formatCellValue exists because React renders a stored array into a
  // textarea via toString: attachments become the literal "[object Object]",
  // and the next save writes that over the real value. Silent and total.
  const roundTrip = (field, stored) => {
    const text = formatCellValue(field, stored)
    check('  ' + field.type + ' ' + JSON.stringify(stored) + ' does not stringify to junk',
      !text.includes('[object'))
    const back = parseCellValue(field, text)
    check('  ...and round-trips unchanged',
      !back.error && JSON.stringify(back.value) === JSON.stringify(stored))
  }
  roundTrip({ name: 'to', type: 'array' }, ['a@b.com'])
  roundTrip({ name: 'to', type: 'array' }, ['a@b.com', 'c@d.com'])
  roundTrip({ name: 'attachments', type: 'array' }, [{ filename: 'a.pdf', path: '/tmp/a.pdf' }])
  roundTrip({ name: 'connection', type: 'object' }, { host: 'smtp.x.com', port: 587 })

  // NOT a strict round-trip, and deliberately so: a one-element list holding
  // only a token renders as the bare token, and comes back as the string.
  // Editing `to` as `{params.email}` rather than `["{params.email}"]` is worth
  // it, and the two are equivalent by the time they run — @xeplr/actions'
  // coerceScalars wraps the resolved string for an array field.
  //
  // The string form is in fact the more correct of the two: if the parameter
  // resolves to a LIST of addresses, `["{params.recipients}"]` would resolve
  // each element separately and produce one mangled entry, where the bare
  // token hands the whole value over.
  {
    const to = { name: 'to', type: 'array' }
    const text = formatCellValue(to, ['{params.email}'])
    check('a lone token renders bare, not bracketed', text === '{params.email}')
    check('and comes back as the template', parseCellValue(to, text).value === '{params.email}')
  }

  // An element containing a comma must not be joined, or it splits back into
  // two different values.
  const tricky = ['Doe, John <j@x.com>']
  const back = parseCellValue({ type: 'array' }, formatCellValue({ type: 'array' }, tricky))
  check('an element with a comma survives', JSON.stringify(back.value) === JSON.stringify(tricky))

  check('null renders empty, not "null"', formatCellValue({ type: 'array' }, null) === '')
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
