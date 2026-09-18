import { compileCondition, conditionToText, flattenPaths, referencesFor, conditionFieldsFor } from '../src/conditions.js'
import xf from '@xeplr/expression-handler'

const results = []
const check = (n, c) => { results.push([n, c]); console.log((c ? '  ok   ' : '  FAIL ') + n) }

console.log('\ncompiling a condition produces what the ENGINE evaluates')
{
  const r = compileCondition('output.approved = true')
  check('compiles', r.ok)
  // The real engine does exactly this: xf.evaluate(t.condition, row)
  check('engine evaluates it true',  xf.evaluate(r.node, { output: { approved: true } }) === true)
  check('engine evaluates it false', xf.evaluate(r.node, { output: { approved: false } }) === false)
}
{
  const r = compileCondition('output.amount >= 5000')
  check('numeric compiles', r.ok)
  check('8200 >= 5000', xf.evaluate(r.node, { output: { amount: 8200 } }) === true)
  check('120 >= 5000 is false', xf.evaluate(r.node, { output: { amount: 120 } }) === false)
}

console.log('\nblank is the catch-all, not an error')
{
  const r = compileCondition('   ')
  check('blank is ok', r.ok)
  check('blank yields a null node', r.node === null)
}

console.log('\na broken condition is caught at BUILD time, with a reason')
{
  const r = compileCondition('output.approved ===')
  check('rejected', !r.ok)
  check('has a message', typeof r.error === 'string' && r.error.length > 0)
}

console.log('\ntext survives a round trip')
;['output.approved = true', 'output.amount >= 5000', 'output.status = "reject"'].forEach((src) => {
  const node = compileCondition(src).node
  const back = conditionToText(node)
  const again = compileCondition(back)
  check(`${src} -> ${back}`, again.ok && JSON.stringify(again.node) === JSON.stringify(node))
})

console.log('\nreference paths')
{
  const paths = flattenPaths({ id: 'u_1', user: { email: 'a@b.c' }, rows: [1,2,3] })
  const names = paths.map(p => p.path)
  check('nested paths flatten', names.includes('user.email'))
  check('arrays are offered whole, not per index', names.includes('rows') && !names.some(n => n.startsWith('rows.')))
  check('preview shows array size', paths.find(p => p.path === 'rows').preview === '[3 items]')
}

console.log('\nonly EARLIER steps are offered')
{
  const steps = [
    { stepKey: 'a', name: 'Create user', sampleOutput: { id: 'u_1' } },
    { stepKey: 'b', name: 'Send mail',   sampleOutput: { messageId: 'm_1' } },
    { stepKey: 'c', name: 'Approve',     sampleOutput: { approved: true } }
  ]
  const groups = referencesFor(steps, 2, {}, false)
  const tokens = groups.flatMap(g => g.items.map(i => i.token))
  check('earlier step offered', tokens.includes('{steps.a.output.id}'))
  check('previous step offered', tokens.includes('{previous_step.output.messageId}'))
  check('the step ITSELF is not offered', !tokens.some(t => t.includes('steps.c.')))
}
{
  const groups = referencesFor([{ stepKey: 'a', sampleOutput: {} }], 0, {}, true)
  const tokens = groups.flatMap(g => g.items.map(i => i.token))
  check('a wait step is offered {resumeKey}', tokens.includes('{resumeKey}'))
}

console.log('\nconditions bind raw paths, NOT the {braced} value syntax')
{
  const groups = conditionFieldsFor({ sampleOutput: { approved: true }, kind: 'wait' })
  const tokens = groups.flatMap(g => g.items.map(i => i.token))
  check('unbraced', tokens.includes('output.approved'))
  check('no braces', !tokens.some(t => t.includes('{')))
  check('expired offered on a wait step', tokens.includes('output.expired'))
  // And what it offers must actually compile.
  check('offered token compiles', compileCondition('output.approved = true').ok)
}

console.log('\na condition can PICK a run parameter, not just an output field')
{
  // routeAfterStep evaluates against { output, item, params }, so
  // `params.tier = "enterprise"` is a valid branch — but the picker never
  // offered it, which left one place you still had to type a parameter name
  // from memory. And it is the worst place for a typo: an unmatched condition
  // is not an error, it is a branch that quietly never fires.
  const groups = conditionFieldsFor(
    { sampleOutput: { approved: true }, kind: 'auto' },
    { tier: 'enterprise', seats: 12 }
  )
  const labels = groups.map((g) => g.label)
  check('output is still offered', labels.includes("This step's output"))
  check('and now run parameters too', labels.includes('Run parameters'))

  const tokens = groups.flatMap((g) => g.items.map((i) => i.token))
  check('offers params.tier', tokens.includes('params.tier'))
  // A condition takes the RAW path; the braced form is for a bound VALUE.
  // Same names, different syntax — which is why the picker is worth having in
  // both places, and why offering the wrong one here would be worse than
  // offering nothing.
  check('unbraced, like the engine reads it', !tokens.some((t) => t.includes('{')))
  check('what it offers actually compiles', compileCondition('params.tier = "enterprise"').ok)

  check('no parameters means no group',
    !conditionFieldsFor({ sampleOutput: { a: 1 } }, {}).some((g) => g.label === 'Run parameters'))
  check('and none passed at all is safe',
    conditionFieldsFor({ sampleOutput: { a: 1 } }).length === 1)
}

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
