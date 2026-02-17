import { escapeHtml } from '../utils/format.js';

function renderIncompleteItems(state) {
  const incomplete = state.today.filter((item) => (item.execution?.status || item.status || 'not started') !== 'complete');
  if (!incomplete.length) {
    return '<p class="muted">All Today items are complete. You can generate and close safely.</p>';
  }

  return `
    <div class="row-list" style="margin-top:0.4rem;">
      ${incomplete.map((item) => {
        const notes = item.execution?.notes || [];
        const lastNote = notes.length ? notes[notes.length - 1] : null;
        return `
          <article class="row">
            <div style="width:100%;">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="muted">Status: ${escapeHtml(item.execution?.status || item.status || 'not started')}</div>
              <div class="muted">Last update: ${lastNote ? escapeHtml(lastNote.text) : 'Missing update note'}</div>
              <form data-close-note-form data-id="${item.id}" style="margin-top:0.35rem; display:grid; gap:0.25rem;">
                <label class="muted" for="close-note-${item.id}">Required closure update</label>
                <textarea id="close-note-${item.id}" class="input" name="note" rows="2" placeholder="Add what blocked or deferred this item" required></textarea>
                <div>
                  <button class="button" type="submit">Save update note</button>
                </div>
              </form>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderDailyLogPreview(log) {
  if (!log) {
    return '<p class="muted">Generate a Daily Log snapshot to preview closure output.</p>';
  }

  return `
    <pre class="muted" style="margin-top:0.4rem; white-space:pre-wrap;">Created: ${log.createdAt}
Planned: ${log.plannedCount}
Completed: ${log.completed.length}
Incomplete: ${log.incomplete.length}

Incomplete with last update:
${log.incomplete.map((item) => `- ${item.title}: ${item.lastUpdate?.text || 'No note recorded'}`).join('\n') || '- none'}</pre>
  `;
}

export function renderClose(state) {
  const latestLog = state.dailyLogs?.[0] || null;

  return `
    <section>
      <div class="view-header">
        <h1>Close</h1>
        <p class="muted">End-of-day checklist with enforced update notes before wipe.</p>
      </div>
      <div class="checklist">
        <article class="col checklist-step">
          <strong>1) Process inbox items</strong>
          <a class="mode-link" href="#/capture">Go to Capture</a>
          <span class="muted">${state.inbox.filter((item) => !item.archived).length} unprocessed</span>
        </article>
        <article class="col checklist-step">
          <strong>2) Review incomplete Today items</strong>
          ${renderIncompleteItems(state)}
          <button class="button" type="button" data-close-action="validate-notes" style="margin-top:0.4rem;">Validate required notes</button>
        </article>
        <article class="col">
          <div class="checklist-step">
            <strong>3) Generate Daily log</strong>
            <button class="button" type="button" data-close-action="generate-log">Generate snapshot</button>
          </div>
          ${renderDailyLogPreview(latestLog)}
        </article>
        <article class="col checklist-step">
          <strong>4) Close day (save log + wipe plan)</strong>
          <button class="button" type="button" data-close-action="close-day">Close day now</button>
          <p class="muted" style="margin-top:0.4rem;">This action keeps entities (tasks/projects/people) and resets only Today items.</p>
        </article>
      </div>
    </section>
  `;
}
