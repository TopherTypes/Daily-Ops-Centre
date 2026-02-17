# MVP Launch Checklist (Active Release Tracker)

Use this checklist as the **single source of truth** for launch readiness meetings and release go/no-go decisions. Update it live during readiness reviews.

## Tracker usage rules

- Each row must include a **named owner**, **status** (`Pass`, `Fail`, or `Blocked`), and **latest verification date**.
- Any row marked `Pass` must include an **evidence reference** (manual test log, screenshot, export/import snapshot, or defect report).
- Do not mark release ready until all launch-scope rows are `Pass` and release signoff is completed.

## Evidence artifact index

| Evidence ID | Artifact type | Link / reference | Notes |
| --- | --- | --- | --- |
| E-001 | Manual test log | `qa/manual/core-loop/2026-02-17-core-loop.md` | Capture → Close scenario on Chrome.
| E-002 | Manual test log | `qa/manual/export-import/2026-02-17-export-import.md` | Export/import validation and destructive confirmation checks.
| E-003 | Screenshot set | `qa/evidence/accessibility/keyboard-modal-focus-2026-02-17/` | Keyboard path and modal focus screenshots.
| E-004 | Sample data snapshot | `qa/evidence/persistence/export-import-snapshots/sample-export-2026-02-17.json` | Verified `schemaVersion`, `exportedAt`, `deviceId`, and collection payloads.
| E-005 | Defect report query | `tracker://launch-scope?severity=P0,P1&status=open` | Launch-scope defect filter for open P0/P1 gate.
| E-006 | Browser matrix log | `qa/manual/browser-matrix/2026-02-17-mvp-matrix.md` | Chrome/Firefox/Safari run records.
| E-007 | Launch QA runbook | `qa/manual/runbooks/mvp-launch-cross-browser-runbook.md` | Repeatable manual QA launch script covering Capture→Close and export/import validation.
| E-008 | Cross-browser launch execution log | `qa/manual/browser-matrix/2026-02-17-mvp-launch-execution.md` | Executed against Chromium/Firefox/WebKit with per-area Pass/Fail and defect reproduction steps.
| E-009 | Accessibility validation log | `qa/manual/accessibility/2026-02-17-focused-validation.md` | Keyboard walkthrough, modal focus-trap checks, accessible-name audit, and defect closure evidence. |

## Data safety

| Item | Pass criteria | Owner | Status | Latest verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| Export snapshot validity | Export produces a JSON file containing `schemaVersion`, `exportedAt`, `deviceId`, and all core collections; import of the same file completes without validation errors. | Priya Sharma | Pass | 2026-02-17 | E-002, E-004 |
| Import safety guard | Import always shows destructive-action confirmation before merge; cancel path makes no state changes. | Daniel Kim | Pass | 2026-02-17 | E-002 |
| Close-day log integrity | Running Close generates a Daily Log that includes planned vs achieved, completed, and incomplete items with last update text. | Aisha Patel | Pass | 2026-02-17 | E-001 |
| Archive/delete safeguards | Archive is available as default lifecycle action; hard delete requires explicit confirm dialog plus typed `DELETE`; deleted items are recoverable from Library → Deleted until hard delete. | Elena Rossi | Blocked | 2026-02-17 | Pending rerun after delete-flow fix (DEF-214) |
| Degraded persistence fallback | When IndexedDB write/read fails, degraded mode banner appears and write workflows avoid silent data loss (revert failed optimistic writes). | Marcus Lee | Pass | 2026-02-17 | E-006 |

## Workflow completeness (Capture → Plan → Execute → Close)

| Item | Pass criteria | Owner | Status | Latest verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| Capture flow | New input can be captured and stored; inbox item can be processed into an entity and is removed/replaced in inbox. | Sofia Nguyen | Pass | 2026-02-17 | E-001 |
| Plan flow | Daily plan starts empty for new day; suggestion buckets (Must/Should/Could) populate and user can assign/reorder Today items. | Sofia Nguyen | Pass | 2026-02-17 | E-001 |
| Execute flow | Today items support status transitions (complete/in progress/waiting/blocked/cancelled/defer/archive) and update-note entry. | Sofia Nguyen | Pass | 2026-02-17 | E-001 |
| Close flow | Close requires update notes for incomplete Today items, processes remaining inbox items, creates Daily Log, and resets daily plan for next day. | Sofia Nguyen | Pass | 2026-02-17 | E-001 |
| End-to-end regression | One scenario can run from Capture through Close without data corruption or blocked transitions. | Ravi Menon | Pass | 2026-02-17 | E-001 |

## Accessibility

| Item | Pass criteria | Owner | Status | Latest verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| Keyboard paths | Capture, Plan, Execute, Close primary actions are reachable by keyboard only (including shortcut navigation and Enter/Space activation). | Maya Johnson | Pass | 2026-02-17 | E-009 |
| Modal focus management | Opening modal traps focus inside; Esc/close returns focus to invoking control; no keyboard focus loss. | Daniel Kim | Pass | 2026-02-17 | E-009 |
| Labels and names | Form fields, icon-only buttons, and interactive controls have clear accessible names/labels announced by screen reader. | Daniel Kim | Pass | 2026-02-17 | E-009 |
| Focus visibility | All interactive controls have visible focus state in default theme. | Olivia Chen | Pass | 2026-02-17 | E-009 |

## Browser sanity matrix

Target browsers for MVP signoff:
- Chrome (current stable)
- Firefox (current stable)
- Safari (latest stable on macOS)

| Area | Browser | Owner | Status | Latest verification | Evidence |
| --- | --- | --- | --- | --- | --- |
| Core loop (Capture/Plan/Execute/Close) | Chrome | Ravi Menon | Fail | 2026-02-17 | E-008 (DEF-CHR-PLAN-001) |
| Core loop (Capture/Plan/Execute/Close) | Firefox | Ravi Menon | Fail | 2026-02-17 | E-008 (DEF-EXEC-001) |
| Core loop (Capture/Plan/Execute/Close) | Safari | Ravi Menon | Fail | 2026-02-17 | E-008 (DEF-EXEC-001) |
| Export/Import | Chrome | Priya Sharma | Pass | 2026-02-17 | E-008 |
| Export/Import | Firefox | Priya Sharma | Pass | 2026-02-17 | E-008 |
| Export/Import | Safari | Priya Sharma | Pass | 2026-02-17 | E-008 |
| Keyboard + modal interactions | Chrome | Maya Johnson | Pass | 2026-02-17 | E-003, E-006 |
| Keyboard + modal interactions | Firefox | Maya Johnson | Pass | 2026-02-17 | E-003, E-006 |
| Keyboard + modal interactions | Safari | Maya Johnson | Pass | 2026-02-17 | E-003, E-006 |
| IndexedDB persistence reload check | Chrome | Marcus Lee | Pass | 2026-02-17 | E-006 |
| IndexedDB persistence reload check | Firefox | Marcus Lee | Pass | 2026-02-17 | E-006 |
| IndexedDB persistence reload check | Safari | Marcus Lee | Pass | 2026-02-17 | E-006 |

## Final release signoff

| Signoff field | Value |
| --- | --- |
| Signoff date/time (UTC) | 2026-02-17 20:10 UTC |
| Approvers | Priya Sharma (Engineering), Ravi Menon (QA), Maya Johnson (Accessibility), Elena Rossi (Product) |
| P0/P1 launch-scope defect declaration | **Not cleared:** Open P1 defects remain (`DEF-CHR-PLAN-001`, `DEF-EXEC-001`) per E-008. |
| Launch decision | **BLOCKED** — release cannot proceed until all browser matrix launch rows are `Pass` and no P0/P1 defects remain open. |

## Release signoff rule

MVP is launch-ready only when all checklist rows are marked **Pass** with named owners, evidence links, and no open P0/P1 defects in launch scope.
