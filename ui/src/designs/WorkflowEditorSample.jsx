import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes.js'
import './workflow.css'

function StepRow({ entry, actions, jsonErrors, updateStep, updateStepJSON, removeStep }) {
  var step = entry.step
  var index = entry.index
  var action = actions.find((a) => a.name === step.actionName)
  var valuesError = jsonErrors[index + ':values']
  var transitionsError = jsonErrors[index + ':transitions']

  return (
    <div className="wf-panel" style={{ marginBottom: 14 }}>
      <div className="wf-header">
        <strong>Step {index + 1}{step.stepKey ? ' — ' + step.stepKey : ''}</strong>
        <button type="button" className="wf-link-danger" onClick={() => removeStep(index)}>Remove</button>
      </div>

      <div className="wf-field-row">
        <div className="wf-field">
          <label>Step key</label>
          <input
            value={step.stepKey}
            onChange={(e) => updateStep(index, 'stepKey', e.target.value)}
            placeholder="e.g. list_tables — how other steps address this one"
          />
        </div>
        <div className="wf-field">
          <label>Name</label>
          <input value={step.name || ''} onChange={(e) => updateStep(index, 'name', e.target.value)} placeholder="Optional, for display" />
        </div>
      </div>

      <div className="wf-field-row">
        <div className="wf-field">
          <label>Action</label>
          <select value={step.actionName} onChange={(e) => updateStep(index, 'actionName', e.target.value)}>
            <option value="">— choose —</option>
            {actions.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div className="wf-field">
          <label>Kind</label>
          <select value={step.kind} onChange={(e) => updateStep(index, 'kind', e.target.value)}>
            <option value="auto">auto — runs and advances</option>
            <option value="wait">wait — pauses for an external resume</option>
          </select>
        </div>
        <div className="wf-field">
          <label>On error</label>
          <select value={step.onError || 'stop'} onChange={(e) => updateStep(index, 'onError', e.target.value)}>
            <option value="stop">stop</option>
            <option value="continue">continue</option>
          </select>
        </div>
      </div>

      {action && (
        <p className="wf-field-help">
          {(action.inputSchema || []).length
            ? action.name + ' takes: ' + action.inputSchema.map((f) => f.name + (f.required ? '*' : '')).join(', ')
            : action.name + ' takes no input.'}
        </p>
      )}

      <div className="wf-field">
        <label>
          Values <span className="wf-muted">
            — JSON. Bind with {'{params.x}'}, {'{previous_step.output.x}'}, {'{steps.<key>.output.x}'}
            {step.kind === 'wait' ? ', {resumeKey}' : ''}.
          </span>
        </label>
        <textarea
          defaultValue={JSON.stringify(step.values || {}, null, 2)}
          onChange={(e) => updateStepJSON(index, 'values', e.target.value)}
        />
        {valuesError && <div className="wf-req">{valuesError}</div>}
      </div>

      <div className="wf-field">
        <label>
          Transitions <span className="wf-muted">— JSON array, first match wins. Empty = just advance to the next step.</span>
        </label>
        <textarea
          defaultValue={step.transitions ? JSON.stringify(step.transitions, null, 2) : ''}
          onChange={(e) => updateStepJSON(index, 'transitions', e.target.value)}
          placeholder={'[{ "condition": { "left": { "field": "output.approved" }, "op": "eq", "right": { "value": true } }, "mode": "single", "target": "end_success" }]'}
        />
        {transitionsError && <div className="wf-req">{transitionsError}</div>}
      </div>
    </div>
  )
}

function RunPanel({ run, running, handleRun }) {
  var [paramsText, setParamsText] = useState('{}')
  var [paramsError, setParamsError] = useState(null)

  function onRun() {
    try {
      var parsed = paramsText.trim() === '' ? {} : JSON.parse(paramsText)
      setParamsError(null)
      handleRun(parsed)
    } catch (err) {
      setParamsError(err.message)
    }
  }

  return (
    <div className="wf-panel">
      <div className="wf-field">
        <label>Params <span className="wf-muted">— JSON, matched against the workflow's declared params</span></label>
        <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
        {paramsError && <div className="wf-req">{paramsError}</div>}
      </div>
      <button type="button" className="wf-primary" onClick={onRun} disabled={running}>
        {running ? 'Running…' : 'Run'}
      </button>

      {run && (
        <div className="wf-run-result">
          <span className={
            'wf-status wf-status-' +
            (run.status === 'success' ? 'good' : run.status === 'failed' ? 'bad' : run.status === 'waiting' ? 'busy' : 'current')
          }>
            {run.status}
          </span>
          <span className="wf-muted" style={{ marginLeft: 8, fontSize: 12 }}>run {run.id}</span>
          {run.status === 'waiting' && (
            <p className="wf-field-help" style={{ marginTop: 8 }}>
              Paused on a wait step. It resumes when something calls
              <code> POST /public/resume/&lt;key&gt;</code> — the resume key isn't surfaced in this
              page yet, so resuming a run started here has to go through the API directly for now.
            </p>
          )}
          {run.error && <pre className="wf-json">{JSON.stringify(run.error, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}

export default function WorkflowEditorSample(props) {
  var {
    workflow, actions, saving, running, run, jsonErrors, visibleSteps,
    updateField, addStep, updateStep, updateStepJSON, removeStep, handleSave, handleRun
  } = props

  if (!workflow) return <p className="wf-muted">Loading…</p>

  return (
    <section>
      <Link to={ROUTES.workflows()} className="wf-muted" style={{ fontSize: 13 }}>← Workflows</Link>

      <div className="wf-header" style={{ marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            id="wf-editor-name"
            className="wf-title-input"
            value={workflow.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Workflow name"
          />
          <input
            className="wf-desc-input"
            value={workflow.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Description"
          />
        </div>
        <div className="wf-actions">
          <select value={workflow.status || 'draft'} onChange={(e) => updateField('status', e.target.value)}>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
          <button type="button" className="wf-primary" data-role="save-workflow" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Steps</h2>
      {visibleSteps.length === 0 && (
        <div className="wf-empty"><p className="wf-muted">No steps yet — add one below.</p></div>
      )}
      {visibleSteps.map((entry) => (
        <StepRow
          key={entry.step.id || 'new-' + entry.index}
          entry={entry}
          actions={actions}
          jsonErrors={jsonErrors}
          updateStep={updateStep}
          updateStepJSON={updateStepJSON}
          removeStep={removeStep}
        />
      ))}
      <button type="button" className="wf-secondary" data-role="add-step" onClick={addStep}>+ Add step</button>

      {workflow.id ? (
        <>
          <h2 style={{ marginTop: 28 }}>Run</h2>
          <RunPanel run={run} running={running} handleRun={handleRun} />
        </>
      ) : (
        <p className="wf-field-help" style={{ marginTop: 20 }}>Save the workflow to run it.</p>
      )}
    </section>
  )
}
