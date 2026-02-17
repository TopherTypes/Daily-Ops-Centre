import { DbClient } from './db.js';
import { getDeviceId } from './device.js';

const SNAPSHOT_SCHEMA_VERSION = 2;
const STATE_SCHEMA_VERSION = 2;
const STAMPED_FIELD_CONTAINER_KEY = '_fields';

const MUTABLE_FIELDS_BY_COLLECTION = {
  inbox: ['raw', 'type', 'archived', 'processedType', 'processedAt', 'snoozed'],
  today: ['title', 'status', 'bucket', 'execution', 'due', 'scheduled', 'priority', 'context'],
  tasks: ['title', 'status', 'due', 'scheduled', 'priority', 'context'],
  meetings: ['title', 'time', 'meetingType', 'agenda', 'notes', 'due', 'scheduled', 'priority', 'context'],
  reminders: ['title', 'status', 'due', 'scheduled', 'priority', 'context'],
  notes: ['title', 'body', 'context', 'priority'],
  followUps: ['title', 'details', 'recipients', 'status', 'context', 'priority'],
  people: ['name', 'email', 'phone'],
  projects: ['name', 'status'],
  suggestions: ['title', 'meta', 'type'],
  dailyLogs: []
};
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
  const now = new Date();
  return {
    inbox: [
      { id: 'in_1', raw: 'Follow up with @Mina on launch metrics tomorrow', type: 'follow-up', archived: false, snoozed: false },
      { id: 'in_2', raw: 'Book 1:1 with @Harper #Roadmap do:2026-02-18', type: 'meeting', archived: false, snoozed: false },
      { id: 'in_3', raw: 'Sketch decision log format for team', type: 'task', archived: false, snoozed: false },
      { id: 'in_4', raw: 'Archive old status note', type: 'note', archived: true, snoozed: false }
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
    dailyLogs: [],
    // Local-date heartbeat used to detect startup day rollovers in a timezone-safe way.
    lastActiveDate: toLocalIsoDate(now)
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

function isStampedField(value) {
  return Boolean(value && typeof value === 'object' && 'updatedAt' in value && 'updatedByDeviceId' in value && 'value' in value);
}

/**
 * Creates a conflict-aware field stamp for field-level merges.
 */
function stampField(value, deviceId, updatedAt = new Date().toISOString()) {
  return { value, updatedAt, updatedByDeviceId: deviceId };
}

/**
 * Writes a stamped field and mirrors the raw value for backward compatible reads.
 */
function updateStampedField(record, key, value, deviceId, updatedAt = new Date().toISOString()) {
  if (!record || typeof record !== 'object') return record;

  if (!record[STAMPED_FIELD_CONTAINER_KEY] || typeof record[STAMPED_FIELD_CONTAINER_KEY] !== 'object') {
    record[STAMPED_FIELD_CONTAINER_KEY] = {};
  }

  const stamped = stampField(value, deviceId, updatedAt);
  record[STAMPED_FIELD_CONTAINER_KEY][key] = stamped;
  record[key] = value;
  return record;
}

function getStampedValue(record, key, fallback = undefined) {
  const stamped = record?.[STAMPED_FIELD_CONTAINER_KEY]?.[key];
  if (isStampedField(stamped)) return stamped.value;
  return record?.[key] ?? fallback;
}

function stampEntityMutableFields(record, keys, deviceId, updatedAt = new Date().toISOString()) {
  for (const key of keys) {
    if (!(key in record)) continue;
    updateStampedField(record, key, record[key], deviceId, updatedAt);
  }
  return record;
}


function createTodayExecutionState(status = 'not started') {
  return {
    status,
    updatedAt: new Date().toISOString(),
    notes: []
  };
}

function normalizeTodayExecution(item) {
  const execution = getStampedValue(item, 'execution', item.execution || {});
  const status = getStampedValue(item, 'status', execution.status || item.status || 'not started');

  return {
    ...item,
    status,
    execution: {
      status,
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
function getLatestStamp(localStamp, incomingStamp) {
  if (isStampedField(localStamp) && isStampedField(incomingStamp)) {
    return Date.parse(incomingStamp.updatedAt) >= Date.parse(localStamp.updatedAt) ? incomingStamp : localStamp;
  }

  if (isStampedField(incomingStamp)) return incomingStamp;
  if (isStampedField(localStamp)) return localStamp;
  return null;
}

/**
 * Merges entity fields and resolves conflicts with per-field `updatedAt` stamps.
 */
function mergeEntityFields(localEntity, incomingEntity, mutableKeys = []) {
  if (!localEntity || typeof localEntity !== 'object') return incomingEntity;
  if (!incomingEntity || typeof incomingEntity !== 'object') return localEntity;

  const merged = {
    ...localEntity,
    ...incomingEntity,
    id: localEntity.id || incomingEntity.id,
    [STAMPED_FIELD_CONTAINER_KEY]: {
      ...(localEntity[STAMPED_FIELD_CONTAINER_KEY] || {}),
      ...(incomingEntity[STAMPED_FIELD_CONTAINER_KEY] || {})
    }
  };

  for (const key of mutableKeys) {
    const localStamp = localEntity?.[STAMPED_FIELD_CONTAINER_KEY]?.[key];
    const incomingStamp = incomingEntity?.[STAMPED_FIELD_CONTAINER_KEY]?.[key];
    const latestStamp = getLatestStamp(localStamp, incomingStamp);

    if (latestStamp) {
      merged[STAMPED_FIELD_CONTAINER_KEY][key] = latestStamp;
      merged[key] = latestStamp.value;
      continue;
    }

    if (key in incomingEntity) {
      merged[key] = incomingEntity[key];
    } else if (key in localEntity) {
      merged[key] = localEntity[key];
    }
  }

  return merged;
}

function mergeCollectionById(localItems, importedItems, mutableKeys = []) {
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
      merged.push(mergeEntityFields(localEntry, incomingById.get(localEntry.id), mutableKeys));
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

function migrateRecordToStampedFields(record, mutableKeys, defaultDeviceId) {
  if (!record || typeof record !== 'object') return record;
  const migrated = { ...record };
  const updatedAt = migrated.updatedAt || new Date().toISOString();
  stampEntityMutableFields(migrated, mutableKeys, defaultDeviceId, updatedAt);
  return migrated;
}

/**
 * Ensures a migrated state has all required top-level collections and key fields.
 *
 * This runs after version-specific migrations so unknown or partial payloads
 * still produce a usable in-memory model.
 */
function applyStateGuards(state) {
  const guarded = state && typeof state === 'object' ? state : {};

  for (const collection of ['inbox', 'today', 'tasks', 'meetings', 'people', 'projects', 'followUps', 'reminders', 'notes', 'dailyLogs']) {
    if (!Array.isArray(guarded[collection])) {
      guarded[collection] = [];
    }
  }

  if (!guarded.suggestions || typeof guarded.suggestions !== 'object') {
    guarded.suggestions = { must: [], should: [], could: [] };
  }

  for (const bucket of ['must', 'should', 'could']) {
    if (!Array.isArray(guarded.suggestions[bucket])) {
      guarded.suggestions[bucket] = [];
    }
  }

  guarded.inbox = guarded.inbox.map((entry) => ({ archived: false, snoozed: false, ...entry }));
  guarded.today = guarded.today.map((entry) => normalizeTodayExecution(entry || {}));

  if (typeof guarded.lastActiveDate !== 'string') {
    guarded.lastActiveDate = toLocalIsoDate(new Date());
  }

  return guarded;
}

const STATE_MIGRATIONS = [
  {
    fromVersion: 1,
    toVersion: 2,
    apply: (state, { deviceId }) => {
      const migrated = structuredClone(state);
      for (const [collection, mutableKeys] of Object.entries(MUTABLE_FIELDS_BY_COLLECTION)) {
        if (collection === 'suggestions') {
          for (const bucket of ['must', 'should', 'could']) {
            if (!Array.isArray(migrated.suggestions?.[bucket])) continue;
            migrated.suggestions[bucket] = migrated.suggestions[bucket].map((entry) => migrateRecordToStampedFields(entry, mutableKeys, deviceId));
          }
          continue;
        }

        if (!Array.isArray(migrated[collection])) continue;
        migrated[collection] = migrated[collection].map((entry) => migrateRecordToStampedFields(entry, mutableKeys, deviceId));
      }
      return migrated;
    }
  }
];

/**
 * Migrates persisted snapshots to the current state schema using ordered steps.
 */
function migrateState(snapshot) {
  const warnings = [];
  const fallbackState = applyStateGuards(createSeedData());

  try {
    const record = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const payload = record.payload;
    const payloadIsVersionedEnvelope = payload && typeof payload === 'object' && payload.collections && typeof payload.collections === 'object';

    let workingState = payloadIsVersionedEnvelope ? structuredClone(payload.collections) : structuredClone(payload || {});
    let schemaVersion = payloadIsVersionedEnvelope
      ? Number(payload.schemaVersion || record.schemaVersion || 1)
      : Number(record.schemaVersion || 1);

    if (!workingState || typeof workingState !== 'object' || Number.isNaN(schemaVersion)) {
      warnings.push('Loaded state was malformed. Falling back to seeded state.');
      return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
    }

    if (schemaVersion > STATE_SCHEMA_VERSION) {
      warnings.push(`Loaded schemaVersion ${schemaVersion} is newer than supported ${STATE_SCHEMA_VERSION}. Falling back to seeded state.`);
      return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
    }

    while (schemaVersion < STATE_SCHEMA_VERSION) {
      const step = STATE_MIGRATIONS.find((entry) => entry.fromVersion === schemaVersion);
      if (!step) {
        warnings.push(`No migration path found from schemaVersion ${schemaVersion}. Falling back to seeded state.`);
        return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
      }

      workingState = step.apply(workingState, { deviceId: record.deviceId || getDeviceId() });
      schemaVersion = step.toVersion;
    }

    return {
      state: applyStateGuards(workingState),
      schemaVersion,
      warnings
    };
  } catch (error) {
    warnings.push(`State migration failed with error: ${error instanceof Error ? error.message : 'unknown error'}. Falling back to seeded state.`);
    return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
  }
}

function migrateStateToCurrentSchema(state, schemaVersion, deviceId) {
  return migrateState({
    schemaVersion,
    deviceId,
    payload: {
      schemaVersion,
      collections: state
    }
  });
}

/**
 * Returns YYYY-MM-DD in local time so date heuristics remain stable for users.
 */
function toLocalIsoDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's local ISO date using the browser/device local timezone.
 *
 * Timezone source: JavaScript Date local getters (`getFullYear/getMonth/getDate`),
 * which ensures rollover behavior aligns with what the user considers "today"
 * on their current device timezone settings.
 */
function getCurrentLocalIsoDate(reference = new Date()) {
  return toLocalIsoDate(reference);
}

/**
 * Pure helper that infers a schedule date from relative terms.
 *
 * Supported terms:
 * - today -> reference date
 * - tomorrow -> reference date + 1 day
 */
export function inferRelativeScheduleDate(rawText, referenceDate = new Date()) {
  const text = String(rawText || '').toLowerCase();
  const todayIndex = text.search(/\btoday\b/);
  const tomorrowIndex = text.search(/\btomorrow\b/);

  if (todayIndex === -1 && tomorrowIndex === -1) return '';

  const shouldUseToday = todayIndex !== -1 && (tomorrowIndex === -1 || todayIndex < tomorrowIndex);
  const base = new Date(referenceDate);
  if (!shouldUseToday) {
    base.setDate(base.getDate() + 1);
  }

  return toLocalIsoDate(base);
}

/**
 * Pure helper that suggests a meeting conversion from common meeting language.
 */
export function inferMeetingSuggestion(rawText) {
  const text = String(rawText || '').toLowerCase();
  const meetingPhrasePatterns = [
    /\bmeeting\b/,
    /\b1:1\b/,
    /\b1-1\b/,
    /\bone[-\s]on[-\s]one\b/,
    /\bsync\b/,
    /\bstand[-\s]?up\b/,
    /\bcheck[-\s]?in\b/,
    /\bcatch[-\s]?up\b/,
    /\bcall\b/
  ];

  return meetingPhrasePatterns.some((pattern) => pattern.test(text));
}

/**
 * Runs opt-in deterministic heuristics so explicit tokens can still take precedence.
 */
export function extractCaptureHeuristics(rawText, referenceDate = new Date()) {
  return {
    scheduleDate: inferRelativeScheduleDate(rawText, referenceDate),
    type: inferMeetingSuggestion(rawText) ? 'meeting' : ''
  };
}

/**
 * Deterministic token parser for the documented capture syntax.
 */
export function parseCaptureTokens(rawText, options = {}) {
  const { enableHeuristics = false, referenceDate = new Date() } = options;
  const people = [...rawText.matchAll(/(^|\s)@([A-Za-z0-9][\w-]*)/g)].map((match) => match[2]);
  const projects = [...rawText.matchAll(/(^|\s)#([A-Za-z0-9][\w-]*)/g)].map((match) => match[2]);
  const priorityMatch = rawText.match(/(^|\s)!p([1-5])(\s|$)/i);
  const dueMatch = rawText.match(/(^|\s)due:(\d{4}-\d{2}-\d{2})(\s|$)/i);
  const doMatch = rawText.match(/(^|\s)do:(\d{4}-\d{2}-\d{2})(\s|$)/i);
  const typeMatch = rawText.match(/(^|\s)type:(task|meeting|note|reminder|followup|project|person)(\s|$)/i);
  const contextMatch = rawText.match(/(^|\s)(work|personal):(\s|$)/i);
  const heuristics = enableHeuristics ? extractCaptureHeuristics(rawText, referenceDate) : { scheduleDate: '', type: '' };

  return {
    people,
    projects,
    priority: priorityMatch ? Number(priorityMatch[2]) : null,
    dueDate: dueMatch?.[2] || '',
    scheduleDate: doMatch?.[2] || heuristics.scheduleDate,
    type: typeMatch?.[2]?.toLowerCase() || heuristics.type,
    context: contextMatch?.[2]?.toLowerCase() || '',
    inferred: {
      scheduleDate: doMatch?.[2] ? '' : heuristics.scheduleDate,
      type: typeMatch?.[2] ? '' : heuristics.type
    }
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
    this.startupRolloverNotice = null;
    this.migrationWarnings = [];
    this.persistence = {
      degraded: false,
      lastOperation: 'init',
      lastError: ''
    };
  }

  /**
   * Stores persistence health for top-bar diagnostics and operator awareness.
   */
  setPersistenceStatus(partial) {
    this.persistence = { ...this.persistence, ...partial };
  }

  getPersistenceStatus() {
    return { ...this.persistence };
  }

  logPersistenceDiagnostic(operation, error, context = {}) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown persistence error');
    console.error(`[AppStore:${operation}] persistence failure.`, {
      operation,
      message,
      errorName: error?.name || 'unknown',
      context
    });
  }

  async init() {
    const now = new Date();
    const currentLocalDate = getCurrentLocalIsoDate(now);

    try {
      const ready = await this.db.init();
      let migrationResult = migrateState({
        schemaVersion: STATE_SCHEMA_VERSION,
        deviceId: getDeviceId(),
        payload: {
          schemaVersion: STATE_SCHEMA_VERSION,
          collections: this.state
        }
      });

      if (ready) {
        try {
          const snapshot = await this.db.get('wireframe-state');
          if (snapshot?.payload) {
            migrationResult = migrateState(snapshot);
          }
        } catch (error) {
          this.logPersistenceDiagnostic('get', error, { key: 'wireframe-state' });
          this.setPersistenceStatus({
            degraded: true,
            lastOperation: 'get',
            lastError: 'Stored state could not be read. Running with in-memory state until writes recover.'
          });
        }
      }

      // Only assign in-memory state once migration and guard-fill pass.
      this.state = migrationResult.state;
      this.migrationWarnings = migrationResult.warnings;
      if (this.migrationWarnings.length) {
        console.warn('State migration completed with warnings.', this.migrationWarnings);
      }

      this.ensureCollections();
      this.setPersistenceStatus({
        degraded: this.persistence.degraded,
        lastOperation: 'init',
        lastError: this.persistence.lastError
      });

      const rolloverResult = this.applyStartupDayRollover(currentLocalDate, now);
      // Persist date/rollover outcomes immediately so refreshes are deterministic.
      if (rolloverResult.didChangeDate || !rolloverResult.previousDate || this.migrationWarnings.length) {
        await this.persist();
      }
    } catch (error) {
      this.migrationWarnings = ['Initialization failed. Using in-memory seeded state.'];
      this.logPersistenceDiagnostic('init', error, { schemaVersion: STATE_SCHEMA_VERSION });
      this.setPersistenceStatus({
        degraded: true,
        lastOperation: 'init',
        lastError: 'Initialization failed. Running in memory-only degraded mode until a save succeeds.'
      });
      this.state = applyStateGuards(createSeedData());
    }
  }

  /**
   * Startup-only day-change handler.
   *
   * If the saved local date differs from today's local date, this clears `today`
   * and records a lightweight rollover snapshot in dailyLogs for operator context.
   */
  applyStartupDayRollover(currentLocalDate, now = new Date()) {
    const previousDate = typeof this.state.lastActiveDate === 'string' ? this.state.lastActiveDate : '';
    const didChangeDate = Boolean(previousDate && previousDate !== currentLocalDate);

    if (!didChangeDate) {
      this.state.lastActiveDate = currentLocalDate;
      this.startupRolloverNotice = null;
      return { didChangeDate: false, previousDate, currentLocalDate };
    }

    const previousTodayItems = Array.isArray(this.state.today) ? structuredClone(this.state.today) : [];
    if (previousTodayItems.length) {
      // Optional startup snapshot: keeps yesterday's unclosed Today plan for traceability.
      this.state.dailyLogs.unshift({
        id: `log_rollover_${Date.now()}`,
        date: previousDate,
        summary: 'Automatic startup rollover: Today reset after date change.',
        generatedAt: now.toISOString(),
        notes: [`Recovered ${previousTodayItems.length} Today item(s) from previous date.`],
        type: 'rollover',
        rolloverFromDate: previousDate,
        rolloverToDate: currentLocalDate,
        priorTodayItems: previousTodayItems
      });
    }

    this.state.today = [];
    this.state.lastActiveDate = currentLocalDate;
    this.startupRolloverNotice = {
      previousDate,
      currentDate: currentLocalDate,
      recoveredItemCount: previousTodayItems.length
    };
    return { didChangeDate: true, previousDate, currentLocalDate };
  }

  getStartupRolloverNotice() {
    return this.startupRolloverNotice ? structuredClone(this.startupRolloverNotice) : null;
  }

  getMigrationWarnings() {
    return [...this.migrationWarnings];
  }

  ensureCollections() {
    this.state = applyStateGuards(this.state);
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

    const { schemaVersion, collections, deviceId } = payload;
    if (typeof schemaVersion !== 'number' || schemaVersion < 1 || schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(`Import failed: unsupported schemaVersion ${schemaVersion}.`);
    }

    if (!collections || typeof collections !== 'object') {
      throw new Error('Import failed: missing collections object.');
    }

    const migratedImport = migrateStateToCurrentSchema(collections, schemaVersion, deviceId || getDeviceId());
    if (migratedImport.warnings.length) {
      console.warn('Import migration completed with warnings.', migratedImport.warnings);
    }

    this.ensureCollections();

    const mergeSummary = {};

    for (const collection of IMPORTABLE_COLLECTIONS) {
      if (!(collection in migratedImport.state)) continue;

      if (collection === 'suggestions') {
        const localSuggestions = this.state.suggestions || {};
        const importedSuggestions = migratedImport.state.suggestions;
        if (!importedSuggestions || typeof importedSuggestions !== 'object') {
          throw new Error('Import failed: suggestions must be an object containing must/should/could arrays.');
        }

        for (const bucket of ['must', 'should', 'could']) {
          if (!Array.isArray(importedSuggestions[bucket])) {
            throw new Error(`Import failed: suggestions.${bucket} must be an array.`);
          }
        }

        const mutableFields = MUTABLE_FIELDS_BY_COLLECTION.suggestions;
        const mergedSuggestions = {
          must: mergeCollectionById(localSuggestions.must, importedSuggestions.must, mutableFields),
          should: mergeCollectionById(localSuggestions.should, importedSuggestions.should, mutableFields),
          could: mergeCollectionById(localSuggestions.could, importedSuggestions.could, mutableFields)
        };
        this.state.suggestions = mergedSuggestions;
        mergeSummary.suggestions = mergedSuggestions.must.length + mergedSuggestions.should.length + mergedSuggestions.could.length;
        continue;
      }

      const localCollection = this.state[collection];
      const importedCollection = migratedImport.state[collection];
      if (!Array.isArray(importedCollection)) {
        throw new Error(`Import failed: collection "${collection}" must be an array.`);
      }

      const mutableFields = MUTABLE_FIELDS_BY_COLLECTION[collection] || [];
      const merged = mergeCollectionById(localCollection, importedCollection, mutableFields);
      this.state[collection] = merged;
      mergeSummary[collection] = merged.length;
    }

    await this.persist();
    this.emit();
    return { ok: true, merged: mergeSummary };
  }

  async persist() {
    const record = {
      id: 'wireframe-state',
      schemaVersion: STATE_SCHEMA_VERSION,
      deviceId: getDeviceId(),
      payload: {
        schemaVersion: STATE_SCHEMA_VERSION,
        collections: this.state
      },
      updatedAt: Date.now()
    };

    try {
      await this.db.put(record);
      this.setPersistenceStatus({
        degraded: false,
        lastOperation: 'put',
        lastError: ''
      });
      return { ok: true };
    } catch (error) {
      this.logPersistenceDiagnostic('put', error, { key: record.id });
      const failedMessage = 'Unable to save changes locally. Keep this tab open and export a backup once persistence recovers.';
      this.setPersistenceStatus({
        degraded: true,
        lastOperation: 'put',
        lastError: failedMessage
      });
      return { ok: false, error: new Error(failedMessage), cause: error };
    }
  }

  /**
   * Persists an optimistic mutation and reverts memory if the write fails.
   */
  async commitStateMutation(previousState, operationName) {
    const persistResult = await this.persist();
    if (!persistResult.ok) {
      this.state = previousState;
      this.emit();
      throw new Error(`${operationName} failed because local persistence is unavailable.`);
    }

    this.emit();
    return true;
  }

  async addInboxItem(raw) {
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const item = {
      id: `in_${Date.now()}`,
      raw,
      type: 'unknown',
      archived: false,
      snoozed: false
    };
    stampEntityMutableFields(item, MUTABLE_FIELDS_BY_COLLECTION.inbox, deviceId, now);
    const previousState = structuredClone(this.state);
    this.state.inbox.unshift(item);
    await this.commitStateMutation(previousState, 'capture');
  }

  async toggleArchiveInbox(id) {
    const item = this.state.inbox.find((entry) => entry.id === id);
    if (!item) return;

    const nextArchived = !getStampedValue(item, 'archived', item.archived);
    updateStampedField(item, 'archived', nextArchived, getDeviceId());
    await this.persist();
    this.emit();
  }

  async toggleSnoozeInbox(id) {
    const item = this.state.inbox.find((entry) => entry.id === id);
    if (!item) return;

    // Snooze is a lightweight inbox state used to intentionally postpone processing.
    const nextSnoozed = !getStampedValue(item, 'snoozed', item.snoozed || false);
    updateStampedField(item, 'snoozed', nextSnoozed, getDeviceId());
    await this.persist();
    this.emit();
  }

  /**
   * Toggles a single follow-up recipient between pending and complete states.
   */
  async toggleFollowUpRecipient(groupId, personId) {
    if (!groupId || !personId) return;

    const group = this.state.followUps.find((entry) => entry.id === groupId);
    if (!group || !Array.isArray(group.recipients)) return;

    const recipient = group.recipients.find((entry) => entry.personId === personId);
    if (!recipient) return;

    const nextStatus = recipient.status === 'complete' ? 'pending' : 'complete';
    recipient.status = nextStatus;

    // Keep aggregate follow-up status in sync so list/detail views can reflect completion at a glance.
    const hasPending = group.recipients.some((entry) => entry.status !== 'complete');
    updateStampedField(group, 'recipients', group.recipients, getDeviceId());
    updateStampedField(group, 'status', hasPending ? 'pending' : 'complete', getDeviceId());

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
    stampEntityMutableFields(created, MUTABLE_FIELDS_BY_COLLECTION.people, getDeviceId());
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
    stampEntityMutableFields(created, MUTABLE_FIELDS_BY_COLLECTION.projects, getDeviceId());
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
    const previousState = structuredClone(this.state);

    const inboxItem = this.state.inbox.find((entry) => entry.id === inboxId);
    if (!inboxItem) return;

    const inboxRaw = getStampedValue(inboxItem, 'raw', inboxItem.raw) || '';
    const parsed = parseCaptureTokens(inboxRaw, { enableHeuristics: true });
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const provenance = {
      type: 'inbox',
      inboxId: inboxItem.id,
      raw: inboxRaw,
      processedAt: now
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
      title: fields.title || titleFromRaw(inboxRaw),
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
      const nextTask = { ...baseRecord, status: 'backlog' };
      stampEntityMutableFields(nextTask, MUTABLE_FIELDS_BY_COLLECTION.tasks, deviceId, now);
      this.state.tasks.unshift(nextTask);
    } else if (resolvedType === 'meeting') {
      const nextMeeting = {
        ...baseRecord,
        meetingType: personEntities.length === 1 ? 'one_to_one' : 'group',
        agenda: '',
        notes: ''
      };
      stampEntityMutableFields(nextMeeting, MUTABLE_FIELDS_BY_COLLECTION.meetings, deviceId, now);
      this.state.meetings.unshift(nextMeeting);
    } else if (resolvedType === 'person') {
      const personName = fields.title || personEntities[0]?.name || titleFromRaw(inboxRaw);
      this.findOrCreatePerson(personName, provenance);
    } else if (resolvedType === 'project') {
      const projectName = fields.title || projectEntity?.name || titleFromRaw(inboxRaw);
      this.findOrCreateProject(projectName, provenance);
    } else if (resolvedType === 'followup') {
      const nextFollowUp = {
        ...baseRecord,
        source: 'inbox',
        sourceInboxId: inboxItem.id,
        recipients: personEntities.map((person) => ({ personId: person.id, status: 'pending' }))
      };
      stampEntityMutableFields(nextFollowUp, MUTABLE_FIELDS_BY_COLLECTION.followUps, deviceId, now);
      this.state.followUps.unshift(nextFollowUp);
    } else if (resolvedType === 'reminder') {
      const nextReminder = { ...baseRecord, status: 'pending' };
      stampEntityMutableFields(nextReminder, MUTABLE_FIELDS_BY_COLLECTION.reminders, deviceId, now);
      this.state.reminders.unshift(nextReminder);
    } else if (resolvedType === 'note') {
      const nextNote = { ...baseRecord, body: inboxRaw };
      stampEntityMutableFields(nextNote, MUTABLE_FIELDS_BY_COLLECTION.notes, deviceId, now);
      this.state.notes.unshift(nextNote);
    } else {
      const fallbackTask = { ...baseRecord, status: 'backlog' };
      stampEntityMutableFields(fallbackTask, MUTABLE_FIELDS_BY_COLLECTION.tasks, deviceId, now);
      this.state.tasks.unshift(fallbackTask);
    }

    // Archive the source item after successful conversion to preserve inbox provenance.
    updateStampedField(inboxItem, 'archived', true, deviceId, now);
    updateStampedField(inboxItem, 'snoozed', false, deviceId, now);
    updateStampedField(inboxItem, 'processedType', resolvedType, deviceId, now);
    updateStampedField(inboxItem, 'processedAt', provenance.processedAt, deviceId, now);

    await this.commitStateMutation(previousState, 'process');
  }

  async addToToday(bucket, suggestionId) {
    const pool = [...this.state.suggestions.must, ...this.state.suggestions.should, ...this.state.suggestions.could];
    const suggestion = pool.find((entry) => entry.id === suggestionId);
    if (!suggestion) return;

    // Prevent duplicate Today entries for the same suggestion while preserving existing order.
    const alreadyPresent = this.state.today.some((entry) => (entry.suggestionId || entry.id) === suggestionId);
    if (alreadyPresent) return;

    const now = new Date().toISOString();
    const item = {
      ...suggestion,
      id: `today_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      suggestionId,
      bucket,
      execution: createTodayExecutionState('not started'),
      status: 'not started'
    };
    stampEntityMutableFields(item, MUTABLE_FIELDS_BY_COLLECTION.today, getDeviceId(), now);

    this.state.today.push(item);
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

  async setSuggestionBucket(id, nextBucket) {
    const buckets = ['must', 'should', 'could'];
    if (!buckets.includes(nextBucket)) return;

    // Search each bucket and relocate the suggestion atomically when found.
    let sourceBucket = null;
    let sourceIndex = -1;
    for (const bucket of buckets) {
      const index = this.state.suggestions[bucket].findIndex((entry) => entry.id === id);
      if (index !== -1) {
        sourceBucket = bucket;
        sourceIndex = index;
        break;
      }
    }

    if (!sourceBucket || sourceBucket === nextBucket) return;

    const [entry] = this.state.suggestions[sourceBucket].splice(sourceIndex, 1);
    this.state.suggestions[nextBucket].unshift(entry);
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
    updateStampedField(next, 'execution', next.execution, getDeviceId(), next.execution.updatedAt);
    updateStampedField(next, 'status', status, getDeviceId(), next.execution.updatedAt);
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
    const previousState = structuredClone(this.state);
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
    updateStampedField(next, 'execution', next.execution, getDeviceId(), next.execution.updatedAt);
    this.state.today[index] = next;

    // Persistence expectation: notes are workflow evidence and must be saved with each write.
    await this.commitStateMutation(previousState, 'update note');
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

  /**
   * Returns close-day blockers grouped by category so callers can render actionable guidance.
   */
  validateCloseReadiness() {
    const todayValidation = this.validateIncompleteTodayNotes();

    const inboxCandidates = this.state.inbox.filter((item) => {
      const archived = getStampedValue(item, 'archived', item.archived);
      return !archived;
    });

    // Inbox closure rule: every unarchived inbox row must either be processed or archived.
    const unprocessedInbox = inboxCandidates.filter((item) => {
      const processedAt = getStampedValue(item, 'processedAt', item.processedAt || '');
      return !processedAt;
    });

    // Snoozed rows are highlighted separately so the UI can explain why these still block close.
    const snoozedInbox = unprocessedInbox.filter((item) => getStampedValue(item, 'snoozed', item.snoozed || false));

    return {
      valid: todayValidation.valid && unprocessedInbox.length === 0,
      missingTodayNotes: todayValidation.missing,
      unprocessedInbox,
      snoozedInbox
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
    const readiness = this.validateCloseReadiness();
    if (!readiness.valid) {
      const blockers = [];
      if (readiness.missingTodayNotes.length) {
        blockers.push({ type: 'missing_today_notes', items: readiness.missingTodayNotes });
      }
      if (readiness.unprocessedInbox.length) {
        blockers.push({ type: 'unprocessed_inbox', items: readiness.unprocessedInbox });
      }
      if (readiness.snoozedInbox.length) {
        blockers.push({ type: 'snoozed_inbox', items: readiness.snoozedInbox });
      }

      return {
        ok: false,
        reason: 'close_blocked',
        blockers,
        readiness
      };
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
