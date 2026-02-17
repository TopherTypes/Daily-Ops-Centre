import { escapeHtml } from '../utils/format.js';

function renderSuggestionColumn(name, items) {
  return `
    <section class="col">
      <h3>${name}</h3>
      <div class="row-list" style="margin-top:0.35rem;">
        ${items.map((item) => `
          <article class="row">
            <div class="row-main">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="row-meta muted">${item.type} · ${item.meta}</div>
            </div>
            <div class="inline-actions">
              <button class="inline-button" data-add-today="${item.id}" data-bucket="${name.toLowerCase()}" type="button">Add to Today</button>
            </div>
          </article>
        `).join('') || '<p class="muted">No suggestions yet.</p>'}
      </div>
    </section>
  `;
}

export function renderPlan(state) {
  const todayRows = state.today.map((item) => `
    <article class="row" tabindex="0">
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
        <div class="row-list" style="margin-top:0.35rem;">
          ${todayRows || '<p class="muted">Nothing in Today yet. Pull from suggestions below.</p>'}
        </div>
      </section>
      <div class="cols">
        ${renderSuggestionColumn('Must', state.suggestions.must)}
        ${renderSuggestionColumn('Should', state.suggestions.should)}
        ${renderSuggestionColumn('Could', state.suggestions.could)}
      </div>
    </section>
  `;
}
