import { escapeHtml } from '../utils/format.js';

function processingFields() {
  return `
    <div class="inline-editor" data-inline-processor>
      <div class="inline-fields">
        <span class="muted">Convert to:</span>
        ${['Task', 'Reminder', 'Meeting', 'Person', 'Project', 'Follow-up', 'Note'].map((target) => `<button class="inline-button" type="button">${target}</button>`).join('')}
      </div>
      <div class="inline-fields">
        <input class="input" placeholder="People (@name)" />
        <input class="input" placeholder="Project (#name)" />
        <select class="select"><option>work</option><option>personal</option></select>
        <input class="input" placeholder="due / scheduled date" />
        <select class="select"><option>priority p1</option><option>priority p2</option><option>priority p3</option></select>
      </div>
      <div class="muted">Placeholder only for wireframe: inline processing and follow-up creation target.</div>
    </div>
  `;
}

export function renderCapture(state, uiState) {
  const activeTab = uiState.captureTab || 'unprocessed';
  const inboxItems = state.inbox.filter((item) => activeTab === 'archived' ? item.archived : !item.archived);

  return `
    <section>
      <div class="view-header">
        <h1>Capture / Inbox</h1>
        <p class="muted">Enter to capture, then process inline.</p>
      </div>
      <form data-capture-form class="inline-fields" aria-label="Capture item form">
        <input class="input" name="captureInput" required placeholder="Capture anything quickly…" />
        <button class="button" type="submit">Capture</button>
      </form>
      <div class="tabs" style="margin:0.5rem 0;">
        <button data-tab="unprocessed" class="button">Unprocessed</button>
        <button data-tab="archived" class="button">Archived</button>
      </div>
      <div class="row-list">
        ${inboxItems.map((item) => `
          <article class="row" tabindex="0">
            <div class="row-main">
              <div class="inline-fields">
                <span class="chip">${escapeHtml(item.type)}</span>
                <strong>${escapeHtml(item.raw)}</strong>
              </div>
              <div class="row-meta muted">id: ${item.id}</div>
              ${uiState.processingInboxId === item.id ? processingFields() : ''}
            </div>
            <div class="inline-actions">
              <button class="inline-button" data-action="process" data-id="${item.id}" type="button">Process</button>
              <button class="inline-button" data-action="archive" data-id="${item.id}" type="button">${item.archived ? 'Unarchive' : 'Archive'}</button>
            </div>
          </article>
        `).join('') || '<p class="muted">No items in this tab.</p>'}
      </div>
    </section>
  `;
}
