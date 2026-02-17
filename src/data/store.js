import { DbClient } from './db.js';

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
    ]
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
    } catch {
      // Ignore initialization failures and stay on in-memory data.
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return structuredClone(this.state);
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

  async addToToday(bucket, suggestionId) {
    const pool = [...this.state.suggestions.must, ...this.state.suggestions.should, ...this.state.suggestions.could];
    const suggestion = pool.find((entry) => entry.id === suggestionId);
    if (!suggestion) return;
    this.state.today.push({ ...suggestion, bucket, status: 'not started' });
    await this.persist();
    this.emit();
  }

  async reorderToday(id, direction) {
    const index = this.state.today.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.state.today.length) return;
    [this.state.today[index], this.state.today[target]] = [this.state.today[target], this.state.today[index]];
    await this.persist();
    this.emit();
  }

  emit() {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }
}
