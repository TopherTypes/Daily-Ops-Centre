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
  backupNotice: null
};

function isLibraryRoute(route) {
  return route.startsWith('/library');
}

function setBackupNotice(type, message) {
  // Global import/export notifications are displayed in the top bar so they are visible in every mode.
  uiState.backupNotice = { type, message };
  store.emit();
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
      <section class="modal-panel" role="dialog" aria-modal="true" aria-label="Library">
        <div class="view-header" style="margin-bottom:0.65rem;">
          <h2>Entity Library</h2>
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
      await store.addTodayUpdateNote(itemId, note);
      noteInput.value = '';
      return;
    }

    if (executeNoteForm) {
      const itemId = executeNoteForm.dataset.id;
      const noteInput = executeNoteForm.querySelector('textarea[name="note"]');
      const note = noteInput?.value?.trim() || '';
      if (!itemId || !note) return;
      await store.addTodayUpdateNote(itemId, note);
      noteInput.value = '';
      uiState.executeNoteItemId = null;
      return;
    }

    const form = event.target;
    const input = form.querySelector('input[name="globalCapture"], input[name="captureInput"]');
    if (!input?.value.trim()) return;
    await store.addInboxItem(input.value.trim());
    input.value = '';
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
      await store.processInboxItem(
        processTargetButton.dataset.id,
        processTargetButton.dataset.processTarget,
        fields
      );
      uiState.processingInboxId = null;
      return;
    }

    const archiveButton = event.target.closest('[data-action="archive"]:not([data-execute-action])');
    if (archiveButton) {
      await store.toggleArchiveInbox(archiveButton.dataset.id);
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
          window.alert(`Close blocked: add update notes for ${result.missing.length} incomplete item(s) first.`);
        } else {
          window.alert('Day closed. Daily Log saved and Today plan reset.');
        }
      }
      return;
    }

    const closeLibraryButton = event.target.closest('[data-close-library]');
    if (closeLibraryButton) {
      goTo('/capture');
    }
  });

  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing && event.key !== 'Escape') return;

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
  bindGlobalEvents();

  onRouteChange((route) => {
    uiState.route = route;
    store.emit();
  });

  store.subscribe((state) => {
    renderShell(state);
  });

  uiState.route = getRoute();
  store.emit();
}

start();
