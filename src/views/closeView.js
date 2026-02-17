import { escapeHtml } from '../utils/format.js';

function getCloseReadiness(state) {
  const incompleteToday = state.today.filter((item) => (item.execution?.status || item.status || 'not started') !== 'complete');
  const missingTodayNotes = incompleteToday.filter((item) => {
    const notes = item.execution?.notes || [];
    const lastNote = notes.length ? notes[notes.length - 1] : null;
    return !lastNote?.text?.trim();
  });

  const unprocessedInbox = state.inbox.filter((item) => !item.archived && !item.processedAt);
  const snoozedInbox = unprocessedInbox.filter((item) => item.snoozed);

  return { incompleteToday, missingTodayNotes, unprocessedInbox, snoozedInbox };
}

function renderIncompleteItems(state, missingTodayNotes) {
  const incomplete = state.today.filter((item) => (item.execution?.status || item.status || 'not started') !== 'complete');
  if (!incomplete.length) {
    return '<p class="muted">All Today items are complete. You can generate and close safely.</p>';
  }

  return `
    <div class="row-list" style="margin-top:0.4rem;">
      ${incomplete.map((item) => {
        const notes = item.execution?.notes || [];
        const lastNote = notes.length ? notes[notes.length - 1] : null;
        const blockedByMissingNote = missingTodayNotes.some((entry) => entry.id === item.id);
        return `
          <article class="row">
            <div style="width:100%;">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="muted">Status: ${escapeHtml(item.execution?.status || item.status || 'not started')}</div>
              <div class="muted">Last update: ${lastNote ? escapeHtml(lastNote.text) : 'Missing update note'}</div>
              ${blockedByMissingNote ? '<div class="muted" style="color:#d14343;">Blocker: Missing required closure update note.</div>' : ''}
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

function renderBlockers(readiness) {
  const blockers = [];

  if (readiness.missingTodayNotes.length) {
    blockers.push(`
      <article class="row">
        <div style="width:100%;">
          <strong>Missing Today update notes (${readiness.missingTodayNotes.length})</strong>
          <div class="muted">Each incomplete Today item needs a closure note before day-close is allowed.</div>
        </div>
      </article>
    `);
  }

  if (readiness.unprocessedInbox.length) {
    blockers.push(`
      <article class="row">
        <div style="width:100%;">
          <strong>Unprocessed inbox items (${readiness.unprocessedInbox.length})</strong>
          <div class="muted">Process or archive every inbox capture before closing the day.</div>
          <div style="margin-top:0.35rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button class="button" type="button" data-close-resolve="open-capture">Go to Capture</button>
          </div>
        </div>
      </article>
    `);
  }

  if (readiness.snoozedInbox.length) {
    blockers.push(`
      <article class="row">
        <div style="width:100%;">
          <strong>Snoozed inbox items (${readiness.snoozedInbox.length})</strong>
          <div class="muted">Snoozed captures still block close-day until they are unsnoozed and processed/archived.</div>
          <div style="margin-top:0.35rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button class="button" type="button" data-close-resolve="open-capture">Review snoozed items</button>
          </div>
        </div>
      </article>
    `);
  }

  if (!blockers.length) {
    return '<p class="muted">No active blockers. You can close the day once your log snapshot looks right.</p>';
  }

  return `<div class="row-list" style="margin-top:0.4rem;">${blockers.join('')}</div>`;
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
  const readiness = getCloseReadiness(state);

  return `
    <section>
      <div class="view-header">
        <h1>Close</h1>
        <p class="muted">End-of-day checklist with enforced update notes and inbox processing before wipe.</p>
      </div>
      <div class="checklist">
        <article class="col checklist-step">
          <strong>Blocking reasons</strong>
          ${renderBlockers(readiness)}
        </article>
        <article class="col checklist-step">
          <strong>1) Process inbox items</strong>
          <a class="mode-link" href="#/capture">Go to Capture</a>
          <span class="muted">${readiness.unprocessedInbox.length} unprocessed · ${readiness.snoozedInbox.length} snoozed</span>
        </article>
        <article class="col checklist-step">
          <strong>2) Review incomplete Today items</strong>
          ${renderIncompleteItems(state, readiness.missingTodayNotes)}
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
        <article class="col checklist-step">
          <strong>Settings &amp; Help: sample/demo utilities</strong>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.45rem;">
            <button class="button" type="button" data-close-action="load-sample-data">Load sample data</button>
            <button class="button" type="button" data-close-action="reset-all-local-data">Reset all local data</button>
          </div>
          <p class="muted" style="margin-top:0.4rem;">
            Sample data is opt-in only and marks the app as demo mode. Reset clears all local collections for a clean production-like environment.
          </p>
        </article>
      </div>
    </section>
  `;
}
