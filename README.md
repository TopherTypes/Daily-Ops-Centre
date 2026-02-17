# Daily Ops Centre

A single-page productivity web app designed to offload working memory with a simple daily loop:

**Capture → Plan → Execute → Close**

Built for GitHub Pages (no backend). Data is stored locally and can be exported/imported. A future milestone adds Google Drive sync with field-by-field merge (each field tracks its own last-updated timestamp).

## Core principles

- **Low friction capture:** one input, hit Enter, it’s safe.
- **Daily plan resets:** every day starts blank, but the database persists.
- **Trustworthy resurfacing:** commitments reappear at the right time (deadlines, scheduled items, meetings, reminders, pending updates).
- **End-of-day integrity:** Close forces updates on anything unfinished so nothing silently rots.
- **Default to archive:** delete exists, but is intentionally hard.

## Modes

### 1) Capture (Inbox)
- One text input to capture: tasks, notes, projects, meetings, contacts, reminders, follow-ups.
- Lightweight parsing:
  - `@Person` links/creates a person
  - `#Project` links/creates a project
  - `!p1..p5` priority
  - `due:YYYY-MM-DD` and `do:YYYY-MM-DD` (schedule date)
  - `work:` / `personal:`
  - `type:task|meeting|note|reminder|followup|project|person`
- Inbox items can be processed into real entities. Processing replaces the inbox item.

### 2) Plan (daily, ~08:00)
- Daily plan starts empty.
- Suggestions are surfaced as:
  - **Must:** meetings today, scheduled today, due today, reminders due today, pending updates
  - **Should:** high priority, upcoming deadlines, stale projects, etc.
  - **Could:** backlog candidates filtered by context/priority
- Assign items into Today as Must/Should/Could and order them.

### 3) Execute
- Today list grouped by type (Tasks / Meetings / Reminders / Updates).
- Fast status changes: complete, in progress, waiting, blocked, cancelled, defer, archive.
- Add update notes anytime.
- Passive banners for gentle nagging (no notifications).

### 4) Close
- Process remaining inbox items.
- Any incomplete Today items require a free-text update note (minimum), with optional structured info.
- Generate a **Daily Log**: planned vs achieved, completed, incomplete + last update.
- Wipe the daily plan for the next day (items remain in database).

## Entities (high-level)

- InboxItem
- Task (supports schedule date, deadline date, priority, context, dependencies)
- Reminder (first-class; can be promoted to Task)
- Meeting (agenda, attendees, notes, linked projects, actions)
- Person (contact info, relationship, important dates, interactions, cadences)
- Project (status, next task, last updated, milestones, people)
- Habit (tracked daily; surfaced in Plan/Execute)
- DailyPlan
- DailyLog
- FollowUpGroup (a “pending update”) with per-person completion tracking

## Follow-ups (pending updates)

A follow-up can be created from:
- a meeting, OR
- directly from Inbox capture/processing.

A follow-up can include multiple people and tracks completion **per person**.
- Status per recipient: `pending` or `complete`
- No due dates
- No channels

Follow-ups surface in:
- Meeting view (where created)
- Person view (“Pending updates”)
- 1:1 meeting view for that person (if meetingType = one_to_one)

## Data, backup, and sync

### Local storage
- Uses IndexedDB via a small wrapper.
- Each record uses **field-level stamps**: every field stores `{ value, updatedAt, updatedByDeviceId }` to support per-field conflict resolution.

### Export / Import (manual backup + restore)
- Export is always available from the top bar and downloads a single JSON snapshot file.
- Snapshot payload includes `schemaVersion`, `exportedAt`, `deviceId`, and all app collections.
- Import is always available from the same top-bar controls.
- Import requires a destructive-action confirmation before it runs.
- Import validates snapshot structure before merging.
- Merge strategy is intentionally minimal for the MVP: records are merged by `id`, matching IDs are replaced by imported versions, and local-only IDs are preserved.

#### Manual backup flow
1. Click **Export** in the top bar.
2. Keep the downloaded JSON file in your preferred backup location (cloud drive, encrypted vault, etc.).
3. Repeat exports regularly (for example, end-of-day or end-of-week).

#### Manual restore flow
1. Click **Import** in the top bar.
2. Select a previously exported `.json` snapshot.
3. Confirm the destructive-action warning.
4. Review the in-app success/error status message shown in the top bar.

### Future: Google Drive sync
Planned design:
- A single JSON blob in Drive (or chunked files later).
- Merge is performed per field: newest `updatedAt` wins, never deleting unless explicitly newer.

## Keyboard shortcuts (initial plan)

- `C` Capture
- `P` Plan
- `E` Execute
- `L` Close
- `Ctrl+Enter` save/submit capture
- `M / S / K` set Must / Should / Could (K = could, to avoid collision with Capture)
- Arrow keys to navigate lists

## Development

- No build step.
- Static hosting on GitHub Pages.

See:
- `SPECS.md` for detailed behavior and data model
- `CONTRIBUTING.md` for local dev notes and contribution rules
