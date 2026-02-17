# Contributing

This repo is primarily a personal productivity app, but contributions are welcome if they align with the product intent: low friction, predictable resurfacing, and minimal maintenance.

## Ground rules

- Prefer simple, boring solutions over clever ones.
- Preserve data integrity above all else.
- Avoid adding configuration sprawl.
- Default to archive; delete must be hard and deliberate.

## Project setup

Because this is a static app (GitHub Pages), you can run it locally with any simple static server.

Example options:
- VS Code Live Server extension
- `python -m http.server` (from repo root)
- any equivalent local server

Important:
- IndexedDB does not behave reliably when opening files via `file://`.
- Always use `http://localhost`.

## Branching and PRs

- Use small PRs that do one thing.
- Include screenshots for UI changes.
- For changes that touch data, include a migration plan.

## Commit style

- Prefer meaningful messages:
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
  - `docs: ...`
  - `chore: ...`

## What to include in a PR

- What changed and why
- Any UI impact (screenshots)
- Any data model changes
- Any edge cases considered
- Any follow-up tasks / known limitations

## Data safety expectations

If you touch:
- merge logic
- timestamps
- import/export
- delete/archive
- schema migrations

…you must include:
- test steps
- at least one manual “conflict merge” scenario described in the PR

## Reporting issues

If you open an issue, include:
- steps to reproduce
- expected vs actual
- browser + OS
- export JSON (redact personal info) if relevant

## Code style

- Prefer modules (`/src/*.js`) with small focused files.
- Avoid frameworks unless there is a strong reason.
- Keep UI components accessible (labels, focus states, keyboard nav).

Thanks!
