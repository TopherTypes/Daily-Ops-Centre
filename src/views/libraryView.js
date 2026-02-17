import { escapeHtml, titleCase } from '../utils/format.js';

const LIBRARY_SECTIONS = ['tasks', 'projects', 'people', 'meetings', 'reminders', 'habits', 'logs', 'archived', 'deleted'];
const ENTITY_COLLECTIONS = ['tasks', 'projects', 'people', 'meetings', 'reminders', 'notes', 'followUps'];

function isDeleted(item) {
  return Boolean(item?.deleted);
}

function isArchived(item) {
  return Boolean(item?.archived);
}

function activeCollection(state, key) {
  return (state[key] || []).filter((item) => !isDeleted(item) && !isArchived(item));
}

function personPendingUpdates(state, personId) {
  return state.followUps
    .filter((group) => !isDeleted(group) && group.recipients.some((recipient) => recipient.personId === personId && recipient.status === 'pending'))
    .map((group) => group.title);
}

function renderDetailLifecycleActions(collection, item) {
  return `
    <div class="inline-actions" style="margin-top:0.4rem;">
      <button class="inline-button" type="button" data-archive-entity="${collection}" data-id="${item.id}">${isArchived(item) ? 'Unarchive' : 'Archive'}</button>
      <button class="inline-button" type="button" data-request-delete="${collection}" data-id="${item.id}" data-delete-mode="soft">Request delete</button>
      <button class="inline-button" type="button" data-request-delete="${collection}" data-id="${item.id}" data-delete-mode="hard" data-delete-scope="detail">Hard delete</button>
    </div>
  `;
}

function renderSimpleListWithDetail(state, collection, selectedId, titleField = 'title', subtitleBuilder = () => '') {
  const rows = activeCollection(state, collection);
  const selected = rows.find((entry) => entry.id === selectedId) || rows[0];

  return `
    <div class="cols">
      <section class="col">
        <h3>${titleCase(collection)}</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${rows.map((entry) => `<a class="mode-link ${selected?.id === entry.id ? 'active' : ''}" href="#/library/${collection}/${entry.id}">${escapeHtml(entry[titleField] || entry.name || entry.id)}</a>`).join('') || '<p class="muted">No active items.</p>'}
        </div>
      </section>
      <section class="col">
        <h3>${titleCase(collection.slice(0, -1))} detail</h3>
        ${selected ? `
          <p><strong>${escapeHtml(selected[titleField] || selected.name || selected.id)}</strong></p>
          <p class="muted">${escapeHtml(subtitleBuilder(selected) || 'No additional metadata')}</p>
          ${renderDetailLifecycleActions(collection, selected)}
        ` : '<p class="muted">No item selected.</p>'}
      </section>
    </div>
  `;
}

function renderPeople(state, selectedId) {
  const people = activeCollection(state, 'people');
  const selected = people.find((p) => p.id === selectedId) || people[0];
  const pending = selected ? personPendingUpdates(state, selected.id) : [];

  return `
    <div class="cols">
      <section class="col">
        <h3>People</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${people.map((person) => `<a class="mode-link ${selected?.id === person.id ? 'active' : ''}" href="#/library/people/${person.id}">${escapeHtml(person.name)}</a>`).join('')}
        </div>
      </section>
      <section class="col">
        <h3>Person detail</h3>
        ${selected ? `
          <p><strong>${escapeHtml(selected.name)}</strong></p>
          <p class="muted">${escapeHtml(selected.email || '')} · ${escapeHtml(selected.phone || '')}</p>
          <h4>Pending updates</h4>
          <div class="row-list">${pending.map((entry) => `<article class="row">${escapeHtml(entry)}</article>`).join('') || '<p class="muted">No pending updates.</p>'}</div>
          ${renderDetailLifecycleActions('people', selected)}
        ` : '<p class="muted">No person selected.</p>'}
      </section>
    </div>
  `;
}

function renderMeetings(state, selectedId) {
  const meetings = activeCollection(state, 'meetings');
  const selected = meetings.find((m) => m.id === selectedId) || meetings[0];
  const groups = state.followUps.filter((group) => !isDeleted(group) && group.meetingId === selected?.id);

  return `
    <div class="cols">
      <section class="col">
        <h3>Meetings</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${meetings.map((meeting) => `<a class="mode-link ${selected?.id === meeting.id ? 'active' : ''}" href="#/library/meetings/${meeting.id}">${escapeHtml(meeting.time || '')} · ${escapeHtml(meeting.title)}</a>`).join('')}
        </div>
      </section>
      <section class="col">
        <h3>Meeting detail</h3>
        ${selected ? `
          <form data-library-meeting-form data-id="${selected.id}" class="inline-fields" aria-label="Meeting detail edit form">
            <!-- Explicit labels keep the meeting edit form accessible and scannable in dense Library layouts. -->
            <label class="muted" for="meeting-title-${selected.id}">Title</label>
            <input id="meeting-title-${selected.id}" class="input" name="title" value="${escapeHtml(selected.title || '')}" required />

            <label class="muted" for="meeting-time-${selected.id}">Time</label>
            <input id="meeting-time-${selected.id}" class="input" name="time" placeholder="HH:MM" value="${escapeHtml(selected.time || '')}" />

            <label class="muted" for="meeting-type-${selected.id}">Meeting type</label>
            <select id="meeting-type-${selected.id}" class="select" name="meetingType">
              <option value="group" ${selected.meetingType !== 'one_to_one' ? 'selected' : ''}>group</option>
              <option value="one_to_one" ${selected.meetingType === 'one_to_one' ? 'selected' : ''}>one_to_one</option>
            </select>

            <label class="muted" for="meeting-agenda-${selected.id}">Agenda</label>
            <input id="meeting-agenda-${selected.id}" class="input" name="agenda" value="${escapeHtml(selected.agenda || '')}" />

            <label class="muted" for="meeting-notes-${selected.id}">Notes</label>
            <input id="meeting-notes-${selected.id}" class="input" name="notes" value="${escapeHtml(selected.notes || '')}" />
            <button class="button" type="submit">Save meeting</button>
          </form>
          <div class="row-list" style="margin-top:0.4rem;">${groups.map((group) => `<article class="row"><strong>${escapeHtml(group.title)}</strong></article>`).join('') || '<p class="muted">No follow-ups.</p>'}</div>
          ${renderDetailLifecycleActions('meetings', selected)}
        ` : '<p class="muted">No meeting selected.</p>'}
      </section>
    </div>
  `;
}

function renderArchivedOrDeleted(state, mode = 'archived') {
  const predicate = mode === 'deleted'
    ? (item) => isDeleted(item)
    : (item) => isArchived(item) && !isDeleted(item);

  const blocks = ENTITY_COLLECTIONS.map((collection) => {
    const rows = (state[collection] || []).filter(predicate);
    if (!rows.length) return '';

    return `
      <article class="col">
        <h3>${titleCase(collection)}</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${rows.map((item) => `
            <article class="row">
              <div>
                <strong>${escapeHtml(item.title || item.name || item.id)}</strong>
                <div class="muted">${mode === 'deleted' ? `Deleted at: ${escapeHtml(item.deletedAt || 'unknown')}` : 'Archived and recoverable'}</div>
              </div>
              <div class="inline-actions">
                <button class="inline-button" type="button" data-restore-entity="${collection}" data-id="${item.id}">Restore</button>
              </div>
            </article>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');

  return blocks || `<p class="muted">No recently ${mode} items.</p>`;
}

function renderHabits(state) {
  const habits = Array.isArray(state.habits) ? state.habits : [];
  if (!habits.length) return '<p class="muted">No habits tracked yet.</p>';
  return `<div class="row-list">${habits.map((habit) => `<article class="row"><strong>${escapeHtml(habit.title || habit.name || 'Untitled habit')}</strong></article>`).join('')}</div>`;
}

function renderLogs(state) {
  if (!state.dailyLogs?.length) return '<p class="muted">No Daily Logs yet.</p>';
  return `<div class="row-list">${state.dailyLogs.map((log) => `<article class="row"><strong>${escapeHtml(log.createdAt || log.generatedAt || '')}</strong></article>`).join('')}</div>`;
}

export function renderLibrary(state, routeParts) {
  const section = LIBRARY_SECTIONS.includes(routeParts[2]) ? routeParts[2] : 'tasks';
  const selectedId = routeParts[3];

  let body = '<p class="muted">Select a library section.</p>';
  if (section === 'tasks') body = renderSimpleListWithDetail(state, 'tasks', selectedId, 'title', (item) => `${item.status || 'backlog'} · due ${item.due || 'unscheduled'}`);
  if (section === 'projects') body = renderSimpleListWithDetail(state, 'projects', selectedId, 'name', (item) => `status: ${item.status || 'active'}`);
  if (section === 'people') body = renderPeople(state, selectedId);
  if (section === 'meetings') body = renderMeetings(state, selectedId);
  if (section === 'reminders') body = renderSimpleListWithDetail(state, 'reminders', selectedId, 'title', (item) => `${item.status || 'pending'} · due ${item.due || 'unscheduled'}`);
  if (section === 'habits') body = renderHabits(state);
  if (section === 'logs') body = renderLogs(state);
  if (section === 'archived') body = renderArchivedOrDeleted(state, 'archived');
  if (section === 'deleted') body = renderArchivedOrDeleted(state, 'deleted');

  return `
    <div class="library-grid">
      <nav class="menu" aria-label="Library sections">
        ${LIBRARY_SECTIONS.map((entry) => `<a class="mode-link ${section === entry ? 'active' : ''}" href="#/library/${entry}">${titleCase(entry)}</a>`).join('')}
      </nav>
      <section>
        <h2>Library / ${titleCase(section)}</h2>
        <div style="margin-top:0.4rem;">${body}</div>
      </section>
    </div>
  `;
}
