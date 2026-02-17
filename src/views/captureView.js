import { escapeHtml } from '../utils/format.js';
import { parseCaptureTokens } from '../data/store.js';

function processingFields(item) {
  // Prefill inline processor controls from explicit tokens and opt-in heuristics.
  const parsed = parseCaptureTokens(item.raw || '', { enableHeuristics: true });
  const peopleValue = parsed.people.map((name) => `@${name}`).join(', ');
  const projectValue = parsed.projects[0] ? `#${parsed.projects[0]}` : '';
  const inferenceHint = [
    parsed.inferred.type ? `type: ${parsed.inferred.type}` : '',
    parsed.inferred.scheduleDate ? `do:${parsed.inferred.scheduleDate}` : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="inline-editor" data-inline-processor data-inbox-id="${item.id}">
      <div class="inline-fields">
        <span class="muted">Convert to:</span>
        ${[
          ['task', 'Task'],
          ['reminder', 'Reminder'],
          ['meeting', 'Meeting'],
          ['person', 'Person'],
          ['project', 'Project'],
          ['followup', 'Follow-up'],
          ['note', 'Note']
        ].map(([value, label]) => `<button class="inline-button" data-process-target="${value}" data-id="${item.id}" type="button">${label}</button>`).join('')}
      </div>
      <div class="inline-fields">
        <input class="input" name="people" data-process-field="people" placeholder="People (@name, @name2)" value="${escapeHtml(peopleValue)}" />
        <input class="input" name="project" data-process-field="project" placeholder="Project (#name)" value="${escapeHtml(projectValue)}" />
        <select class="select" name="context" data-process-field="context">
          <option value="" ${parsed.context ? '' : 'selected'}>context…</option>
          <option value="work" ${parsed.context === 'work' ? 'selected' : ''}>work</option>
          <option value="personal" ${parsed.context === 'personal' ? 'selected' : ''}>personal</option>
        </select>
        <input class="input" name="dueDate" data-process-field="dueDate" placeholder="due:YYYY-MM-DD" value="${escapeHtml(parsed.dueDate)}" />
        <input class="input" name="scheduleDate" data-process-field="scheduleDate" placeholder="do:YYYY-MM-DD" value="${escapeHtml(parsed.scheduleDate)}" />
        <select class="select" name="priority" data-process-field="priority">
          <option value="" ${parsed.priority ? '' : 'selected'}>priority…</option>
          <option value="1" ${parsed.priority === 1 ? 'selected' : ''}>p1</option><option value="2" ${parsed.priority === 2 ? 'selected' : ''}>p2</option><option value="3" ${parsed.priority === 3 ? 'selected' : ''}>p3</option><option value="4" ${parsed.priority === 4 ? 'selected' : ''}>p4</option><option value="5" ${parsed.priority === 5 ? 'selected' : ''}>p5</option>
        </select>
      </div>
      ${inferenceHint ? `<div class="muted">Inferred from text: ${escapeHtml(inferenceHint)}.</div>` : ''}
      <div class="muted">Token syntax in raw text is also honored (@person #project !p1..p5 due:/do: type: work:/personal:).</div>
    </div>
  `;
}

export function renderCapture(state, uiState) {
  const activeTab = uiState.captureTab || 'unprocessed';
  const inboxItems = state.inbox.filter((item) => {
    if (item.deleted) return false;
    return activeTab === 'archived' ? item.archived : !item.archived;
  });

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
                ${item.snoozed ? '<span class="chip">snoozed</span>' : ''}
                <strong>${escapeHtml(item.raw)}</strong>
              </div>
              <div class="row-meta muted">id: ${item.id}</div>
              ${uiState.processingInboxId === item.id ? processingFields(item) : ''}
            </div>
            <div class="inline-actions">
              <button class="inline-button" data-action="process" data-id="${item.id}" type="button">Process</button>
              <button class="inline-button" data-action="snooze" data-id="${item.id}" type="button">${item.snoozed ? 'Unsnooze' : 'Snooze'}</button>
              <button class="inline-button" data-action="archive" data-id="${item.id}" type="button">${item.archived ? 'Unarchive' : 'Archive'}</button>
              <button class="inline-button" data-request-delete="inbox" data-delete-mode="soft" data-id="${item.id}" type="button">Request delete</button>
            </div>
          </article>
        `).join('') || '<p class="muted">No items in this tab.</p>'}
      </div>
    </section>
  `;
}
