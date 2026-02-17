import { escapeHtml, titleCase } from '../utils/format.js';

const LIBRARY_SECTIONS = ['tasks', 'projects', 'people', 'meetings', 'reminders', 'habits', 'logs'];

function personPendingUpdates(state, personId) {
  return state.followUps
    .filter((group) => group.recipients.some((recipient) => recipient.personId === personId && recipient.status === 'pending'))
    .map((group) => group.title);
}

function renderTasks(state) {
  return `
    <div>
      <div class="filters" style="margin-bottom:0.4rem;">
        <input class="input" placeholder="Filter by text" />
        <select class="select"><option>Status</option></select>
        <select class="select"><option>Project</option></select>
      </div>
      <div class="row-list">
        ${state.tasks.map((task) => `<article class="row"><div><strong>${escapeHtml(task.title)}</strong><div class="muted">${task.status} · due ${task.due}</div></div></article>`).join('')}
      </div>
    </div>
  `;
}

function renderPeople(state, selectedId) {
  const selected = state.people.find((p) => p.id === selectedId) || state.people[0];
  const pending = selected ? personPendingUpdates(state, selected.id) : [];

  return `
    <div class="cols">
      <section class="col">
        <h3>People</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${state.people.map((person) => `<a class="mode-link ${selected?.id === person.id ? 'active' : ''}" href="#/library/people/${person.id}">${escapeHtml(person.name)}</a>`).join('')}
        </div>
      </section>
      <section class="col">
        <h3>Person detail</h3>
        ${selected ? `
          <p><strong>${escapeHtml(selected.name)}</strong></p>
          <p class="muted">${escapeHtml(selected.email)} · ${escapeHtml(selected.phone)}</p>
          <h4>Pending updates</h4>
          <div class="row-list">
            ${pending.map((entry) => `<article class="row">${escapeHtml(entry)}</article>`).join('') || '<p class="muted">No pending updates.</p>'}
          </div>
        ` : '<p class="muted">No person selected.</p>'}
      </section>
    </div>
  `;
}

function renderMeetings(state, selectedId) {
  const selected = state.meetings.find((m) => m.id === selectedId) || state.meetings[0];
  const groups = state.followUps.filter((group) => group.meetingId === selected?.id);

  return `
    <div class="cols">
      <section class="col">
        <h3>Meetings</h3>
        <div class="row-list" style="margin-top:0.35rem;">
          ${state.meetings.map((meeting) => `<a class="mode-link ${selected?.id === meeting.id ? 'active' : ''}" href="#/library/meetings/${meeting.id}">${escapeHtml(meeting.time)} · ${escapeHtml(meeting.title)}</a>`).join('')}
        </div>
      </section>
      <section class="col">
        <h3>Meeting detail</h3>
        ${selected ? `
          <p><strong>${escapeHtml(selected.title)}</strong> <span class="muted">(${selected.meetingType})</span></p>
          <p class="muted">Agenda: ${escapeHtml(selected.agenda)}</p>
          <p class="muted">Notes: ${escapeHtml(selected.notes)}</p>
          <h4>Follow-ups</h4>
          <div class="row-list">
            ${groups.map((group) => `<article class="row"><div><strong>${escapeHtml(group.title)}</strong><div class="row-meta muted">${group.recipients.map((recipient) => {
              const person = state.people.find((p) => p.id === recipient.personId);
              return `${person?.name ?? recipient.personId}: ${recipient.status}`;
            }).join(' · ')}</div></div><button class="inline-button" type="button">Toggle recipient complete</button></article>`).join('') || '<p class="muted">No follow-ups created yet.</p>'}
          </div>
        ` : '<p class="muted">No meeting selected.</p>'}
      </section>
    </div>
  `;
}

export function renderLibrary(state, routeParts) {
  const section = LIBRARY_SECTIONS.includes(routeParts[2]) ? routeParts[2] : 'tasks';
  const selectedId = routeParts[3];

  let body = '<p class="muted">Select a library section.</p>';
  if (section === 'tasks') body = renderTasks(state);
  if (section === 'people') body = renderPeople(state, selectedId);
  if (section === 'meetings') body = renderMeetings(state, selectedId);
  if (['projects', 'reminders', 'habits', 'logs'].includes(section)) {
    body = `<p class="muted">${titleCase(section)} list placeholder for wireframe.</p>`;
  }

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
