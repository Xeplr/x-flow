// Design validation rules for xeplr-workflow's own pages. Reuses
// @xeplr/ui-account's useDesignValidator — the one implementation of the
// "warn if a custom Design is missing required elements" pattern already in
// this workspace — rather than re-implementing it here.

export var WORKFLOW_LIST_RULES = [
  { id: 'wf-new-name', label: 'New workflow name input' },
  { selector: 'form button[type="submit"]', label: 'Create button' }
]

// `anyOf` rather than a bare selector on the two editing controls, because
// there is a workflow this page legitimately renders WITHOUT them: a flow of
// screens, which is designed in another app and drawn here read-only (see
// stepSources.js's `screens` source). Such a canvas shows the notice in their
// place, which is a complete design and not a broken one — the rule is "this
// page offers a way to edit, or says where the editing happens instead".
export var WORKFLOW_EDITOR_RULES = [
  { id: 'wf-editor-name', label: 'Workflow name input' },
  { anyOf: ['[data-role="add-step"]', '[data-role="read-only-notice"]'],
    label: 'Add step button, or the read-only notice in its place' },
  { anyOf: ['[data-role="save-workflow"]', '[data-role="read-only-notice"]'],
    label: 'Save button, or the read-only notice in its place' }
]
