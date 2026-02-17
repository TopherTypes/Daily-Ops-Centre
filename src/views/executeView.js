import { escapeHtml } from '../utils/format.js';

const ACTIONS = ['Complete', 'In progress', 'Waiting', 'Blocked', 'Cancelled', 'Defer', 'Archive'];

function renderGroup(name, rows) {
  return `
    <section class="type-group">
      <h3>${name}</h3>
      <div class="row-list" style="margin-top:0.35rem;">
        ${rows.map((item) => `
          <article class="row">
            <div class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="row-meta muted">${item.meta ?? item.status ?? 'status pending'}</div>
              <button type="button" class="inline-button" data-note-toggle="${item.id}">Add update note</button>
              ${item.noteOpen ? '<textarea class="textarea" rows="2" placeholder="Add short update note..."></textarea>' : ''}
            </div>
            <div class="inline-actions">
              ${ACTIONS.map((action) => `<button type="button" class="inline-button">${action}</button>`).join('')}
            </div>
          </article>
        `).join('') || '<p class="muted">No items.</p>'}
      </div>
    </section>
  `;
}

export function renderExecute(state, uiState) {
  const noteId = uiState.executeNoteItemId;
  const tasks = state.today.filter((item) => item.type === 'task').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const meetings = state.today.filter((item) => item.type === 'meeting').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const reminders = state.today.filter((item) => item.type === 'reminder').map((item) => ({ ...item, noteOpen: noteId === item.id }));
  const updates = state.today.filter((item) => item.type === 'follow-up').map((item) => ({ ...item, noteOpen: noteId === item.id }));

  return `
    <section>
      <div class="view-header">
        <h1>Execute</h1>
        <p class="muted">Action buttons are placeholders for status transitions.</p>
      </div>
      ${renderGroup('Tasks', tasks)}
      ${renderGroup('Meetings', meetings)}
      ${renderGroup('Reminders', reminders)}
      ${renderGroup('Updates (Follow-ups)', updates)}
    </section>
  `;
}
