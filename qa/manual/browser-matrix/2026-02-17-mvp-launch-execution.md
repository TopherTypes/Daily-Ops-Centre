# MVP Launch Browser Matrix Execution — 2026-02-17

Runbook used: `qa/manual/runbooks/mvp-launch-cross-browser-runbook.md`.

## Browser results matrix

| Browser | Capture/inbox | Plan assign/reorder | Execute status + notes | Close blockers/log/reset | Export/import round-trip | Overall |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome (Chromium) | Fail | Fail | Fail | Fail | Pass | **Fail** |
| Firefox | Pass | Pass | Fail | Pass | Pass | **Fail** |
| Safari (WebKit) | Pass | Pass | Fail | Pass | Pass | **Fail** |

## Defects

### DEF-CHR-PLAN-001
- **Severity:** P1
- **Launch impact:** Blocks Plan/Execute/Close validation path in Chrome; launch gate remains blocked.
- **Browsers affected:** Chrome (Chromium)
- **Repro steps:**
  1. Open app and reset local data.
  2. Capture `Launch QA task do:<today> !p1`.
  3. Process the inbox item as Task.
  4. Open Plan.
  5. Observe suggestion buckets are not populated and no usable Add-to-Today flow is available.

### DEF-EXEC-001
- **Severity:** P1
- **Launch impact:** Execute coverage incomplete (no executable Today rows), prevents required status-transition + note-save validation; launch gate remains blocked.
- **Browsers affected:** Firefox, Safari (WebKit)
- **Repro steps:**
  1. Open app and reset local data.
  2. Capture `Launch QA task do:<today> !p1`.
  3. Process item as Task and move to Plan.
  4. Add available task to Today.
  5. Open Execute.
  6. Observe no executable Today row available for status transition/note-save check.

## Artifacts

| Browser | Result JSON | Screenshot | Exported snapshot |
| --- | --- | --- | --- |
| Chrome (Chromium) | `browser:/tmp/codex_browser_invocations/7ace01af9432b300/artifacts/qa/evidence/launch-qa/2026-02-17/chromium-result.json` | `browser:/tmp/codex_browser_invocations/7ace01af9432b300/artifacts/qa/evidence/launch-qa/2026-02-17/chromium-run.png` | `browser:/tmp/codex_browser_invocations/7ace01af9432b300/artifacts/qa/evidence/launch-qa/2026-02-17/chromium-export.json` |
| Firefox | `browser:/tmp/codex_browser_invocations/31a514bd0ef72c91/artifacts/qa/evidence/launch-qa/2026-02-17/firefox-result.json` | `browser:/tmp/codex_browser_invocations/31a514bd0ef72c91/artifacts/qa/evidence/launch-qa/2026-02-17/firefox-run.png` | `browser:/tmp/codex_browser_invocations/31a514bd0ef72c91/artifacts/qa/evidence/launch-qa/2026-02-17/firefox-export.json` |
| Safari (WebKit) | `browser:/tmp/codex_browser_invocations/0a79a75f303f86ad/artifacts/qa/evidence/launch-qa/2026-02-17/webkit-result.json` | `browser:/tmp/codex_browser_invocations/0a79a75f303f86ad/artifacts/qa/evidence/launch-qa/2026-02-17/webkit-run.png` | `browser:/tmp/codex_browser_invocations/0a79a75f303f86ad/artifacts/qa/evidence/launch-qa/2026-02-17/webkit-export.json` |

## Launch gate decision
- **Decision:** **BLOCKED**.
- **Reason:** Required matrix rows are not all Pass and open P1 defects remain (`DEF-CHR-PLAN-001`, `DEF-EXEC-001`).
