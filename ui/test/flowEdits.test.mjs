// HOW A FLOW GROWS — the edits the canvas makes, held still.
//
// Every one of these is a claim about what the ENGINE will do afterwards, not
// about what the canvas looks like: a transition pointing at a key that no
// longer exists fails the run with "targets unknown step", and a splice that
// drops the tail silently shortens somebody's flow. Neither shows on screen.
import { keyFor, blankStep, addAfter, link, unlink, insertOn, rename, removeStep, edgesOf, liveSteps, SCREEN_ACTION} from '../src/flowEdits.js'

const results = []
const check = (name, cond) => { results.push([name, cond]); console.log((cond ? '  ok   ' : '  FAIL ') + name) }

const stepOf = (wf, i) => wf.steps[i]
const keyAt = (wf, i) => wf.steps[i].stepKey
const targetsOf = (wf, i) => ((wf.steps[i].transitions) || []).map((t) => t.target)

// A flow of one, as a new one starts.
const START = { id: 'w1', steps: [{ stepKey: 'find_invoices', name: 'Find invoices', actionName: 'db-fetch', kind: 'auto', transitions: null, layout: { x: 60, y: 100 } }] }

console.log('\na key comes from the name, and stays unique')
check('spaces and case', keyFor('Chase the customer', []) === 'chase_the_customer')
check('punctuation collapses', keyFor('Email — 2nd reminder!', []) === 'email_2nd_reminder')
check('a taken key gets a number', keyFor('Send email', ['send_email']) === 'send_email_2')
check('…and keeps counting', keyFor('Send email', ['send_email', 'send_email_2']) === 'send_email_3')
check('an empty name still yields a key', keyFor('', []) === 'step')

console.log('\na new box is born from the arrow of the one before it')
{
  const { workflow, index } = addAfter(START, 0, 'action', 'Chase the customer')
  check('the step exists', liveSteps(workflow).length === 2 && index === 1)
  check('linked from the one it came out of', targetsOf(workflow, 0).join() === 'chase_the_customer')
  check('it lands under it', stepOf(workflow, 1).layout.y > stepOf(workflow, 0).layout.y)
  check('and shares its column', stepOf(workflow, 1).layout.x === stepOf(workflow, 0).layout.x)
  check('it has no action yet — that is the next question', stepOf(workflow, 1).actionName === '')
  check('nothing leads out of it yet', targetsOf(workflow, 1).length === 0)

  // A second one out of the SAME box is a fork, so it stands beside the first.
  const two = addAfter(workflow, 0, 'action', 'Log it')
  check('a second arrow out of one box is a fork', targetsOf(two.workflow, 0).join() === 'chase_the_customer,log_it')
  check('…and it does not land on top of the first',
    stepOf(two.workflow, 2).layout.x !== stepOf(two.workflow, 1).layout.x)
}

console.log('\na condition is a box like any other, with its own kind')
{
  const { workflow, index } = addAfter(START, 0, 'condition', 'Anything overdue?')
  check('kind says what it is', stepOf(workflow, index).kind === 'condition')
  check('an action does not carry that kind', stepOf(addAfter(START, 0, 'action', 'x').workflow, 1).kind === 'auto')
}

console.log('\nlinking by dragging one box onto another')
{
  const a = addAfter(START, 0, 'action', 'Chase').workflow
  const b = addAfter(a, 1, 'action', 'Log it').workflow          // 0 → 1 → 2
  const looped = link(b, 2, 0)
  check('an arrow is added', targetsOf(looped, 2).join() === 'find_invoices')
  check('linking the same pair twice is still one arrow',
    targetsOf(link(looped, 2, 0), 2).length === 1)
  check('a box cannot be linked to itself', targetsOf(link(b, 1, 1), 1).join() === 'log_it')
  check('unlink takes it away again', (unlink(looped, 2, 'find_invoices').steps[2].transitions) === null)
}

console.log('\ninserting on an arrow that already exists')
{
  const chain = addAfter(START, 0, 'action', 'Chase').workflow    // find → chase
  const { workflow, index } = insertOn(chain, 0, 'chase', 'action', 'Check the balance')

  check('the new step sits between them', targetsOf(workflow, 0).join() === 'check_the_balance')
  check('…and keeps the path going', targetsOf(workflow, index).join() === 'chase')
  check('the step it displaced is still there', liveSteps(workflow).length === 3)
  check('…and has been moved down to make room',
    stepOf(workflow, 1).layout.y > stepOf(chain, 1).layout.y)

  // Inserting on a CONDITIONAL arrow leaves the condition on the old hop:
  // the question was about reaching `chase`, not about reaching the new box.
  const conditional = { ...chain, steps: chain.steps.map((s, i) => i === 0 ? { ...s, transitions: [{ target: 'chase', condition: { left: { field: 'x' }, op: 'eq', right: { value: 1 } } }] } : s) }
  const after = insertOn(conditional, 0, 'chase', 'action', 'Check')
  check('the arrow into the new box carries no condition', after.workflow.steps[0].transitions[0].condition === undefined)
  check('…and the old condition travels with the hop it belonged to',
    after.workflow.steps[after.index].transitions[0].condition.left.field === 'x')

  check('inserting on an arrow that is not there changes nothing',
    insertOn(chain, 0, 'nope', 'action', 'x').index === -1)
}

console.log('\nrenaming carries every arrow with it')
{
  const chain = addAfter(START, 0, 'action', 'Chase').workflow
  const renamed = rename(chain, 1, 'Chase the customer')
  check('the key follows the name', keyAt(renamed, 1) === 'chase_the_customer')
  check('the arrow into it follows too', targetsOf(renamed, 0).join() === 'chase_the_customer')
  check('a name that collides still gets its own key',
    keyAt(rename(addAfter(chain, 1, 'action', 'Other').workflow, 2, 'Chase'), 2) === 'chase_2')
}

console.log('\nremoving takes its arrows with it')
{
  const chain = addAfter(addAfter(START, 0, 'action', 'Chase').workflow, 1, 'action', 'Log it').workflow
  const gone = removeStep(chain, 1)
  check('the step is marked deleted, not dropped', gone.steps[1].deleted === true && gone.steps.length === 3)
  check('it is off the canvas', liveSteps(gone).length === 2)
  // Left behind, this would fail the run: "targets unknown step".
  check('no arrow points at it any more', (gone.steps[0].transitions) === null)
}

console.log('\nthe arrows a canvas draws')
{
  const chain = addAfter(addAfter(START, 0, 'action', 'Chase').workflow, 1, 'action', 'Log it').workflow
  const edges = edgesOf(chain)
  check('one per transition', edges.length === 2)
  check('by index, both ends', edges[0].from === 0 && edges[0].to === 1)
  check('an arrow to a step that is gone is not drawn',
    edgesOf(removeStep(chain, 2)).length === 1)
  check('nor is an arrow to an end marker',
    edgesOf({ steps: [{ stepKey: 'a', transitions: [{ target: 'end_success' }] }] }).length === 0)
}

// ── A SCREEN IS A STEP, NOT A THIRD KIND OF THING ──────────────────────
// To the engine it is a `wait` step on the screen-show action carrying one
// screen key (lib/flows.js). The designer offers it as a TYPE because that is
// what it is to somebody drawing a flow, and this is where the two meet.
console.log('\na screen step')
{
  const step = blankStep('screen', 'Approve it', [])
  check('it waits — the run parks until a person submits', step.kind === 'wait')
  check('its action is named from the start', step.actionName === SCREEN_ACTION)
  check('…because the question left is WHICH screen, not what to run',
    JSON.stringify(step.values) === '{}')
  check('an unnamed one is called a screen, not a step', blankStep('screen', '', []).stepKey === 'screen')

  // The other two are unchanged by it.
  check('an action still waits for nothing', blankStep('action', 'Send', []).kind === 'auto')
  check('an action still has no action yet', blankStep('action', 'Send', []).actionName === '')
  check('a condition is still a condition', blankStep('condition', 'Big?', []).kind === 'condition')

  // Born from an arrow like any other box, so nothing about linking,
  // inserting or keying knows what a screen is.
  const wf = { steps: [] }
  const first = addAfter(Object.assign({}, wf, { steps: [blankStep('action', 'Fetch', [])] }), 0, 'screen', 'Approve')
  const added = first.workflow.steps[first.index]
  check('it can be born from another box\'s arrow', added.actionName === SCREEN_ACTION)
  check('…and is linked from the box it came out of',
    (first.workflow.steps[0].transitions || []).some((t) => t.target === added.stepKey))
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
