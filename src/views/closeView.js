export function renderClose(state) {
  return `
    <section>
      <div class="view-header">
        <h1>Close</h1>
        <p class="muted">End-of-day checklist wireframe.</p>
      </div>
      <div class="checklist">
        <article class="col checklist-step">
          <strong>1) Process inbox items</strong>
          <a class="mode-link" href="#/capture">Go to Capture</a>
          <span class="muted">${state.inbox.filter((item) => !item.archived).length} unprocessed</span>
        </article>
        <article class="col checklist-step">
          <strong>2) Review incomplete Today items</strong>
          <button class="button" type="button">Require update notes (placeholder)</button>
        </article>
        <article class="col">
          <div class="checklist-step">
            <strong>3) Generate Daily log</strong>
            <button class="button" type="button">Generate preview</button>
          </div>
          <pre class="muted" style="margin-top:0.4rem; white-space:pre-wrap;">Daily log preview panel placeholder\n- Planned: ${state.today.length}\n- Done: 0\n- Incomplete: ${state.today.length}</pre>
        </article>
        <article class="col checklist-step">
          <strong>4) Wipe plan</strong>
          <button class="button" type="button">Wipe Today (placeholder)</button>
        </article>
      </div>
    </section>
  `;
}
