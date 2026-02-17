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
  executeNoteItemId: null
};

function isLibraryRoute(route) {
  return route.startsWith('/library');
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
        </nav>
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
    if (!quickCapture && !captureForm) return;

    event.preventDefault();
    const form = event.target;
    const input = form.querySelector('input[name="globalCapture"], input[name="captureInput"]');
    if (!input?.value.trim()) return;
    await store.addInboxItem(input.value.trim());
    input.value = '';
  });

  document.addEventListener('click', async (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) {
      uiState.captureTab = tabButton.dataset.tab;
      store.emit();
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

    const archiveButton = event.target.closest('[data-action="archive"]');
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
