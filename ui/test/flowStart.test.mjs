// HOW A FLOW STARTS, and what comes in with it.
//
// The example someone pastes is read into `params`, which is the contract the
// ENGINE enforces before a run starts. So these are claims about what a run
// will demand, not about a panel: an example that quietly turns into a
// required field refuses runs nobody agreed to refuse, and one that turns into
// a default runs real flows against sample data.
import { paramsFromSample, sampleFromParams, describeStart, startReferences, triggerFor, TRIGGERS, outputOfScreen, applyScreen, syncScreenOutputs, screenEntry } from '../src/flowStart.js'

const results = []
const check = (name, cond) => { results.push([name, cond]); console.log((cond ? '  ok   ' : '  FAIL ') + name) }

const EXAMPLE = `{
  "employeeId": "E-1042",
  "startDate": "2026-10-01",
  "headcount": 3,
  "remote": true,
  "manager": { "email": "sam@acme.com" },
  "kit": ["laptop", "pass"]
}`

console.log('\nan example is read into the contract')
{
  const { params, error } = paramsFromSample(EXAMPLE, [])
  check('no error on good JSON', error === null)
  check('one param per field, in order', params.map((p) => p.name).join() === 'employeeId,startDate,headcount,remote,manager,kit')
  check('types come from the values', params.map((p) => p.type).join() === 'string,string,number,boolean,object,array')
  check('the example value is kept, for the pickers', params[0].example === 'E-1042')

  // The two that would bite.
  check('nothing becomes required', params.every((p) => p.required === false))
  check('nothing becomes a default', params.every((p) => p.default === null))

  // An object is ONE input, not its fields: a caller sends it whole.
  check('a nested object is one param', params.find((p) => p.name === 'manager').type === 'object')
  check('…and its fields are not params of their own', !params.some((p) => p.name === 'email'))
}

console.log('\nre-reading keeps what was decided by hand')
{
  const first = paramsFromSample(EXAMPLE, []).params
  const decided = first.map((p) => p.name === 'employeeId' ? { ...p, required: true, default: 'E-0000', description: 'From the HR system' } : p)
  const again = paramsFromSample('{ "employeeId": "E-2000", "startDate": "2026-11-01" }', decided).params
  const id = again.find((p) => p.name === 'employeeId')
  check('required survives a re-read', id.required === true)
  check('a real default survives too', id.default === 'E-0000')
  check('the description survives', id.description === 'From the HR system')
  check('…but the example follows the new text', id.example === 'E-2000')
  check('a field taken out of the example is gone', again.length === 2)
}

console.log('\nbad input changes nothing')
{
  const good = paramsFromSample(EXAMPLE, []).params
  const broken = paramsFromSample('{ "employeeId": ', good)
  check('a half-typed example is an error, not a wipe', broken.params.length === good.length)
  check('…and says what is wrong', typeof broken.error === 'string' && broken.error.length > 0)

  const list = paramsFromSample('[1, 2, 3]', good)
  check('a list is refused — a run is called with named fields', /has to be an object/.test(list.error))
  check('…and keeps what was there', list.params.length === good.length)
  check('an empty box means no input at all', paramsFromSample('   ', good).params.length === 0)
}

console.log('\nthe example can be reopened and edited')
{
  const params = paramsFromSample('{ "a": 1, "b": "two" }', []).params
  const text = sampleFromParams(params)
  check('it reads back as JSON', JSON.parse(text).a === 1 && JSON.parse(text).b === 'two')
  check('round-trips to the same params', paramsFromSample(text, []).params.map((p) => p.name).join() === 'a,b')
  check('no params is an empty box, not "{}"', sampleFromParams([]) === '')
}

console.log('\nwhat starts it')
{
  check('every trigger has a label', TRIGGERS.every((t) => t.kind && t.label))
  check('a file trigger asks where', triggerFor('file').fields.map((f) => f.name).join() === 'folder,named')
  check('pressing Start asks nothing', triggerFor('manual').fields.length === 0)
  check('an unknown kind falls back rather than blanking', triggerFor('carrier-pigeon').kind === 'manual')
}

console.log('\nthe line the flow shows')
{
  const params = paramsFromSample('{ "a": 1, "b": 2 }', []).params
  check('how it starts and how much comes in',
    describeStart({ kind: 'api' }, params) === 'Another system calls it · 2 fields in')
  check('one field reads as one', describeStart({ kind: 'api' }, [params[0]]) === 'Another system calls it · 1 field in')
  check('nothing coming in says only how it starts', describeStart({ kind: 'file' }, []) === 'A file arrives')
  check('no trigger set is still a sentence', describeStart(null, []) === 'Someone presses Start')
}

console.log('\nwhat a picker offers from the flow')
{
  const params = paramsFromSample('{ "employeeId": "E-1042" }', []).params
  const refs = startReferences(params)
  check('the token is what a step writes', refs[0].token === 'params.employeeId')
  check('with its example beside it', refs[0].example === 'E-1042')
  check('a param with no name is not offered', startReferences([{ name: '' }, params[0]]).length === 1)
}

console.log('\na screen already knows what it hands back')
{
  // The one step whose output is not a guess. Asking somebody to paste an
  // example of a form's own fields is asking them to retype what the app
  // knows — and to retype it again every time the form changes.
  const screen = {
    key: 'task_edit',
    name: 'Task',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'done', type: 'checkbox' },
      { name: 'dueDate', type: 'date' },
      { name: 'estimate', type: 'number' }
    ]
  }
  const out = outputOfScreen(screen)
  check('every field of the form is in it', ['title', 'done', 'dueDate', 'estimate'].every((k) => k in out))

  // The SHAPE is the part that matters: a condition comparing numbers has to
  // know it is comparing numbers.
  check('a number reads as a number', typeof out.estimate === 'number')
  check('a checkbox reads as a boolean', out.done === false)
  check('a date looks like a date', /^\d{4}-\d{2}-\d{2}$/.test(out.dueDate))
  check('text is text', out.title === '')

  // Added because the facade adds it on submit — the row the screen wrote.
  check('recordId is there, though no form declares it', 'recordId' in out)

  // The real shapes @xeplr/ui-factory produces — checked against the type
  // names its own controls use, so a form built there reads correctly here.
  const real = outputOfScreen({ fields: [
    { name: 'tags', type: 'multiselect' }, { name: 'attachment', type: 'file' },
    { name: 'status', type: 'dropdown' }, { name: 'blocked', type: 'checkbox' },
    { name: 'remindAt', type: 'datetime' }
  ] })
  check('a multi-select is a list, not a word', Array.isArray(real.tags))
  check('a file is a list too', Array.isArray(real.attachment))
  check('a dropdown is one value', real.status === '')
  check('a checkbox is false', real.blocked === false)
  check('a datetime carries a time', /T\d{2}:\d{2}$/.test(real.remindAt))

  check('a bare field name still works', outputOfScreen({ fields: ['title'] }).title === '')
  check('a screen whose fields the host did not say is null, not empty',
    outputOfScreen({ key: 'x', name: 'X' }) === null)
  check('...and so is one with an empty list', outputOfScreen({ fields: [] }) === null)
  check('nothing at all is null', outputOfScreen(null) === null)
}

console.log('\na field added to a form reaches every step that shows it')
{
  const SHOW = 'screen-show'
  const before = [{ key: 'task_edit', name: 'Task', fields: [{ name: 'title', type: 'text' }] }]
  const after = [{ key: 'task_edit', name: 'Task', fields: [
    { name: 'title', type: 'text' }, { name: 'assignee', type: 'text' }
  ] }]

  const steps = [
    { actionName: SHOW, values: { screen: 'task_edit' }, sampleOutput: outputOfScreen(before[0]) },
    { actionName: 'email-send', values: {}, sampleOutput: { messageId: 'm1' } },
    { actionName: SHOW, values: { screen: 'task_edit' }, sampleOutput: outputOfScreen(before[0]) }
  ]

  const changed = syncScreenOutputs(steps, after, SHOW)
  check('every step showing that form is updated', changed.map((c) => c.index).join() === '0,2')
  check('...with the new field in it', 'assignee' in changed[0].sampleOutput)
  check('a step showing nothing of the sort is left alone',
    !changed.some((c) => c.index === 1))
  check('nothing changes when the form did not', syncScreenOutputs(steps, before, SHOW).length === 0)

  // Somebody's own typing is not overwritten by a form we know nothing about.
  const typed = [{ actionName: SHOW, values: { screen: 'legacy' }, sampleOutput: { whatever: 1 } }]
  check('a screen the host did not describe keeps what was typed',
    syncScreenOutputs(typed, after, SHOW).length === 0)
  check('a screen step with no screen yet is skipped',
    syncScreenOutputs([{ actionName: SHOW, values: {} }], after, SHOW).length === 0)
}

console.log('\npicking a screen is one decision, not two')
{
  const screen = { key: 'task_edit', name: 'Task', fields: [{ name: 'title', type: 'text' }] }
  const patch = applyScreen({ values: { other: 'kept' } }, screen)
  check('it says which screen', patch.values.screen === 'task_edit')
  check('...keeps anything else already on the step', patch.values.other === 'kept')
  check('...and says what it therefore hands back', 'title' in patch.sampleOutput)

  const unknown = applyScreen({ values: {}, sampleOutput: { mine: 1 } }, { key: 'plain', name: 'Plain' })
  check('a screen with no fields does not wipe a typed example', unknown.sampleOutput === undefined)

  check('screenEntry accepts a bare key in the list', screenEntry(['a', 'b'], 'b').name === 'b')
  check('...and an unknown one is null, not a guess', screenEntry(['a'], 'z') === null)
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
