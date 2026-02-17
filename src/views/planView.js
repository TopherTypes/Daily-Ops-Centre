import { escapeHtml } from '../utils/format.js';

function isPlanVisible(item) {
  // Plan mode only works with active entities; archived/deleted remain recoverable in Library.
  return !item?.deleted && !item?.archived;
}

// Suggestion rows are keyboard-focusable so M/S/K and arrow navigation can operate without a mouse.
function renderSuggestionColumn(name, items, todaySuggestionIds) {
  return `
    <section class="col">
      <h3>${name}</h3>
      <div class="row-list" data-nav-list="plan-suggestions" style="margin-top:0.35rem;">
        ${items.map((item) => {
          const alreadyInToday = todaySuggestionIds.has(item.id);
          return `
            <article
              class="row"
              tabindex="0"
              data-nav-row
              data-row-type="plan-suggestion"
              data-suggestion-id="${item.id}"
              data-suggestion-bucket="${name.toLowerCase()}"
            >
              <div class="row-main">
                <strong>${escapeHtml(item.title)}</strong>
                <div class="row-meta muted">${item.type} · ${item.meta}</div>
              </div>
              <div class="inline-actions">
                <button
                  class="inline-button"
                  data-add-today="${item.id}"
                  data-bucket="${name.toLowerCase()}"
                  type="button"
                  ${alreadyInToday ? 'disabled aria-disabled="true"' : ''}
                >
                  ${alreadyInToday ? 'In Today' : 'Add to Today'}
                </button>
              </div>
            </article>
          `;
        }).join('') || '<p class="muted">No suggestions yet.</p>'}
      </div>
    </section>
  `;
}

export function renderPlan(state) {
  // Store-level rebuildSuggestionsForDate() keeps these buckets populated from live entity data.
  // Today rows also participate in list navigation for consistent Plan-mode keyboard movement.
  const todayItems = state.today.filter(isPlanVisible);
  const todaySuggestionIds = new Set(todayItems.map((item) => item.suggestionId || item.id));
  const todayRows = todayItems.map((item) => `
    <article class="row" tabindex="0" data-nav-row data-row-type="plan-today" data-today-id="${item.id}">
      <div class="row-main">
        <strong>${escapeHtml(item.title)}</strong>
        <div class="row-meta muted">${item.bucket.toUpperCase()} · ${item.type} · ${item.meta}</div>
      </div>
      <div class="inline-actions">
        <button class="inline-button" data-move="up" data-id="${item.id}" type="button">↑</button>
        <button class="inline-button" data-move="down" data-id="${item.id}" type="button">↓</button>
      </div>
    </article>
  `).join('');

  return `
    <section>
      <div class="view-header">
        <h1>Plan</h1>
        <p class="muted">M/S/K placeholders for keyboard-first ordering.</p>
      </div>
      <section class="col" style="margin-bottom:0.45rem;">
        <h3>Today (starts empty)</h3>
        <div class="row-list" data-nav-list="plan-today" style="margin-top:0.35rem;">
          ${todayRows || '<p class="muted">Nothing in Today yet. Pull from suggestions below.</p>'}
        </div>
      </section>
      <div class="cols">
        ${renderSuggestionColumn('Must', state.suggestions.must.filter(isPlanVisible), todaySuggestionIds)}
        ${renderSuggestionColumn('Should', state.suggestions.should.filter(isPlanVisible), todaySuggestionIds)}
        ${renderSuggestionColumn('Could', state.suggestions.could.filter(isPlanVisible), todaySuggestionIds)}
      </div>
    </section>
  `;
}
