import { escapeHtml } from '../utils/format.js';

const ACTIONS = [
  { label: 'Complete', action: 'set-status', status: 'complete' },
  { label: 'In progress', action: 'set-status', status: 'in progress' },
  { label: 'Waiting', action: 'set-status', status: 'waiting' },
  { label: 'Blocked', action: 'set-status', status: 'blocked' },
  { label: 'Cancelled', action: 'set-status', status: 'cancelled' },
  { label: 'Defer', action: 'defer', status: 'deferred' },
  { label: 'Archive', action: 'archive', status: 'archived' }
];

function renderExecutionMeta(item) {
  const execution = item.execution || {};
  const noteCount = Array.isArray(execution.notes) ? execution.notes.length : 0;
  const status = execution.status || item.status || 'not started';
  const statusText = `status ${status}`;
  const base = item.meta ? `${item.meta} · ${statusText}` : statusText;
  const noteText = noteCount > 0 ? ` · ${noteCount} note${noteCount === 1 ? '' : 's'}` : '';
  return `${base}${noteText}`;
}

// Execute rows opt into shared keyboard navigation via data-nav attributes.
function renderGroup(name, rows) {
  return `
    <section class="type-group">
      <div class="view-header" style="margin-bottom:0.35rem;">
        <h3>${name}</h3>
        <span class="chip">${rows.length}</span>
      </div>
      <div class="row-list" data-nav-list="execute">
        ${rows.map((item) => `
          <article class="row" tabindex="0" data-nav-row data-row-type="execute-item" data-today-id="${item.id}">
            <div class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="row-meta muted">${escapeHtml(renderExecutionMeta(item))}</div>
              <button type="button" class="inline-button btn-ghost" aria-expanded="${item.noteOpen ? 'true' : 'false'}" data-note-toggle="${item.id}">Add update note</button>
              ${item.noteOpen ? `
                <form data-execute-note-form data-id="${item.id}" class="stack" style="margin-top:0.3rem; display:grid; gap:0.3rem;">
                  <textarea class="textarea" rows="2" name="note" aria-label="Update note" placeholder="Add short update note..." required></textarea>
                  <button
                    type="submit"
                    class="inline-button btn-primary"
                    data-action="add-note"
                    data-id="${item.id}"
                    data-status="note-added"
                  >
                    Save note
                  </button>
                </form>
              ` : ''}
            </div>
            <div class="inline-actions segmented" role="group" aria-label="Set execution status for ${escapeHtml(item.title)}">
              ${ACTIONS.map((itemAction) => `
                <button
                  type="button"
                  class="inline-button ${itemAction.action === 'archive' ? 'btn-danger' : 'btn-secondary'}"
                  data-execute-action="${itemAction.action}"
                  data-action="${itemAction.action}"
                  data-id="${item.id}"
                  data-status="${itemAction.status}"
                >
                  ${itemAction.label}
                </button>
              `).join('')}
            </div>
          </article>
        `).join('') || '<p class="empty-state">No items.</p>'}
      </div>
    </section>
  `;
}

export function renderExecute(state, uiState) {
  const noteId = uiState.executeNoteItemId;
  const activeToday = state.today.filter((item) => !item.deleted);
  const tasks = activeToday.filter((item) => item.type === 'task').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const meetings = activeToday.filter((item) => item.type === 'meeting').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const reminders = activeToday.filter((item) => item.type === 'reminder').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const updates = activeToday.filter((item) => item.type === 'follow-up').map((item) => ({ ...item, noteOpen: noteId === item.id }));

  return `
    <section>
      <div class="view-header">
        <h1>Execute</h1>
        <p class="muted">Set execution state quickly, then add concise update notes.</p>
      </div>
      ${renderGroup('Tasks', tasks)}
      ${renderGroup('Meetings', meetings)}
      ${renderGroup('Reminders', reminders)}
      ${renderGroup('Updates (Follow-ups)', updates)}
    </section>
  `;
}
