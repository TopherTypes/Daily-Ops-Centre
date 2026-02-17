import { DbClient } from './db.js';
import { getDeviceId } from './device.js';

const SNAPSHOT_SCHEMA_VERSION = 1;
const IMPORTABLE_COLLECTIONS = [
  'inbox',
  'suggestions',
  'today',
  'tasks',
  'people',
  'projects',
  'reminders',
  'notes',
  'meetings',
  'followUps',
  'dailyLogs'
];

/**
 * Creates baseline mock entities used across modes and Library views.
 */
function createSeedData() {
  return {
    inbox: [
      { id: 'in_1', raw: 'Follow up with @Mina on launch metrics tomorrow', type: 'follow-up', archived: false },
      { id: 'in_2', raw: 'Book 1:1 with @Harper #Roadmap do:2026-02-18', type: 'meeting', archived: false },
      { id: 'in_3', raw: 'Sketch decision log format for team', type: 'task', archived: false },
      { id: 'in_4', raw: 'Archive old status note', type: 'note', archived: true }
    ],
    suggestions: {
      must: [
        { id: 's1', title: 'Roadmap sync', type: 'meeting', meta: '10:00' },
        { id: 's2', title: 'Ship status update', type: 'follow-up', meta: 'pending update' }
      ],
      should: [
        { id: 's3', title: 'Refine intake template', type: 'task', meta: 'due today' },
        { id: 's4', title: 'Confirm finance reminder', type: 'reminder', meta: 'scheduled' }
      ],
      could: [
        { id: 's5', title: 'Clean backlog tags', type: 'task', meta: 'backlog' }
      ]
    },
    today: [],
    tasks: [
      { id: 't1', title: 'Refine intake template', status: 'in progress', due: '2026-02-17' },
      { id: 't2', title: 'Clean backlog tags', status: 'waiting', due: '2026-02-19' }
    ],
    people: [
      { id: 'p1', name: 'Mina Iqbal', email: 'mina@example.com', phone: '(555) 102-3344' },
      { id: 'p2', name: 'Harper Lin', email: 'harper@example.com', phone: '(555) 671-9090' }
    ],
    projects: [{ id: 'pr1', name: 'Roadmap' }],
    reminders: [],
    notes: [],
    meetings: [
      { id: 'm1', title: 'Roadmap sync', time: '10:00', meetingType: 'group', agenda: 'Prioritize Q2 bets', notes: 'Placeholder notes' },
      { id: 'm2', title: 'Mina 1:1', time: '15:30', meetingType: 'one_to_one', agenda: 'Growth feedback', notes: 'Placeholder notes' }
    ],
    followUps: [
      {
        id: 'f1',
        title: 'Share launch metrics recap',
        source: 'meeting',
        meetingId: 'm1',
        recipients: [
          { personId: 'p1', status: 'pending' },
          { personId: 'p2', status: 'complete' }
        ]
      },
      {
        id: 'f2',
        title: 'Prepare 1:1 recap',
        source: 'inbox',
        meetingId: 'm2',
        recipients: [{ personId: 'p1', status: 'pending' }]
      }
    ],
    dailyLogs: []
  };
}

function slugify(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function titleFromRaw(rawText) {
  return rawText.replace(/\s+/g, ' ').trim();
}


function createTodayExecutionState(status = 'not started') {
  return {
    status,
    updatedAt: new Date().toISOString(),
    notes: []
  };
}

function normalizeTodayExecution(item) {
  const execution = item.execution || {};
  return {
    ...item,
    execution: {
      status: execution.status || item.status || 'not started',
      updatedAt: execution.updatedAt || item.updatedAt || new Date().toISOString(),
      notes: Array.isArray(execution.notes) ? execution.notes : []
    }
  };
}

function isTodayItemComplete(item) {
  const status = item.execution?.status || item.status || 'not started';
  return status === 'complete';
}

function getLastTodayNote(item) {
  const notes = item.execution?.notes || [];
  return notes.length ? notes[notes.length - 1] : null;
}

/**
 * Merges array records by stable `id` while preserving local-only records.
 *
 * Policy for this MVP:
 * - incoming IDs replace matching local IDs,
 * - local IDs not present in import are kept,
 * - imported items append in their incoming order.
 */
function mergeCollectionById(localItems, importedItems) {
  const local = Array.isArray(localItems) ? localItems : [];
  const incoming = Array.isArray(importedItems) ? importedItems : [];
  const incomingById = new Map();

  for (const entry of incoming) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.trim()) {
      incomingById.set(entry.id, entry);
    }
  }

  const merged = [];

  for (const localEntry of local) {
    if (!localEntry || typeof localEntry !== 'object' || typeof localEntry.id !== 'string') {
      merged.push(localEntry);
      continue;
    }

    if (incomingById.has(localEntry.id)) {
      merged.push(incomingById.get(localEntry.id));
      incomingById.delete(localEntry.id);
    } else {
      merged.push(localEntry);
    }
  }

  for (const importedEntry of incoming) {
    if (!importedEntry || typeof importedEntry !== 'object' || typeof importedEntry.id !== 'string') continue;
    if (incomingById.has(importedEntry.id)) {
      merged.push(importedEntry);
      incomingById.delete(importedEntry.id);
    }
  }

  return merged;
}

/**
 * Deterministic token parser for the documented capture syntax.
 *
 * Intentionally avoids heuristics in this phase so contributors can safely
 * layer inference rules later without changing current behavior.
 */
function parseCaptureTokens(rawText) {
  const people = [...rawText.matchAll(/(^|\s)@([A-Za-z0-9][\w-]*)/g)].map((match) => match[2]);
  const projects = [...rawText.matchAll(/(^|\s)#([A-Za-z0-9][\w-]*)/g)].map((match) => match[2]);
  const priorityMatch = rawText.match(/(^|\s)!p([1-5])(\s|$)/i);
  const dueMatch = rawText.match(/(^|\s)due:(\d{4}-\d{2}-\d{2})(\s|$)/i);
  const doMatch = rawText.match(/(^|\s)do:(\d{4}-\d{2}-\d{2})(\s|$)/i);
  const typeMatch = rawText.match(/(^|\s)type:(task|meeting|note|reminder|followup|project|person)(\s|$)/i);
  const contextMatch = rawText.match(/(^|\s)(work|personal):(\s|$)/i);

  return {
    people,
    projects,
    priority: priorityMatch ? Number(priorityMatch[2]) : null,
    dueDate: dueMatch?.[2] || '',
    scheduleDate: doMatch?.[2] || '',
    type: typeMatch?.[2]?.toLowerCase() || '',
    context: contextMatch?.[2]?.toLowerCase() || ''
  };
}

/**
 * In-memory store with persistence seam for future schema implementation.
 */
export class AppStore {
  constructor() {
    this.db = new DbClient();
    this.state = createSeedData();
    this.listeners = new Set();
  }

  async init() {
    try {
      const ready = await this.db.init();
      if (ready) {
        const snapshot = await this.db.get('wireframe-state');
        if (snapshot?.payload) {
          this.state = snapshot.payload;
        }
      }
      this.ensureCollections();
    } catch {
      // Ignore initialization failures and stay on in-memory data.
    }
  }

  ensureCollections() {
    for (const collection of ['inbox', 'today', 'tasks', 'meetings', 'people', 'projects', 'followUps', 'reminders', 'notes', 'dailyLogs']) {
      if (!Array.isArray(this.state[collection])) {
        this.state[collection] = [];
      }
    }

    if (!this.state.suggestions || typeof this.state.suggestions !== 'object') {
      this.state.suggestions = { must: [], should: [], could: [] };
    }

    for (const bucket of ['must', 'should', 'could']) {
      if (!Array.isArray(this.state.suggestions[bucket])) {
        this.state.suggestions[bucket] = [];
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return structuredClone(this.state);
  }

  /**
   * Exports a versioned snapshot payload for manual backup and transfer.
   */
  exportSnapshot() {
    this.ensureCollections();

    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
      collections: structuredClone(this.state)
    };
  }

  /**
   * Validates and merges an imported snapshot into current state.
   */
  async importSnapshot(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Import failed: snapshot payload must be an object.');
    }

    const { schemaVersion, collections } = payload;
    if (schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`Import failed: unsupported schemaVersion ${schemaVersion}.`);
    }

    if (!collections || typeof collections !== 'object') {
      throw new Error('Import failed: missing collections object.');
    }

    this.ensureCollections();

    const mergeSummary = {};

    for (const collection of IMPORTABLE_COLLECTIONS) {
      if (!(collection in collections)) continue;

      if (collection === 'suggestions') {
        const localSuggestions = this.state.suggestions || {};
        const importedSuggestions = collections.suggestions;
        if (!importedSuggestions || typeof importedSuggestions !== 'object') {
          throw new Error('Import failed: suggestions must be an object containing must/should/could arrays.');
        }

        for (const bucket of ['must', 'should', 'could']) {
          if (!Array.isArray(importedSuggestions[bucket])) {
            throw new Error(`Import failed: suggestions.${bucket} must be an array.`);
          }
        }

        const mergedSuggestions = {
          must: mergeCollectionById(localSuggestions.must, importedSuggestions.must),
          should: mergeCollectionById(localSuggestions.should, importedSuggestions.should),
          could: mergeCollectionById(localSuggestions.could, importedSuggestions.could)
        };
        this.state.suggestions = mergedSuggestions;
        mergeSummary.suggestions = mergedSuggestions.must.length + mergedSuggestions.should.length + mergedSuggestions.could.length;
        continue;
      }

      const localCollection = this.state[collection];
      const importedCollection = collections[collection];
      if (!Array.isArray(importedCollection)) {
        throw new Error(`Import failed: collection "${collection}" must be an array.`);
      }

      const merged = mergeCollectionById(localCollection, importedCollection);
      this.state[collection] = merged;
      mergeSummary[collection] = merged.length;
    }

    await this.persist();
    this.emit();
    return { ok: true, merged: mergeSummary };
  }

  async persist() {
    try {
      await this.db.put({ id: 'wireframe-state', payload: this.state, updatedAt: Date.now() });
    } catch {
      // Wireframe mode tolerates persistence failures.
    }
  }

  async addInboxItem(raw) {
    this.state.inbox.unshift({
      id: `in_${Date.now()}`,
      raw,
      type: 'unknown',
      archived: false
    });
    await this.persist();
    this.emit();
  }

  async toggleArchiveInbox(id) {
    const item = this.state.inbox.find((entry) => entry.id === id);
    if (!item) return;
    item.archived = !item.archived;
    await this.persist();
    this.emit();
  }

  findOrCreatePerson(name, provenance) {
    const key = slugify(name);
    const existing = this.state.people.find((person) => slugify(person.name) === key);
    if (existing) return existing;

    const created = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      source: provenance
    };
    this.state.people.push(created);
    return created;
  }

  findOrCreateProject(name, provenance) {
    const key = slugify(name);
    const existing = this.state.projects.find((project) => slugify(project.name) === key);
    if (existing) return existing;

    const created = {
      id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      source: provenance
    };
    this.state.projects.push(created);
    return created;
  }

  /**
   * Converts an inbox item into a concrete entity and archives the source inbox record.
   *
   * Conversion precedence is deterministic:
   * 1) explicit inline fields, 2) explicit raw tokens, 3) safe defaults.
   */
  async processInboxItem(inboxId, targetType, fields = {}) {
    this.ensureCollections();

    const inboxItem = this.state.inbox.find((entry) => entry.id === inboxId);
    if (!inboxItem) return;

    const parsed = parseCaptureTokens(inboxItem.raw || '');
    const provenance = {
      type: 'inbox',
      inboxId: inboxItem.id,
      raw: inboxItem.raw,
      processedAt: new Date().toISOString()
    };

    // Deterministic field merge: form controls override parsed tokens when present.
    const peopleTokens = [
      ...parsed.people,
      ...(fields.people || '')
        .split(/[\s,]+/)
        .map((value) => value.replace(/^@/, '').trim())
        .filter(Boolean)
    ];
    const uniquePeopleTokens = [...new Set(peopleTokens)];
    const personEntities = uniquePeopleTokens.map((name) => this.findOrCreatePerson(name, provenance));

    const projectToken = (fields.project || '').replace(/^#/, '').trim() || parsed.projects[0] || '';
    const projectEntity = projectToken ? this.findOrCreateProject(projectToken, provenance) : null;

    const typeAliasMap = { 'follow-up': 'followup', follow_up: 'followup' };
    const normalizedTarget = typeAliasMap[targetType] || targetType;
    const resolvedType = normalizedTarget || parsed.type || 'task';

    const baseRecord = {
      id: `${resolvedType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: fields.title || titleFromRaw(inboxItem.raw),
      context: fields.context || parsed.context || 'work',
      priority: Number(fields.priority || parsed.priority || 3),
      due: fields.dueDate || parsed.dueDate || '',
      scheduled: fields.scheduleDate || parsed.scheduleDate || '',
      source: provenance,
      linkedPeople: personEntities.map((person) => person.id),
      linkedProjects: projectEntity ? [projectEntity.id] : []
    };

    // Keep conversion logic explicit per entity type so contributors can safely extend it.
    if (resolvedType === 'task') {
      this.state.tasks.unshift({ ...baseRecord, status: 'backlog' });
    } else if (resolvedType === 'meeting') {
      this.state.meetings.unshift({
        ...baseRecord,
        meetingType: personEntities.length === 1 ? 'one_to_one' : 'group',
        agenda: '',
        notes: ''
      });
    } else if (resolvedType === 'person') {
      const personName = fields.title || personEntities[0]?.name || titleFromRaw(inboxItem.raw);
      this.findOrCreatePerson(personName, provenance);
    } else if (resolvedType === 'project') {
      const projectName = fields.title || projectEntity?.name || titleFromRaw(inboxItem.raw);
      this.findOrCreateProject(projectName, provenance);
    } else if (resolvedType === 'followup') {
      this.state.followUps.unshift({
        ...baseRecord,
        source: 'inbox',
        sourceInboxId: inboxItem.id,
        recipients: personEntities.map((person) => ({ personId: person.id, status: 'pending' }))
      });
    } else if (resolvedType === 'reminder') {
      this.state.reminders.unshift({ ...baseRecord, status: 'pending' });
    } else if (resolvedType === 'note') {
      this.state.notes.unshift({ ...baseRecord, body: inboxItem.raw });
    } else {
      this.state.tasks.unshift({ ...baseRecord, status: 'backlog' });
    }

    // Archive the source item after successful conversion to preserve inbox provenance.
    inboxItem.archived = true;
    inboxItem.processedType = resolvedType;
    inboxItem.processedAt = provenance.processedAt;

    await this.persist();
    this.emit();
  }

  async addToToday(bucket, suggestionId) {
    const pool = [...this.state.suggestions.must, ...this.state.suggestions.should, ...this.state.suggestions.could];
    const suggestion = pool.find((entry) => entry.id === suggestionId);
    if (!suggestion) return;

    // Prevent duplicate Today entries for the same suggestion while preserving existing order.
    const alreadyPresent = this.state.today.some((entry) => (entry.suggestionId || entry.id) === suggestionId);
    if (alreadyPresent) return;

    this.state.today.push({
      ...suggestion,
      id: `today_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      suggestionId,
      bucket,
      execution: createTodayExecutionState('not started'),
      status: 'not started'
    });
    await this.persist();
    this.emit();
  }

  async reorderToday(id, direction) {
    // Moving an item swaps adjacent rows only; no re-sort means unchanged rows keep their relative order.
    const index = this.state.today.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.state.today.length) return;
    [this.state.today[index], this.state.today[target]] = [this.state.today[target], this.state.today[index]];
    await this.persist();
    this.emit();
  }

  async setTodayStatus(id, status) {
    // Allowed status transitions for active work items.
    const allowedStatuses = ['not started', 'in progress', 'waiting', 'blocked', 'complete', 'cancelled', 'deferred', 'archived'];
    if (!allowedStatuses.includes(status)) return;

    const index = this.state.today.findIndex((entry) => entry.id === id);
    if (index === -1) return;

    // Side effect: keep legacy `status` while treating `execution.status` as source of truth for MVP persistence.
    const next = normalizeTodayExecution(this.state.today[index]);
    next.execution.status = status;
    next.execution.updatedAt = new Date().toISOString();
    next.status = status;
    this.state.today[index] = next;

    // Persistence expectation: save status changes immediately so execute progress survives refreshes.
    await this.persist();
    this.emit();
  }

  async deferTodayItem(id) {
    // Defer marks the item as intentionally postponed but keeps it in Today for visibility.
    await this.setTodayStatus(id, 'deferred');
  }

  async archiveTodayItem(id) {
    // Archive marks the item as parked; item remains in Today for MVP history and can still show notes.
    await this.setTodayStatus(id, 'archived');
  }

  async addTodayUpdateNote(id, noteText) {
    const note = (noteText || '').trim();
    if (!note) return;

    const index = this.state.today.findIndex((entry) => entry.id === id);
    if (index === -1) return;

    // Note side effect: append immutable timestamped updates directly onto the Today item execution state.
    const next = normalizeTodayExecution(this.state.today[index]);
    next.execution.notes.push({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: note,
      createdAt: new Date().toISOString()
    });
    next.execution.updatedAt = new Date().toISOString();
    this.state.today[index] = next;

    // Persistence expectation: notes are workflow evidence and must be saved with each write.
    await this.persist();
    this.emit();
  }

  getIncompleteTodayItems() {
    // Close-mode guard: an item is incomplete unless it is explicitly marked `complete`.
    // We intentionally treat deferred/blocked/waiting/cancelled as incomplete so closure history captures unfinished intent.
    return this.state.today.map(normalizeTodayExecution).filter((item) => !isTodayItemComplete(item));
  }

  validateIncompleteTodayNotes() {
    const missing = this.getIncompleteTodayItems().filter((item) => {
      const lastNote = getLastTodayNote(item);
      return !lastNote?.text?.trim();
    });

    return {
      valid: missing.length === 0,
      missing
    };
  }

  createDailyLogSnapshot() {
    const planned = this.state.today.map(normalizeTodayExecution);
    const completed = planned.filter((item) => isTodayItemComplete(item));
    const incomplete = planned.filter((item) => !isTodayItemComplete(item));

    return {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      plannedCount: planned.length,
      planned: planned.map((item) => ({ id: item.id, title: item.title, status: item.execution.status })),
      completed: completed.map((item) => ({ id: item.id, title: item.title, status: item.execution.status })),
      incomplete: incomplete.map((item) => {
        const lastNote = getLastTodayNote(item);
        return {
          id: item.id,
          title: item.title,
          status: item.execution.status,
          lastUpdate: lastNote ? { text: lastNote.text, createdAt: lastNote.createdAt } : null
        };
      })
    };
  }

  async generateDailyLogSnapshot() {
    const snapshot = this.createDailyLogSnapshot();
    this.state.dailyLogs.unshift(snapshot);
    await this.persist();
    this.emit();
    return snapshot;
  }

  async resetTodayForNextDay() {
    this.state.today = [];
    await this.persist();
    this.emit();
  }

  async closeDay() {
    const validation = this.validateIncompleteTodayNotes();
    if (!validation.valid) {
      return { ok: false, reason: 'missing_updates', missing: validation.missing };
    }

    // Guardrail: enforce update-note validation before wiping Today so incomplete context isn't permanently lost.
    const snapshot = await this.generateDailyLogSnapshot();
    await this.resetTodayForNextDay();
    return { ok: true, snapshot };
  }

  emit() {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }
}
