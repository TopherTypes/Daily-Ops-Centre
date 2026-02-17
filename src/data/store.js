import { DbClient } from './db.js';
import { getDeviceId } from './device.js';
import {
  STATUS_ENUMS,
  fail,
  normalizeFollowUpRecipients,
  normalizeIsoDate,
  normalizeRequiredText,
  ok,
  validateId,
  validateIsoDateTime,
  validateStatusEnum
} from './validation.js';

const SNAPSHOT_SCHEMA_VERSION = 3;
const STATE_SCHEMA_VERSION = 3;
const STAMPED_FIELD_CONTAINER_KEY = '_fields';

const MUTABLE_FIELDS_BY_COLLECTION = {
  inbox: ['raw', 'type', 'archived', 'deleted', 'deletedAt', 'processedType', 'processedEntityId', 'processedAt', 'snoozed'],
  today: ['title', 'status', 'bucket', 'execution', 'archived', 'deleted', 'deletedAt', 'due', 'scheduled', 'priority', 'context'],
  tasks: ['title', 'status', 'archived', 'deleted', 'deletedAt', 'due', 'scheduled', 'priority', 'context'],
  meetings: ['title', 'time', 'meetingType', 'agenda', 'notes', 'archived', 'deleted', 'deletedAt', 'due', 'scheduled', 'priority', 'context'],
  reminders: ['title', 'status', 'archived', 'deleted', 'deletedAt', 'due', 'scheduled', 'priority', 'context'],
  notes: ['title', 'body', 'archived', 'deleted', 'deletedAt', 'context', 'priority'],
  followUps: ['title', 'details', 'recipients', 'status', 'archived', 'deleted', 'deletedAt', 'context', 'priority'],
  people: ['name', 'email', 'phone', 'archived', 'deleted', 'deletedAt'],
  projects: ['name', 'status', 'archived', 'deleted', 'deletedAt'],
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
 * Creates a production-safe baseline state for normal users.
 *
 * All collections intentionally start empty so first-run environments do not
 * show demo content by default.
 */
function createEmptyState() {
  const now = new Date();
  return {
    inbox: [],
    suggestions: { must: [], should: [], could: [] },
    today: [],
    tasks: [],
    people: [],
    projects: [],
    reminders: [],
    notes: [],
    meetings: [],
    followUps: [],
    dailyLogs: [],
    // Storage state machine starts in loading and is transitioned during init/persist flows.
    storageStatus: 'loading',
    isDemoMode: false,
    // Local-date heartbeat used to detect startup day rollovers in a timezone-safe way.
    lastActiveDate: toLocalIsoDate(now)
  };
}

/**
 * Creates opt-in demo entities for sample walkthroughs and QA demos.
 */
function createDemoSeedData() {
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
    // Demo fixtures still rely on local IndexedDB, so this status is controlled by persistence transitions.
    storageStatus: 'loading',
    isDemoMode: true,
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

function normalizeMutationDates(fields = {}) {
  const dueDateResult = normalizeIsoDate(fields.dueDate, 'dueDate');
  if (!dueDateResult.ok) return dueDateResult;

  const scheduleDateResult = normalizeIsoDate(fields.scheduleDate, 'scheduleDate');
  if (!scheduleDateResult.ok) return scheduleDateResult;

  return ok({ dueDate: dueDateResult.value, scheduleDate: scheduleDateResult.value });
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

/**
 * Ensures all persisted entities expose lifecycle flags consistently.
 */
function normalizeEntityLifecycle(entry, defaults = {}) {
  return {
    archived: false,
    deleted: false,
    deletedAt: '',
    ...defaults,
    ...entry
  };
}

function isDeletedEntity(entry) {
  return Boolean(getStampedValue(entry, 'deleted', entry?.deleted || false));
}

function isArchivedEntity(entry) {
  return Boolean(getStampedValue(entry, 'archived', entry?.archived || false));
}

function isActiveEntity(entry) {
  return Boolean(entry) && !isDeletedEntity(entry) && !isArchivedEntity(entry);
}

function getNumericPriority(entry, fallback = 3) {
  const value = Number(getStampedValue(entry, 'priority', entry?.priority ?? fallback));
  return Number.isFinite(value) ? value : fallback;
}

function getTimeSinceDays(isoDate, referenceDate = new Date()) {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return (referenceDate.getTime() - timestamp) / (24 * 60 * 60 * 1000);
}

function getDayDiff(fromLocalDate, toLocalDate) {
  if (!fromLocalDate || !toLocalDate) return Number.POSITIVE_INFINITY;
  const from = Date.parse(`${fromLocalDate}T00:00:00`);
  const to = Date.parse(`${toLocalDate}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
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

  // Apply lifecycle defaults consistently so archive/delete behavior is deterministic across entities.
  guarded.inbox = guarded.inbox.map((entry) => normalizeEntityLifecycle(entry, { snoozed: false }));
  guarded.today = guarded.today.map((entry) => normalizeTodayExecution(normalizeEntityLifecycle(entry || {})));
  guarded.tasks = guarded.tasks.map((entry) => normalizeEntityLifecycle(entry));
  guarded.meetings = guarded.meetings.map((entry) => normalizeEntityLifecycle(entry));
  guarded.people = guarded.people.map((entry) => normalizeEntityLifecycle(entry));
  guarded.projects = guarded.projects.map((entry) => normalizeEntityLifecycle(entry));
  guarded.followUps = guarded.followUps.map((entry) => normalizeEntityLifecycle(entry));
  guarded.reminders = guarded.reminders.map((entry) => normalizeEntityLifecycle(entry));
  guarded.notes = guarded.notes.map((entry) => normalizeEntityLifecycle(entry));

  for (const bucket of ['must', 'should', 'could']) {
    guarded.suggestions[bucket] = guarded.suggestions[bucket].map((entry) => normalizeEntityLifecycle(entry));
  }

  if (typeof guarded.lastActiveDate !== 'string') {
    guarded.lastActiveDate = toLocalIsoDate(new Date());
  }

  if (!['loading', 'ready', 'degraded'].includes(guarded.storageStatus)) {
    guarded.storageStatus = 'loading';
  }

  if (typeof guarded.isDemoMode !== 'boolean') {
    guarded.isDemoMode = false;
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
  },
  {
    fromVersion: 2,
    toVersion: 3,
    apply: (state) => {
      // Schema v3 adds an explicit mode flag so demo fixtures can be opt-in only.
      return {
        ...structuredClone(state),
        isDemoMode: Boolean(state?.isDemoMode)
      };
    }
  }
];

/**
 * Migrates persisted snapshots to the current state schema using ordered steps.
 */
function migrateState(snapshot) {
  const warnings = [];
  const fallbackState = applyStateGuards(createEmptyState());

  try {
    const record = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const payload = record.payload;
    const payloadIsVersionedEnvelope = payload && typeof payload === 'object' && payload.collections && typeof payload.collections === 'object';

    let workingState = payloadIsVersionedEnvelope ? structuredClone(payload.collections) : structuredClone(payload || {});
    let schemaVersion = payloadIsVersionedEnvelope
      ? Number(payload.schemaVersion || record.schemaVersion || 1)
      : Number(record.schemaVersion || 1);

    if (!workingState || typeof workingState !== 'object' || Number.isNaN(schemaVersion)) {
      warnings.push('Loaded state was malformed. Falling back to empty local state.');
      return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
    }

    if (schemaVersion > STATE_SCHEMA_VERSION) {
      warnings.push(`Loaded schemaVersion ${schemaVersion} is newer than supported ${STATE_SCHEMA_VERSION}. Falling back to empty local state.`);
      return { state: fallbackState, schemaVersion: STATE_SCHEMA_VERSION, warnings };
    }

    while (schemaVersion < STATE_SCHEMA_VERSION) {
      const step = STATE_MIGRATIONS.find((entry) => entry.fromVersion === schemaVersion);
      if (!step) {
        warnings.push(`No migration path found from schemaVersion ${schemaVersion}. Falling back to empty local state.`);
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
    warnings.push(`State migration failed with error: ${error instanceof Error ? error.message : 'unknown error'}. Falling back to empty local state.`);
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
    this.state = createEmptyState();
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

    // Transition: every initialization attempt explicitly re-enters loading before probing IndexedDB.
    this.state.storageStatus = 'loading';

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
          // Transition: IndexedDB read failure means we can continue in-memory, but persistence is degraded.
          this.state.storageStatus = 'degraded';
        }
      } else {
        // Transition: browser does not expose IndexedDB; app remains usable but persistence is degraded.
        this.state.storageStatus = 'degraded';
        this.setPersistenceStatus({
          degraded: true,
          lastOperation: 'init',
          lastError: 'IndexedDB is unavailable in this environment. Running in memory-only degraded mode.'
        });
      }

      // Only assign in-memory state once migration and guard-fill pass.
      this.state = migrationResult.state;
      this.migrationWarnings = migrationResult.warnings;
      if (this.migrationWarnings.length) {
        console.warn('State migration completed with warnings.', this.migrationWarnings);
      }

      this.ensureCollections();
      if (!this.persistence.degraded) {
        // Transition: init + read path completed without persistence failures.
        this.state.storageStatus = 'ready';
      }
      this.setPersistenceStatus({
        degraded: this.persistence.degraded,
        lastOperation: 'init',
        lastError: this.persistence.lastError
      });

      const rolloverResult = this.applyStartupDayRollover(currentLocalDate, now);
      this.rebuildSuggestionsForDate(currentLocalDate);
      // Persist date/rollover outcomes immediately so refreshes are deterministic.
      if (rolloverResult.didChangeDate || !rolloverResult.previousDate || this.migrationWarnings.length) {
        await this.persist();
      }
    } catch (error) {
      this.migrationWarnings = ['Initialization failed. Using in-memory empty local state.'];
      this.logPersistenceDiagnostic('init', error, { schemaVersion: STATE_SCHEMA_VERSION });
      this.setPersistenceStatus({
        degraded: true,
        lastOperation: 'init',
        lastError: 'Initialization failed. Running in memory-only degraded mode until a save succeeds.'
      });
      this.state = applyStateGuards(createEmptyState());
      // Transition: hard init failure always leaves the storage layer degraded.
      this.state.storageStatus = 'degraded';
    }
  }

  /**
   * Retries the IndexedDB bootstrap without resetting user data.
   *
   * This is intended for top-bar recovery controls after browser storage
   * permissions or quota conditions change mid-session.
   */
  async retryStorageInitialization() {
    const previousStatus = this.state.storageStatus;
    this.state.storageStatus = 'loading';
    this.setPersistenceStatus({
      degraded: true,
      lastOperation: 'retry_init',
      lastError: ''
    });
    this.emit();

    try {
      const ready = await this.db.init();
      if (!ready) {
        throw new Error('IndexedDB unavailable in this environment.');
      }

      this.state.storageStatus = 'ready';
      this.setPersistenceStatus({
        degraded: false,
        lastOperation: 'retry_init',
        lastError: ''
      });
      this.emit();
      return { ok: true };
    } catch (error) {
      this.logPersistenceDiagnostic('retry_init', error, { previousStatus });
      this.state.storageStatus = 'degraded';
      this.setPersistenceStatus({
        degraded: true,
        lastOperation: 'retry_init',
        lastError: 'Storage retry failed. Continue in-memory and export a backup before closing this tab.'
      });
      this.emit();
      return { ok: false, error };
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

  /**
   * Rebuilds Plan suggestions from active entities for a specific local date.
   *
   * Rules intentionally mirror SPECS.md so Plan buckets are never stale placeholders.
   */
  rebuildSuggestionsForDate(localDate = getCurrentLocalIsoDate()) {
    this.ensureCollections();

    const today = localDate || getCurrentLocalIsoDate();
    const nowIso = new Date().toISOString();
    const deviceId = getDeviceId();
    const existingById = new Map();
    for (const bucket of ['must', 'should', 'could']) {
      for (const entry of this.state.suggestions[bucket] || []) {
        if (entry?.id) existingById.set(entry.id, entry);
      }
    }

    const next = { must: [], should: [], could: [] };
    const seenSuggestionIds = new Set();
    const peopleById = new Map(this.state.people.map((person) => [person.id, person]));

    const pushSuggestion = (bucket, { id, title, type, meta, sourceType = '', sourceId = '' }) => {
      if (!id || seenSuggestionIds.has(id)) return;
      seenSuggestionIds.add(id);

      // Preserve stable provenance IDs to avoid duplicate suggestions across rebuilds.
      const existing = existingById.get(id);
      const suggestion = normalizeEntityLifecycle({
        id,
        title,
        type,
        meta,
        sourceType,
        sourceId,
        archived: false,
        deleted: false,
        deletedAt: '',
        ...(existing ? { createdAt: existing.createdAt || nowIso } : { createdAt: nowIso })
      });

      // Keep mutable fields stamped so import merge semantics remain field-aware.
      stampEntityMutableFields(suggestion, MUTABLE_FIELDS_BY_COLLECTION.suggestions, deviceId, nowIso);
      next[bucket].push(suggestion);
    };

    // MUST: meetings today.
    for (const meeting of this.state.meetings.filter(isActiveEntity)) {
      if (getStampedValue(meeting, 'scheduled', meeting.scheduled || '') !== today) continue;
      pushSuggestion('must', {
        id: `sg_must_meeting_${meeting.id}`,
        title: getStampedValue(meeting, 'title', meeting.title || 'Untitled meeting'),
        type: 'meeting',
        meta: getStampedValue(meeting, 'time', meeting.time || 'today'),
        sourceType: 'meeting',
        sourceId: meeting.id
      });
    }

    const schedulables = [
      ...this.state.tasks.filter(isActiveEntity).map((entity) => ({ entity, type: 'task' })),
      ...this.state.reminders.filter(isActiveEntity).map((entity) => ({ entity, type: 'reminder' })),
      ...this.state.meetings.filter(isActiveEntity).map((entity) => ({ entity, type: 'meeting' }))
    ];

    // MUST: items scheduled today.
    for (const { entity, type } of schedulables) {
      if (getStampedValue(entity, 'scheduled', entity.scheduled || '') !== today) continue;
      pushSuggestion('must', {
        id: `sg_must_scheduled_${entity.id}`,
        title: getStampedValue(entity, 'title', entity.title || 'Scheduled item'),
        type,
        meta: 'scheduled today',
        sourceType: type,
        sourceId: entity.id
      });
    }

    // MUST: due-today commitments (tasks/reminders/meetings) and reminder-specific due now.
    for (const { entity, type } of schedulables) {
      if (getStampedValue(entity, 'due', entity.due || '') !== today) continue;
      pushSuggestion('must', {
        id: `sg_must_due_${entity.id}`,
        title: getStampedValue(entity, 'title', entity.title || 'Due item'),
        type,
        meta: type === 'reminder' ? 'reminder due today' : 'due today',
        sourceType: type,
        sourceId: entity.id
      });
    }

    // MUST: pending follow-up recipients.
    for (const followUp of this.state.followUps.filter(isActiveEntity)) {
      const recipients = Array.isArray(getStampedValue(followUp, 'recipients', followUp.recipients || []))
        ? getStampedValue(followUp, 'recipients', followUp.recipients || [])
        : [];
      const pendingRecipients = recipients.filter((recipient) => recipient?.status === 'pending');
      if (!pendingRecipients.length) continue;
      const recipientPreview = pendingRecipients
        .slice(0, 2)
        .map((recipient) => peopleById.get(recipient.personId)?.name || recipient.personId)
        .join(', ');
      const suffix = pendingRecipients.length > 2 ? ` +${pendingRecipients.length - 2}` : '';
      pushSuggestion('must', {
        id: `sg_must_followup_${followUp.id}`,
        title: getStampedValue(followUp, 'title', followUp.title || 'Follow-up'),
        type: 'follow-up',
        meta: `${pendingRecipients.length} pending${recipientPreview ? `: ${recipientPreview}${suffix}` : ''}`,
        sourceType: 'followup',
        sourceId: followUp.id
      });
    }

    // SHOULD: high-priority active tasks.
    for (const task of this.state.tasks.filter(isActiveEntity)) {
      const status = String(getStampedValue(task, 'status', task.status || 'backlog')).toLowerCase();
      if (['done', 'cancelled', 'archived'].includes(status)) continue;
      const priority = getNumericPriority(task);
      if (priority > 2) continue;
      pushSuggestion('should', {
        id: `sg_should_priority_${task.id}`,
        title: getStampedValue(task, 'title', task.title || 'Priority task'),
        type: 'task',
        meta: `high priority p${priority}`,
        sourceType: 'task',
        sourceId: task.id
      });
    }

    // SHOULD: upcoming deadlines in the next 3 days (excluding today).
    for (const { entity, type } of schedulables) {
      const due = getStampedValue(entity, 'due', entity.due || '');
      const daysUntilDue = getDayDiff(today, due);
      if (!(daysUntilDue >= 1 && daysUntilDue <= 3)) continue;
      pushSuggestion('should', {
        id: `sg_should_deadline_${entity.id}`,
        title: getStampedValue(entity, 'title', entity.title || 'Upcoming deadline'),
        type,
        meta: `due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
        sourceType: type,
        sourceId: entity.id
      });
    }

    // SHOULD: stale projects with no linked activity updates in 7+ days.
    for (const project of this.state.projects.filter(isActiveEntity)) {
      const projectId = project.id;
      const linkedTaskAges = this.state.tasks
        .filter((task) => isActiveEntity(task) && (task.linkedProjects || []).includes(projectId))
        .map((task) => getTimeSinceDays(task.updatedAt || task.createdAt || ''));
      const freshestLinkedAge = linkedTaskAges.length ? Math.min(...linkedTaskAges) : Number.POSITIVE_INFINITY;
      const projectAge = getTimeSinceDays(project.updatedAt || project.createdAt || '');
      const staleDays = Math.min(projectAge, freshestLinkedAge);
      if (!(staleDays >= 7 || staleDays === Number.POSITIVE_INFINITY)) continue;
      pushSuggestion('should', {
        id: `sg_should_stale_project_${project.id}`,
        title: getStampedValue(project, 'name', project.name || 'Project'),
        type: 'project',
        meta: staleDays === Number.POSITIVE_INFINITY ? 'no recent updates' : `stale ${Math.floor(staleDays)}d`,
        sourceType: 'project',
        sourceId: project.id
      });
    }

    // COULD: backlog/context candidates ordered by priority then due date.
    const backlogCandidates = this.state.tasks
      .filter(isActiveEntity)
      .filter((task) => {
        const status = String(getStampedValue(task, 'status', task.status || 'backlog')).toLowerCase();
        return ['backlog', 'waiting', 'blocked'].includes(status);
      })
      .sort((a, b) => {
        const priorityDiff = getNumericPriority(a) - getNumericPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        const aDue = getStampedValue(a, 'due', a.due || '9999-12-31') || '9999-12-31';
        const bDue = getStampedValue(b, 'due', b.due || '9999-12-31') || '9999-12-31';
        return aDue.localeCompare(bDue);
      })
      .slice(0, 8);

    for (const task of backlogCandidates) {
      const context = getStampedValue(task, 'context', task.context || 'work');
      pushSuggestion('could', {
        id: `sg_could_backlog_${task.id}`,
        title: getStampedValue(task, 'title', task.title || 'Backlog candidate'),
        type: 'task',
        meta: `${context} backlog · p${getNumericPriority(task)}`,
        sourceType: 'task',
        sourceId: task.id
      });
    }

    this.state.suggestions = next;
    return this.state.suggestions;
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
    // Envelope guard blocks non-object payloads before any merge can mutate trusted state.
    if (!payload || typeof payload !== 'object') {
      return fail('IMPORT_PAYLOAD_INVALID', 'Import failed: snapshot payload must be an object.');
    }

    const { schemaVersion, collections, deviceId } = payload;
    if (typeof schemaVersion !== 'number' || schemaVersion < 1 || schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
      return fail('IMPORT_SCHEMA_UNSUPPORTED', `Import failed: unsupported schemaVersion ${schemaVersion}.`, { schemaVersion });
    }

    if (!collections || typeof collections !== 'object') {
      return fail('IMPORT_COLLECTIONS_MISSING', 'Import failed: missing collections object.');
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
          return fail('IMPORT_SUGGESTIONS_INVALID', 'Import failed: suggestions must be an object containing must/should/could arrays.');
        }

        for (const bucket of ['must', 'should', 'could']) {
          if (!Array.isArray(importedSuggestions[bucket])) {
            return fail('IMPORT_SUGGESTIONS_BUCKET_INVALID', `Import failed: suggestions.${bucket} must be an array.`, { bucket });
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
        return fail('IMPORT_COLLECTION_INVALID', `Import failed: collection "${collection}" must be an array.`, { collection });
      }

      const mutableFields = MUTABLE_FIELDS_BY_COLLECTION[collection] || [];
      const merged = mergeCollectionById(localCollection, importedCollection, mutableFields);
      this.state[collection] = merged;
      mergeSummary[collection] = merged.length;
    }

    // Imported records may change plan obligations, so suggestions are recomputed from entity truth.
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

    const persistResult = await this.persist();
    if (!persistResult.ok) {
      return fail('IMPORT_PERSIST_FAILED', 'Import failed because data could not be persisted locally.');
    }
    this.emit();
    return ok({ merged: mergeSummary });
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
      const saved = await this.db.put(record);
      if (!saved) {
        throw new Error('IndexedDB write skipped because no active database connection is available.');
      }
      this.setPersistenceStatus({
        degraded: false,
        lastOperation: 'put',
        lastError: ''
      });
      // Transition: any successful write confirms local persistence is healthy again.
      this.state.storageStatus = 'ready';
      return { ok: true };
    } catch (error) {
      this.logPersistenceDiagnostic('put', error, { key: record.id });
      const failedMessage = 'Unable to save changes locally. Keep this tab open and export a backup once persistence recovers.';
      this.setPersistenceStatus({
        degraded: true,
        lastOperation: 'put',
        lastError: failedMessage
      });
      // Transition: write failure degrades storage because future mutations are at risk.
      this.state.storageStatus = 'degraded';
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
      deleted: false,
      deletedAt: '',
      snoozed: false
    };
    stampEntityMutableFields(item, MUTABLE_FIELDS_BY_COLLECTION.inbox, deviceId, now);
    const previousState = structuredClone(this.state);
    this.state.inbox.unshift(item);
    await this.commitStateMutation(previousState, 'capture');
  }

  async toggleArchiveInbox(id) {
    const item = this.state.inbox.find((entry) => entry.id === id && !isDeletedEntity(entry));
    if (!item) return;

    const nextArchived = !getStampedValue(item, 'archived', item.archived);
    updateStampedField(item, 'archived', nextArchived, getDeviceId());
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());
    await this.persist();
    this.emit();
  }

  async toggleSnoozeInbox(id) {
    const item = this.state.inbox.find((entry) => entry.id === id && !isDeletedEntity(entry));
    if (!item) return;

    // Snooze is a lightweight inbox state used to intentionally postpone processing.
    const nextSnoozed = !getStampedValue(item, 'snoozed', item.snoozed || false);
    updateStampedField(item, 'snoozed', nextSnoozed, getDeviceId());
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());
    await this.persist();
    this.emit();
  }


  /**
   * Creates a structured delete request so the UI can run a two-step confirmation flow.
   */
  requestDelete(collection, id, options = {}) {
    const allowedCollections = ['inbox', 'tasks', 'projects', 'people', 'meetings', 'reminders', 'notes', 'followUps', 'today'];
    if (!allowedCollections.includes(collection)) return null;

    const entity = this.state[collection]?.find((entry) => entry.id === id);
    if (!entity) return null;

    return {
      collection,
      id,
      hard: Boolean(options.hard),
      label: entity.title || entity.name || entity.raw || entity.id,
      typedPhrase: options.hard ? 'DELETE' : ''
    };
  }

  /**
   * Applies a confirmed delete request. Soft delete sets tombstone flags; hard delete removes the row.
   */
  async confirmDelete(request, typedPhrase = '') {
    if (!request?.collection || !request?.id) return false;

    const collection = this.state[request.collection];
    if (!Array.isArray(collection)) return false;

    const index = collection.findIndex((entry) => entry.id === request.id);
    if (index === -1) return false;

    if (request.hard) {
      if ((typedPhrase || '').trim().toUpperCase() !== 'DELETE') {
        throw new Error('Hard delete requires typing DELETE.');
      }
      collection.splice(index, 1);
    } else {
      const target = collection[index];
      const now = new Date().toISOString();
      const deviceId = getDeviceId();
      // Soft-delete is recoverable and keeps history fields intact.
      updateStampedField(target, 'deleted', true, deviceId, now);
      updateStampedField(target, 'deletedAt', now, deviceId, now);
      if ('archived' in target || request.collection === 'inbox') {
        updateStampedField(target, 'archived', true, deviceId, now);
      }
      if (request.collection === 'inbox') {
        updateStampedField(target, 'snoozed', false, deviceId, now);
      }
    }

    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

    await this.persist();
    this.emit();
    return true;
  }

  /**
   * Restores an entity from archive/deleted lifecycle states.
   */
  async restoreEntity(collection, id) {
    const target = this.state[collection]?.find((entry) => entry.id === id);
    if (!target) return;

    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    updateStampedField(target, 'deleted', false, deviceId, now);
    updateStampedField(target, 'deletedAt', '', deviceId, now);
    if ('archived' in target) {
      updateStampedField(target, 'archived', false, deviceId, now);
    }

    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

    await this.persist();
    this.emit();
  }


  /**
   * Toggles archive state for library entities while preserving tombstone metadata.
   */
  async toggleArchiveEntity(collection, id) {
    const target = this.state[collection]?.find((entry) => entry.id === id);
    if (!target) return;

    const now = new Date().toISOString();
    const nextArchived = !isArchivedEntity(target);
    updateStampedField(target, 'archived', nextArchived, getDeviceId(), now);
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

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
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

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
      source: provenance,
      archived: false,
      deleted: false,
      deletedAt: ''
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
      source: provenance,
      archived: false,
      deleted: false,
      deletedAt: ''
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

    // ID guard prevents writing conversions against malformed selectors from UI/query params.
    const idResult = validateId(inboxId, 'inboxId');
    if (!idResult.ok) return idResult;

    const inboxItem = this.state.inbox.find((entry) => entry.id === idResult.value && !isDeletedEntity(entry));
    if (!inboxItem) return fail('INBOX_ITEM_NOT_FOUND', 'Inbox item not found or already deleted.', { inboxId });

    const inboxRaw = getStampedValue(inboxItem, 'raw', inboxItem.raw) || '';
    const parsed = parseCaptureTokens(inboxRaw, { enableHeuristics: true });
    const now = new Date().toISOString();
    const nowValidation = validateIsoDateTime(now, 'processedAt');
    if (!nowValidation.ok) return nowValidation;

    // Date guards protect due/schedule indexes that assume ISO date-only values.
    const datesValidation = normalizeMutationDates(fields);
    if (!datesValidation.ok) return datesValidation;

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
      due: datesValidation.dueDate || parsed.dueDate || '',
      scheduled: datesValidation.scheduleDate || parsed.scheduleDate || '',
      source: provenance,
      linkedPeople: personEntities.map((person) => person.id),
      linkedProjects: projectEntity ? [projectEntity.id] : [],
      archived: false,
      deleted: false,
      deletedAt: ''
    };

    // Required title guard ensures converted entities remain renderable in list/detail views.
    const titleResult = normalizeRequiredText(baseRecord.title, 'title', titleFromRaw(inboxRaw));
    if (!titleResult.ok) return titleResult;
    baseRecord.title = titleResult.value;

    // Keep conversion logic explicit per entity type so contributors can safely extend it.
    let processedEntityId = '';
    if (resolvedType === 'task') {
      const nextTask = { ...baseRecord, status: 'backlog' };
      stampEntityMutableFields(nextTask, MUTABLE_FIELDS_BY_COLLECTION.tasks, deviceId, now);
      this.state.tasks.unshift(nextTask);
      processedEntityId = nextTask.id;
    } else if (resolvedType === 'meeting') {
      const nextMeeting = {
        ...baseRecord,
        meetingType: personEntities.length === 1 ? 'one_to_one' : 'group',
        agenda: '',
        notes: ''
      };
      stampEntityMutableFields(nextMeeting, MUTABLE_FIELDS_BY_COLLECTION.meetings, deviceId, now);
      this.state.meetings.unshift(nextMeeting);
      processedEntityId = nextMeeting.id;
    } else if (resolvedType === 'person') {
      const personName = fields.title || personEntities[0]?.name || titleFromRaw(inboxRaw);
      const personNameResult = normalizeRequiredText(personName, 'name');
      if (!personNameResult.ok) return personNameResult;
      processedEntityId = this.findOrCreatePerson(personNameResult.value, provenance).id;
    } else if (resolvedType === 'project') {
      const projectName = fields.title || projectEntity?.name || titleFromRaw(inboxRaw);
      const projectNameResult = normalizeRequiredText(projectName, 'name');
      if (!projectNameResult.ok) return projectNameResult;
      processedEntityId = this.findOrCreateProject(projectNameResult.value, provenance).id;
    } else if (resolvedType === 'followup') {
      // Recipient-shape guard keeps follow-up completion logic safe from malformed recipient rows.
      const recipientsValidation = normalizeFollowUpRecipients(personEntities.map((person) => ({ personId: person.id, status: 'pending' })));
      if (!recipientsValidation.ok) return recipientsValidation;
      const nextFollowUp = {
        ...baseRecord,
        source: 'inbox',
        sourceInboxId: inboxItem.id,
        recipients: recipientsValidation.value
      };
      stampEntityMutableFields(nextFollowUp, MUTABLE_FIELDS_BY_COLLECTION.followUps, deviceId, now);
      this.state.followUps.unshift(nextFollowUp);
      processedEntityId = nextFollowUp.id;
    } else if (resolvedType === 'reminder') {
      const nextReminder = { ...baseRecord, status: 'pending' };
      stampEntityMutableFields(nextReminder, MUTABLE_FIELDS_BY_COLLECTION.reminders, deviceId, now);
      this.state.reminders.unshift(nextReminder);
      processedEntityId = nextReminder.id;
    } else if (resolvedType === 'note') {
      const nextNote = { ...baseRecord, body: inboxRaw };
      stampEntityMutableFields(nextNote, MUTABLE_FIELDS_BY_COLLECTION.notes, deviceId, now);
      this.state.notes.unshift(nextNote);
      processedEntityId = nextNote.id;
    } else {
      const fallbackTask = { ...baseRecord, status: 'backlog' };
      stampEntityMutableFields(fallbackTask, MUTABLE_FIELDS_BY_COLLECTION.tasks, deviceId, now);
      this.state.tasks.unshift(fallbackTask);
      processedEntityId = fallbackTask.id;
    }

    // Keep source capture visible in Inbox after conversion so users can quickly verify/edit outcomes.
    updateStampedField(inboxItem, 'snoozed', false, deviceId, now);
    updateStampedField(inboxItem, 'processedType', resolvedType, deviceId, now);
    updateStampedField(inboxItem, 'processedEntityId', processedEntityId, deviceId, now);
    updateStampedField(inboxItem, 'processedAt', provenance.processedAt, deviceId, now);

    // Keep Plan dynamic immediately after inbox processing and conversion side effects.
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());

    await this.commitStateMutation(previousState, 'process');
    return ok();
  }

  /**
   * Updates editable meeting fields from the Library detail panel.
   *
   * Keeping this write path explicit makes it easier to add validation as the
   * meeting schema evolves.
   */
  async updateMeeting(meetingId, fields = {}) {
    this.ensureCollections();
    const previousState = structuredClone(this.state);

    const idResult = validateId(meetingId, 'meetingId');
    if (!idResult.ok) return idResult;

    const meeting = this.state.meetings.find((entry) => entry.id === idResult.value && !isDeletedEntity(entry));
    if (!meeting) return fail('MEETING_NOT_FOUND', 'Meeting not found or already deleted.', { meetingId });

    const titleResult = normalizeRequiredText(fields.title || meeting.title || '', 'title', meeting.title || 'Untitled meeting');
    if (!titleResult.ok) return titleResult;

    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    updateStampedField(meeting, 'title', titleResult.value, deviceId, now);
    updateStampedField(meeting, 'time', fields.time || '', deviceId, now);
    updateStampedField(meeting, 'meetingType', fields.meetingType || 'group', deviceId, now);
    updateStampedField(meeting, 'agenda', fields.agenda || '', deviceId, now);
    updateStampedField(meeting, 'notes', fields.notes || '', deviceId, now);

    await this.commitStateMutation(previousState, 'update_meeting');
    return ok();
  }

  async addToToday(bucket, suggestionId) {
    // ID guard keeps Today insertion deterministic and prevents accidental writes to ambiguous records.
    const suggestionIdResult = validateId(suggestionId, 'suggestionId');
    if (!suggestionIdResult.ok) return suggestionIdResult;

    const pool = [...this.state.suggestions.must, ...this.state.suggestions.should, ...this.state.suggestions.could];
    const suggestion = pool.find((entry) => entry.id === suggestionIdResult.value && !isDeletedEntity(entry) && !isArchivedEntity(entry));
    if (!suggestion) return fail('SUGGESTION_NOT_FOUND', 'Suggestion not found or unavailable for Today.', { suggestionId });

    // Prevent duplicate Today entries for the same suggestion while preserving existing order.
    const alreadyPresent = this.state.today.some((entry) => !isDeletedEntity(entry) && (entry.suggestionId || entry.id) === suggestionIdResult.value);
    if (alreadyPresent) return fail('TODAY_DUPLICATE_SUGGESTION', 'Suggestion is already in Today.', { suggestionId });

    const now = new Date().toISOString();
    const item = {
      ...suggestion,
      id: `today_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      suggestionId: suggestionIdResult.value,
      bucket,
      execution: createTodayExecutionState('not started'),
      status: 'not started',
      archived: false,
      deleted: false,
      deletedAt: ''
    };
    stampEntityMutableFields(item, MUTABLE_FIELDS_BY_COLLECTION.today, getDeviceId(), now);

    this.state.today.push(item);
    const persistResult = await this.persist();
    if (!persistResult.ok) {
      return fail('TODAY_ADD_PERSIST_FAILED', 'Unable to save Today item due to local storage issues.');
    }
    this.emit();
    return ok();
  }

  async reorderToday(id, direction) {
    // Moving an item swaps adjacent rows only; no re-sort means unchanged rows keep their relative order.
    const index = this.state.today.findIndex((entry) => entry.id === id && !isDeletedEntity(entry));
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

    const sourceEntry = this.state.suggestions[sourceBucket][sourceIndex];
    if (!sourceEntry || isDeletedEntity(sourceEntry)) return;

    const [entry] = this.state.suggestions[sourceBucket].splice(sourceIndex, 1);
    this.state.suggestions[nextBucket].unshift(entry);
    await this.persist();
    this.emit();
  }

  async setTodayStatus(id, status) {
    // Guard IDs and status enums so cross-view actions cannot persist malformed transition values.
    const idResult = validateId(id, 'todayId');
    if (!idResult.ok) return idResult;
    const statusResult = validateStatusEnum(status, STATUS_ENUMS.today, 'status');
    if (!statusResult.ok) return statusResult;

    const index = this.state.today.findIndex((entry) => entry.id === idResult.value && !isDeletedEntity(entry));
    if (index === -1) return fail('TODAY_ITEM_NOT_FOUND', 'Today item not found or deleted.', { id });

    // Side effect: keep legacy `status` while treating `execution.status` as source of truth for MVP persistence.
    const next = normalizeTodayExecution(this.state.today[index]);
    next.execution.status = statusResult.value;
    next.execution.updatedAt = new Date().toISOString();
    const timestampResult = validateIsoDateTime(next.execution.updatedAt, 'execution.updatedAt');
    if (!timestampResult.ok) return timestampResult;
    updateStampedField(next, 'execution', next.execution, getDeviceId(), next.execution.updatedAt);
    updateStampedField(next, 'status', statusResult.value, getDeviceId(), next.execution.updatedAt);
    updateStampedField(next, 'archived', statusResult.value === 'archived', getDeviceId(), next.execution.updatedAt);
    this.state.today[index] = next;

    // Persistence expectation: save status changes immediately so execute progress survives refreshes.
    const persistResult = await this.persist();
    if (!persistResult.ok) {
      return fail('TODAY_STATUS_PERSIST_FAILED', 'Unable to save Today status due to local storage issues.');
    }
    this.emit();
    return ok();
  }

  async deferTodayItem(id) {
    // Defer marks the item as intentionally postponed but keeps it in Today for visibility.
    return this.setTodayStatus(id, 'deferred');
  }

  async archiveTodayItem(id) {
    // Archive marks the item as parked; item remains in Today for MVP history and can still show notes.
    return this.setTodayStatus(id, 'archived');
  }

  async addTodayUpdateNote(id, noteText) {
    const previousState = structuredClone(this.state);

    // ID guard ensures note updates only target a stable Today entity key.
    const idResult = validateId(id, 'todayId');
    if (!idResult.ok) return idResult;

    const note = (noteText || '').trim();
    // Empty notes are rejected to preserve close-day auditability requirements.
    if (!note) return fail('TODAY_NOTE_REQUIRED', 'Update note cannot be empty.', { id });

    const index = this.state.today.findIndex((entry) => entry.id === idResult.value && !isDeletedEntity(entry));
    if (index === -1) return fail('TODAY_ITEM_NOT_FOUND', 'Today item not found or deleted.', { id });

    // Note side effect: append immutable timestamped updates directly onto the Today item execution state.
    const next = normalizeTodayExecution(this.state.today[index]);
    const createdAt = new Date().toISOString();
    const createdAtResult = validateIsoDateTime(createdAt, 'note.createdAt');
    if (!createdAtResult.ok) return createdAtResult;

    next.execution.notes.push({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: note,
      createdAt: createdAtResult.value
    });
    next.execution.updatedAt = new Date().toISOString();
    updateStampedField(next, 'execution', next.execution, getDeviceId(), next.execution.updatedAt);
    this.state.today[index] = next;

    // Persistence expectation: notes are workflow evidence and must be saved with each write.
    await this.commitStateMutation(previousState, 'update note');
    return ok();
  }

  getIncompleteTodayItems() {
    // Close-mode guard: an item is incomplete unless it is explicitly marked `complete`.
    // We intentionally treat deferred/blocked/waiting/cancelled as incomplete so closure history captures unfinished intent.
    return this.state.today
      .filter((item) => !isDeletedEntity(item))
      .map(normalizeTodayExecution)
      .filter((item) => !isTodayItemComplete(item));
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
      if (isDeletedEntity(item)) return false;
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
    const planned = this.state.today.filter((item) => !isDeletedEntity(item)).map(normalizeTodayExecution);
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
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());
    await this.persist();
    this.emit();
  }

  /**
   * Replaces current data with the opt-in demo fixture set.
   */
  async loadSampleData() {
    this.state = applyStateGuards(createDemoSeedData());
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());
    await this.persist();
    this.emit();
  }

  /**
   * Hard-resets all local application data to the production-safe defaults.
   */
  async resetAllLocalData() {
    this.state = applyStateGuards(createEmptyState());
    this.rebuildSuggestionsForDate(getCurrentLocalIsoDate());
    await this.persist();
    this.emit();
  }

  async closeDay() {
    if (this.state.storageStatus === 'degraded') {
      return {
        ok: false,
        reason: 'storage_degraded',
        message: 'Close day is blocked while persistence is degraded. Retry storage initialization first to avoid data loss.'
      };
    }

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
