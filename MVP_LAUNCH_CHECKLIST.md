# MVP Launch Checklist

Use this checklist as the **single source of truth** for launch readiness. Every item must have a named owner and pass before release signoff.

## Data safety

| Item | Pass criteria | Owner |
| --- | --- | --- |
| Export snapshot validity | Export produces a JSON file containing `schemaVersion`, `exportedAt`, `deviceId`, and all core collections; import of the same file completes without validation errors. | Data/Persistence engineer |
| Import safety guard | Import always shows destructive-action confirmation before merge; cancel path makes no state changes. | Front-end engineer |
| Close-day log integrity | Running Close generates a Daily Log that includes planned vs achieved, completed, and incomplete items with last update text. | Workflow product owner |
| Archive/delete safeguards | Archive is available as default lifecycle action; hard delete requires explicit confirm dialog plus typed `DELETE`; deleted items are recoverable from Library → Deleted until hard delete. | Front-end engineer |
| Degraded persistence fallback | When IndexedDB write/read fails, degraded mode banner appears and write workflows avoid silent data loss (revert failed optimistic writes). | Reliability owner |

## Workflow completeness (Capture → Plan → Execute → Close)

| Item | Pass criteria | Owner |
| --- | --- | --- |
| Capture flow | New input can be captured and stored; inbox item can be processed into an entity and is removed/replaced in inbox. | Product engineer |
| Plan flow | Daily plan starts empty for new day; suggestion buckets (Must/Should/Could) populate and user can assign/reorder Today items. | Product engineer |
| Execute flow | Today items support status transitions (complete/in progress/waiting/blocked/cancelled/defer/archive) and update-note entry. | Product engineer |
| Close flow | Close requires update notes for incomplete Today items, processes remaining inbox items, creates Daily Log, and resets daily plan for next day. | Product engineer |
| End-to-end regression | One scenario can run from Capture through Close without data corruption or blocked transitions. | QA owner |

## Accessibility

| Item | Pass criteria | Owner |
| --- | --- | --- |
| Keyboard paths | Capture, Plan, Execute, Close primary actions are reachable by keyboard only (including shortcut navigation and Enter/Space activation). | Accessibility champion |
| Modal focus management | Opening modal traps focus inside; Esc/close returns focus to invoking control; no keyboard focus loss. | Front-end engineer |
| Labels and names | Form fields, icon-only buttons, and interactive controls have clear accessible names/labels announced by screen reader. | Front-end engineer |
| Focus visibility | All interactive controls have visible focus state in default theme. | Design systems owner |

## Browser sanity matrix

Target browsers for MVP signoff:
- Chrome (current stable)
- Firefox (current stable)
- Safari (latest stable on macOS)

| Area | Chrome | Firefox | Safari | Owner |
| --- | --- | --- | --- | --- |
| Core loop (Capture/Plan/Execute/Close) | Pass | Pass | Pass | QA owner |
| Export/Import | Pass | Pass | Pass | QA owner |
| Keyboard + modal interactions | Pass | Pass | Pass | Accessibility champion |
| IndexedDB persistence reload check | Pass | Pass | Pass | Reliability owner |

## Release signoff rule

MVP is launch-ready only when all checklist rows are marked **Pass** with named owners and no open P0/P1 defects in launch scope.
