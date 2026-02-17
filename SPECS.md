# Specs

## Product intent

A single-space hold-all that:
1) captures anything instantly (Inbox),
2) helps build a daily plan from a blank slate (Plan),
3) supports execution with minimal friction (Execute),
4) enforces end-of-day integrity and logging (Close).

Success criteria:
- Never lose a commitment.
- Always have a plan.
- Everything is maintained/contained with low ongoing maintenance.

## Modes

### Capture (Inbox)
- Single capture input.
- Each capture produces an InboxItem:
  - rawText
  - createdAt
  - parsed suggestions (optional)
  - status: captured | archived | deleted

Processing:
- InboxItem can be converted into:
  - Task, Reminder, Meeting, Person, Project, FollowUpGroup, Note
- Processing replaces the InboxItem (but may store provenance via a source link).

Parsing rules (v1):
- Explicit tokens:
  - `@Person` (link or create)
  - `#Project` (link or create)
  - `!p1..p5` priority
  - `due:YYYY-MM-DD` deadline date
  - `do:YYYY-MM-DD` schedule date
  - `work:` / `personal:`
  - `type:task|meeting|note|reminder|followup|project|person`
- Heuristics:
  - meeting keywords imply Meeting suggestion
  - simple date words (“today”, “tomorrow”) map to schedule date

### Plan
DailyPlan:
- The plan for a date starts empty by default.
- Plan provides Suggestions:
  MUST:
  - meetings today
  - items scheduled today
  - items due today
  - reminders due today
  - pending follow-up recipients (count + pick list)
  SHOULD:
  - high priority tasks
  - upcoming deadlines
  - stale projects
  COULD:
  - backlog candidates by context

Plan actions:
- assign suggestion into Today as Must/Should/Could
- order items (sequence) and retain meeting times

### Execute
Today view:
- grouped by type: Tasks / Meetings / Reminders / Updates (follow-ups) / Habits (optional v1)
- persistent quick capture input

Task statuses:
- backlog | today | in_progress | waiting | blocked | done | cancelled | archived

Actions:
- complete
- set in progress / waiting / blocked / cancelled
- defer (to backlog or tomorrow)
- archive
- add update note (timestamped)

Nagging:
- passive banners only (no push notifications)

### Close
Close checklist:
1) process inbox (or explicitly snooze items)
2) require update note for any incomplete Today items
3) generate DailyLog:
   - planned snapshot vs achieved
   - completed list
   - incomplete list with last update note
4) wipe DailyPlan for the day (items persist elsewhere)

Update requirement:
- free text note is mandatory minimum
- optional structured fields may be added later (reschedule date, reason, next action)

## Follow-ups (pending updates)

Goal: track “I need to update these people about this thing” with per-person completion.

FollowUpGroup:
- id
- title (required)
- details (optional)
- sourceType/sourceId (optional; may be meeting or inbox origin)
- recipients[] (FollowUpRecipient)
- createdAt

FollowUpRecipient:
- personId
- status: pending | complete
- completedAt (timestamp)
- completedNote (optional)

Surfacing:
- Meeting view shows follow-ups created there.
- Person view shows all pending follow-ups where they are a recipient.
- 1:1 meeting view shows pending follow-ups for the primary person across all sources.

## Data model & merge strategy (field-by-field)

All primary entities must support:
- stable id
- createdAt
- fields stored as:
  fieldName: { value, updatedAt, updatedByDeviceId }

Merge rule:
- for each entity:
  - for each field:
    - choose the field value with the most recent updatedAt
- Never delete data on merge unless the incoming field is newer and explicitly sets archived/deleted flags.

Entities (v1):
- InboxItem
- Task
- Reminder
- Meeting
- Person
- Project
- Habit
- DailyPlan
- DailyLog
- FollowUpGroup

Storage:
- IndexedDB preferred.

Backup:
- Export JSON of full dataset.
- Import merges by entity id and per-field merge rules.

## Non-goals (v1)
- calendar integration
- real-time collaboration
- push notifications
- complex rule engines
