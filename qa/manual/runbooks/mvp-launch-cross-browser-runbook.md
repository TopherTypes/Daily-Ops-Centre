# MVP Launch Cross-Browser Manual QA Runbook

## Objective
Run a repeatable launch gate against the live MVP candidate and verify:
1. Capture creation and inbox processing,
2. Plan assignment/reordering,
3. Execute status transitions + note saves,
4. Close blockers + log generation + day-close reset,
5. Export/import round-trip with schema validation.

## Scope and target browsers
- Chrome (latest stable) — executed via Playwright Chromium.
- Firefox (latest stable) — executed via Playwright Firefox.
- Safari (latest stable equivalent) — executed via Playwright WebKit.

## Environment setup
1. From repo root, start static app server:
   - `python -m http.server 4173`
2. Open `http://127.0.0.1:4173`.
3. In **Close**, click **Reset all local data** and accept prompts.

## Test data
- Capture payload: `Launch QA task do:<today> !p1`
- Round-trip payload: `Roundtrip seed`

## Procedure (repeat per browser)
1. **Capture/inbox**
   - Navigate to Capture.
   - Add `Launch QA task do:<today> !p1`.
   - Click **Process** and convert to **Task**.
   - Expected: capture entry is processable and converted.
2. **Plan**
   - Navigate to Plan.
   - Verify at least one suggestion has **Add to Today**.
   - Add one item to Today.
   - If 2+ Today items exist, reorder using ↑/↓ and verify order changes.
3. **Execute**
   - Navigate to Execute.
   - Verify at least one execution row exists.
   - Set status to **Blocked**.
   - Add update note and save.
   - Expected: status and note metadata update.
4. **Close**
   - Navigate to Close.
   - Save required closure notes (if prompted).
   - Click **Generate snapshot**.
   - Click **Close day now**.
   - Navigate back to Plan.
   - Expected: Today list reset for next day.
5. **Export/import**
   - Navigate to Capture and add `Roundtrip seed`.
   - Click **Export** and save snapshot.
   - Validate exported JSON contains `schemaVersion`, `exportedAt`, `deviceId`.
   - Click **Import**, select the same file, and accept destructive confirmation.
   - Expected: import success banner and no validation errors.

## Evidence and defect logging requirements
- Save one screenshot per browser run.
- Save one exported snapshot per browser.
- Record per-area Pass/Fail.
- For each defect, log:
  - defect ID,
  - exact repro steps,
  - severity (P0/P1/P2),
  - launch impact.

## Launch gate rule
- Launch remains **BLOCKED** until every browser matrix row is `Pass` and no open `P0/P1` defects remain.
