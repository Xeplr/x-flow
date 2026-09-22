// Design validation rules for xeplr-workflow's own pages. Reuses
// @xeplr/ui-account's useDesignValidator — the one implementation of the
// "warn if a custom Design is missing required elements" pattern already in
// this workspace — rather than re-implementing it here.

export var WORKFLOW_LIST_RULES = [
  { id: 'wf-new-name', label: 'New workflow name input' },
  { selector: 'form button[type="submit"]', label: 'Create button' }
]

// `anyOf` rather than a bare selector on the editing control, because there is
// a workflow this page legitimately renders WITHOUT it: a flow of screens,
// which is designed in another app and drawn here read-only (see
// stepSources.js's `screens` source). Such a canvas shows the notice in its
// place, which is a complete design and not a broken one — the rule is "this
// page offers a way to edit, or says where the editing happens instead".
//
// THERE IS NO "ADD STEP" RULE, and its absence is the design: a box is born
// from the arrow of the box before it, from the + on an arrow, or from the
// loose arrow dragged onto another box (designs/FlowCanvas.jsx). Every one of
// those belongs to a SELECTION, so none of them is in the document when
// nothing is selected — a rule requiring one would fire on a canvas that is
// working exactly as intended. What a designer must always offer is a name
// and a way to save; how a step is added is the design's own business.
export var WORKFLOW_EDITOR_RULES = [
  { id: 'wf-editor-name', label: 'Workflow name input' },
  { anyOf: ['[data-role="save-workflow"]', '[data-role="read-only-notice"]'],
    label: 'Save button, or the read-only notice in its place' }
]
