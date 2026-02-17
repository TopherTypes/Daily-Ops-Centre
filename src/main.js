import { getDeviceId } from './data/device.js';
import { AppStore } from './data/store.js';
import { getRoute, onRouteChange, goTo } from './router.js';
import { renderCapture } from './views/captureView.js';
import { renderPlan } from './views/planView.js';
import { renderExecute } from './views/executeView.js';
import { renderClose } from './views/closeView.js';
import { renderLibrary } from './views/libraryView.js';

const app = document.querySelector('#app');
const store = new AppStore();

const uiState = {
  route: '/capture',
  captureTab: 'unprocessed',
  processingInboxId: null,
  executeNoteItemId: null,
  backupNotice: null,
  startupRolloverNotice: null,
  persistenceNotice: null
};

// Tracks dialog-specific accessibility state across route transitions/rerenders.
const modalState = {
  isOpen: false,
  lastNonLibraryRoute: '/capture',
  previouslyFocusedElement: null,
  previouslyFocusedSelector: null
};

function isLibraryRoute(route) {
  return route.startsWith('/library');
}

function closeLibraryModal() {
  goTo(modalState.lastNonLibraryRoute || '/capture');
}

function getRestoreSelector(element) {
  if (!(element instanceof HTMLElement)) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;

  const href = element.getAttribute('href');
  if (href) return `${element.tagName.toLowerCase()}[href="${href}"]`;

  const name = element.getAttribute('name');
  if (name) return `${element.tagName.toLowerCase()}[name="${name}"]`;

  const testId = element.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  return null;
}

function getLibraryFocusableElements() {
  const panel = document.querySelector('[data-library-modal-panel]');
  if (!panel) return [];

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return [...panel.querySelectorAll(focusableSelector)]
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function focusLibraryModalEntryPoint() {
  const panel = document.querySelector('[data-library-modal-panel]');
  if (!panel) return;

  const [firstFocusable] = getLibraryFocusableElements();
  if (firstFocusable instanceof HTMLElement) {
    firstFocusable.focus();
    return;
  }

  panel.focus();
}

function syncLibraryModalAccessibility(route) {
  const libraryOpen = isLibraryRoute(route);

  if (libraryOpen && !modalState.isOpen) {
    modalState.isOpen = true;
    focusLibraryModalEntryPoint();
    return;
  }

  if (!libraryOpen && modalState.isOpen) {
    modalState.isOpen = false;
    const focusTarget = modalState.previouslyFocusedElement;
    const fallbackSelector = modalState.previouslyFocusedSelector;
    modalState.previouslyFocusedElement = null;
    modalState.previouslyFocusedSelector = null;

    // Restore users to the invoking context after the modal fully closes.
    if (focusTarget instanceof HTMLElement && focusTarget.isConnected) {
      focusTarget.focus();
      return;
    }

    if (fallbackSelector) {
      document.querySelector(fallbackSelector)?.focus();
    }
  }
}

function setBackupNotice(type, message) {
  // Global import/export notifications are displayed in the top bar so they are visible in every mode.
  uiState.backupNotice = { type, message };
  store.emit();
}

function syncPersistenceNotice() {
  const persistence = store.getPersistenceStatus();
  if (!persistence.degraded) {
    uiState.persistenceNotice = null;
    return;
  }

  // Degraded mode warning is intentionally lightweight so users can keep working while aware of local-save risk.
  uiState.persistenceNotice = {
    type: 'warn',
    message: persistence.lastError || 'Persistence degraded: local saves may fail until storage access recovers.'
  };
}

async function performStoreOperation(operationName, operation) {
  try {
    await operation();
    syncPersistenceNotice();
    return true;
  } catch (error) {
    syncPersistenceNotice();
    setBackupNotice('error', `${operationName} failed: ${error?.message || 'unknown error'}`);
    return false;
  }
}

function triggerSnapshotDownload(snapshot) {
  // Browser-native download flow: Blob + object URL + temporary anchor element.
  const exportedAtCompact = snapshot.exportedAt.replace(/[:.]/g, '-');
  const fileName = `daily-ops-snapshot-${exportedAtCompact}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function handleSnapshotImport(file) {
  if (!file) return;

  // Destructive-action guardrail: importing can replace existing records with matching IDs.
  const confirmed = window.confirm(
    'Importing a snapshot merges records by ID and may replace matching local entries. Continue?'
  );
  if (!confirmed) {
    setBackupNotice('warn', 'Import cancelled by user.');
    return;
  }

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    const result = await store.importSnapshot(payload);
    const mergedCount = Object.values(result.merged || {}).reduce((sum, count) => sum + Number(count || 0), 0);
    setBackupNotice('ok', `Import complete. ${mergedCount} total merged records across known collections.`);
  } catch (error) {
    setBackupNotice('error', error?.message || 'Import failed due to an unknown error.');
  }
}

function renderShell(state) {
  const route = uiState.route;
  const mode = route.split('/')[1] || 'capture';
  const hideQuickCapture = mode === 'close';
  const routeParts = route.split('/');

  let content = '';
  if (mode === 'capture') content = renderCapture(state, uiState);
  if (mode === 'plan') content = renderPlan(state, uiState);
  if (mode === 'execute') content = renderExecute(state, uiState);
  if (mode === 'close') content = renderClose(state, uiState);
  if (!content) content = renderCapture(state, uiState);

  const libraryOpen = isLibraryRoute(route);

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <nav class="mode-nav" aria-label="Mode navigation">
          ${['capture', 'plan', 'execute', 'close'].map((item) => `<a class="mode-link ${mode === item ? 'active' : ''}" href="#/${item}">${item[0].toUpperCase() + item.slice(1)}</a>`).join('')}
          <a class="mode-link library" href="#/library/tasks">Library</a>
          <span class="muted">Device: ${getDeviceId()}</span>
          <div class="backup-controls">
            <button class="button" type="button" data-backup-action="export">Export</button>
            <button class="button" type="button" data-backup-action="import">Import</button>
            <input class="hidden-file-input" type="file" accept="application/json,.json" data-import-file-input />
          </div>
        </nav>
        <p class="status-text ${uiState.backupNotice?.type || ''}" role="status" aria-live="polite">${uiState.backupNotice?.message || 'Backup tools are always available in this top bar.'}</p>
        ${uiState.persistenceNotice ? `<p class="status-text ${uiState.persistenceNotice.type}" role="status" aria-live="polite" data-persistence-status>${uiState.persistenceNotice.message}</p>` : ''}
        ${uiState.startupRolloverNotice ? `
          <p class="status-text warn" role="status" aria-live="polite" data-startup-rollover-banner>
            Today was reset for a new day (${uiState.startupRolloverNotice.previousDate} → ${uiState.startupRolloverNotice.currentDate}).
            ${uiState.startupRolloverNotice.recoveredItemCount ? `Saved ${uiState.startupRolloverNotice.recoveredItemCount} prior item(s) to Daily Logs.` : 'No prior Today items were carried over.'}
            <button class="button" type="button" data-dismiss-rollover-banner style="margin-left:0.6rem;">Dismiss</button>
          </p>
        ` : ''}
        <aside class="shortcut-panel" aria-label="Keyboard shortcut hints">
          <strong>Shortcuts:</strong>
          <span class="muted">C/P/E/L switch modes · Ctrl+Enter submits focused form · ↑/↓ move list focus · Plan: M/S/K sets Must/Should/Could</span>
        </aside>
        ${hideQuickCapture ? '' : `
          <form data-quick-capture class="quick-row" aria-label="Global quick capture">
            <label for="global-capture" class="muted">Quick capture</label>
            <input id="global-capture" name="globalCapture" class="input" placeholder="Capture from any mode..." required />
            <button class="button" type="submit">Save</button>
          </form>
        `}
      </header>
      <main id="main-content" tabindex="-1">${content}</main>
    </div>
    <div class="modal ${libraryOpen ? 'open' : ''}" data-library-modal>
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="library-dialog-title" tabindex="-1" data-library-modal-panel>
        <div class="view-header" style="margin-bottom:0.65rem;">
          <h2 id="library-dialog-title">Entity Library</h2>
          <button class="button" type="button" data-close-library>Close</button>
        </div>
        ${renderLibrary(state, routeParts)}
      </section>
    </div>
  `;
}


function getProcessingFields(button) {
  const editor = button.closest('[data-inline-processor]');
  if (!editor) return {};

  const fieldNodes = editor.querySelectorAll('[data-process-field]');
  const fields = {};
  for (const node of fieldNodes) {
    fields[node.dataset.processField] = node.value?.trim() || '';
  }
  return fields;
}


function isTypingTarget(node) {
  if (!node) return false;
  if (node.closest('[contenteditable="true"]')) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
}

function getFocusableRows(scope = document) {
  return [...scope.querySelectorAll('[data-nav-row]')]
    .filter((row) => row.offsetParent !== null && !row.hasAttribute('disabled') && row.getAttribute('aria-hidden') !== 'true');
}

function focusAdjacentRow(currentRow, direction) {
  const container = currentRow.closest('[data-nav-list]') || document;
  const rows = getFocusableRows(container);
  const currentIndex = rows.indexOf(currentRow);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'next'
    ? Math.min(rows.length - 1, currentIndex + 1)
    : Math.max(0, currentIndex - 1);
  const nextRow = rows[targetIndex];
  if (!nextRow || nextRow === currentRow) return;

  nextRow.focus();
}

async function applyPlanSuggestionBucketFromShortcut(event) {
  if (uiState.route !== '/plan') return false;

  const bucketByKey = { m: 'must', s: 'should', k: 'could' };
  const nextBucket = bucketByKey[event.key.toLowerCase()];
  if (!nextBucket) return false;

  const focusedRow = document.activeElement?.closest?.('[data-row-type="plan-suggestion"]');
  if (!focusedRow) return false;

  event.preventDefault();
  await store.setSuggestionBucket(focusedRow.dataset.suggestionId, nextBucket);
  return true;
}

function bindGlobalEvents() {
  document.addEventListener('submit', async (event) => {
    const quickCapture = event.target.closest('[data-quick-capture]');
    const captureForm = event.target.closest('[data-capture-form]');
    const executeNoteForm = event.target.closest('[data-execute-note-form]');
    const closeNoteForm = event.target.closest('[data-close-note-form]');
    if (!quickCapture && !captureForm && !executeNoteForm && !closeNoteForm) return;

    event.preventDefault();

    if (closeNoteForm) {
      const itemId = closeNoteForm.dataset.id;
      const noteInput = closeNoteForm.querySelector('textarea[name="note"]');
      const note = noteInput?.value?.trim() || '';
      if (!itemId || !note) return;
      const ok = await performStoreOperation('Update note save', () => store.addTodayUpdateNote(itemId, note));
      if (ok) noteInput.value = '';
      return;
    }

    if (executeNoteForm) {
      const itemId = executeNoteForm.dataset.id;
      const noteInput = executeNoteForm.querySelector('textarea[name="note"]');
      const note = noteInput?.value?.trim() || '';
      if (!itemId || !note) return;
      const ok = await performStoreOperation('Update note save', () => store.addTodayUpdateNote(itemId, note));
      if (ok) {
        noteInput.value = '';
        uiState.executeNoteItemId = null;
      }
      return;
    }

    const form = event.target;
    const input = form.querySelector('input[name="globalCapture"], input[name="captureInput"]');
    if (!input?.value.trim()) return;
    const ok = await performStoreOperation('Capture save', () => store.addInboxItem(input.value.trim()));
    if (ok) input.value = '';
  });

  document.addEventListener('change', async (event) => {
    const importInput = event.target.closest('[data-import-file-input]');
    if (!importInput) return;

    const [file] = importInput.files || [];
    await handleSnapshotImport(file);

    // Reset input so selecting the same file again still triggers change events.
    importInput.value = '';
  });

  document.addEventListener('click', async (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) {
      uiState.captureTab = tabButton.dataset.tab;
      store.emit();
      return;
    }

    const dismissRolloverBanner = event.target.closest('[data-dismiss-rollover-banner]');
    if (dismissRolloverBanner) {
      uiState.startupRolloverNotice = null;
      store.emit();
      return;
    }

    const backupButton = event.target.closest('[data-backup-action]');
    if (backupButton) {
      const action = backupButton.dataset.backupAction;
      if (action === 'export') {
        const snapshot = store.exportSnapshot();
        triggerSnapshotDownload(snapshot);
        setBackupNotice('ok', `Export complete: ${snapshot.exportedAt}`);
      } else if (action === 'import') {
        const input = document.querySelector('[data-import-file-input]');
        input?.click();
      }
      return;
    }

    const processButton = event.target.closest('[data-action="process"]');
    if (processButton) {
      const id = processButton.dataset.id;
      uiState.processingInboxId = uiState.processingInboxId === id ? null : id;
      store.emit();
      return;
    }

    const processTargetButton = event.target.closest('[data-process-target]');
    if (processTargetButton) {
      const fields = getProcessingFields(processTargetButton);
      const ok = await performStoreOperation('Inbox processing', () => store.processInboxItem(
        processTargetButton.dataset.id,
        processTargetButton.dataset.processTarget,
        fields
      ));
      if (ok) uiState.processingInboxId = null;
      return;
    }

    const archiveButton = event.target.closest('[data-action="archive"]:not([data-execute-action])');
    if (archiveButton) {
      await store.toggleArchiveInbox(archiveButton.dataset.id);
      return;
    }

    const snoozeButton = event.target.closest('[data-action="snooze"]');
    if (snoozeButton) {
      await store.toggleSnoozeInbox(snoozeButton.dataset.id);
      return;
    }

    const addTodayButton = event.target.closest('[data-add-today]');
    if (addTodayButton) {
      await store.addToToday(addTodayButton.dataset.bucket, addTodayButton.dataset.addToday);
      return;
    }

    const moveButton = event.target.closest('[data-move]');
    if (moveButton) {
      await store.reorderToday(moveButton.dataset.id, moveButton.dataset.move);
      return;
    }

    const noteToggleButton = event.target.closest('[data-note-toggle]');
    if (noteToggleButton) {
      const id = noteToggleButton.dataset.noteToggle;
      uiState.executeNoteItemId = uiState.executeNoteItemId === id ? null : id;
      store.emit();
      return;
    }

    const executeActionButton = event.target.closest('[data-execute-action]');
    if (executeActionButton) {
      const itemId = executeActionButton.dataset.id;
      const action = executeActionButton.dataset.executeAction;
      const status = executeActionButton.dataset.status;
      if (!itemId || !action) return;

      if (action === 'set-status') {
        await store.setTodayStatus(itemId, status);
      } else if (action === 'defer') {
        await store.deferTodayItem(itemId);
      } else if (action === 'archive') {
        await store.archiveTodayItem(itemId);
      }
      return;
    }


    const closeActionButton = event.target.closest('[data-close-action]');
    if (closeActionButton) {
      const action = closeActionButton.dataset.closeAction;
      if (action === 'validate-notes') {
        const validation = store.validateIncompleteTodayNotes();
        if (!validation.valid) {
          window.alert(`Missing update note for ${validation.missing.length} incomplete item(s).`);
        } else {
          window.alert('All incomplete Today items have update notes.');
        }
      } else if (action === 'generate-log') {
        await store.generateDailyLogSnapshot();
      } else if (action === 'close-day') {
        const result = await store.closeDay();
        if (!result.ok) {
          const blockerCounts = {
            missingTodayNotes: result.readiness?.missingTodayNotes?.length || 0,
            unprocessedInbox: result.readiness?.unprocessedInbox?.length || 0,
            snoozedInbox: result.readiness?.snoozedInbox?.length || 0
          };

          if (blockerCounts.missingTodayNotes) {
            window.alert(`Close blocked: add update notes for ${blockerCounts.missingTodayNotes} incomplete Today item(s).`);
          } else if (blockerCounts.snoozedInbox) {
            window.alert(`Close blocked: unsnooze and resolve ${blockerCounts.snoozedInbox} snoozed inbox item(s).`);
          } else if (blockerCounts.unprocessedInbox) {
            window.alert(`Close blocked: process or archive ${blockerCounts.unprocessedInbox} inbox item(s).`);
          } else {
            window.alert('Close blocked: review day-end blockers in the Close checklist.');
          }
        } else {
          window.alert('Day closed. Daily Log saved and Today plan reset.');
        }
      } else if (action === 'load-sample-data') {
        // Explicit confirmation keeps demo fixtures opt-in for production users.
        const confirmed = window.confirm('Load sample data? This replaces your current local data with demo records.');
        if (!confirmed) return;

        await store.loadSampleData();
        window.alert('Sample data loaded. Demo mode is now active for this local dataset.');
      } else if (action === 'reset-all-local-data') {
        // Reset is intentionally hard-confirmed because this clears every local collection.
        const confirmed = window.confirm('Reset all local data? This permanently clears your local records on this device.');
        if (!confirmed) return;

        await store.resetAllLocalData();
        window.alert('All local data reset. The app is now in production-safe empty mode.');
      }
      return;
    }

    const closeResolveButton = event.target.closest('[data-close-resolve]');
    if (closeResolveButton) {
      if (closeResolveButton.dataset.closeResolve === 'open-capture') {
        uiState.captureTab = 'unprocessed';
        goTo('/capture');
      }
      return;
    }

    const closeLibraryButton = event.target.closest('[data-close-library]');
    if (closeLibraryButton) {
      closeLibraryModal();
      return;
    }

    const followUpToggleButton = event.target.closest('[data-followup-group-id][data-followup-person-id]');
    if (followUpToggleButton) {
      // Library detail rows use explicit group/person data attributes for deterministic follow-up toggles.
      const groupId = followUpToggleButton.dataset.followupGroupId;
      const personId = followUpToggleButton.dataset.followupPersonId;
      await store.toggleFollowUpRecipient(groupId, personId);
      return;
    }
  });

  document.addEventListener('keydown', async (event) => {
    if (isLibraryRoute(uiState.route)) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLibraryModal();
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = getLibraryFocusableElements();
        if (!focusableElements.length) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;
        const panel = document.querySelector('[data-library-modal-panel]');

        if (panel && activeElement instanceof HTMLElement && !panel.contains(activeElement)) {
          event.preventDefault();
          first.focus();
          return;
        }

        if (panel && activeElement instanceof HTMLElement && panel.contains(activeElement) && !focusableElements.includes(activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
          return;
        }

        // Keep keyboard focus constrained to modal controls while the dialog is active.
        if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
    }

    const activeElement = document.activeElement;
    const typing = isTypingTarget(activeElement);

    // Ctrl/Cmd + Enter always submits the currently focused form for fast keyboard workflows.
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const activeForm = activeElement?.closest?.('form');
      if (activeForm) {
        event.preventDefault();
        activeForm.requestSubmit();
      }
      return;
    }

    // Never trigger navigation shortcuts while users are actively typing.
    if (typing && event.key !== 'Escape') return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const focusedRow = activeElement?.closest?.('[data-nav-row]');
      if (focusedRow) {
        event.preventDefault();
        focusAdjacentRow(focusedRow, event.key === 'ArrowDown' ? 'next' : 'prev');
        return;
      }
    }

    if (await applyPlanSuggestionBucketFromShortcut(event)) return;

    const map = { c: '/capture', p: '/plan', e: '/execute', l: '/close' };
    const route = map[event.key.toLowerCase()];
    if (route) {
      event.preventDefault();
      goTo(route);
    }
  });
}

async function start() {
  await store.init();
  syncPersistenceNotice();
  // Startup-only notice explains why Today is empty after automatic date rollover.
  uiState.startupRolloverNotice = store.getStartupRolloverNotice();
  bindGlobalEvents();

  onRouteChange((route) => {
    const enteringLibrary = isLibraryRoute(route) && !isLibraryRoute(uiState.route);
    if (!isLibraryRoute(route)) {
      modalState.lastNonLibraryRoute = route;
    }

    if (enteringLibrary) {
      modalState.previouslyFocusedElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      modalState.previouslyFocusedSelector = getRestoreSelector(modalState.previouslyFocusedElement);
    }

    uiState.route = route;
    store.emit();
  });

  store.subscribe((state) => {
    syncPersistenceNotice();
    renderShell(state);
    syncLibraryModalAccessibility(uiState.route);
  });

  uiState.route = getRoute();
  store.emit();
}

start();
