// onboarding/src/render/toursWin.mjs
import { escapeHtml } from '../app-logic.mjs';

const escT = escapeHtml;

function tourPane(title, cls) {
    const s = document.createElement('section');
    s.className = 'pane ' + cls;
    s.innerHTML = `<div class="pane-title">${escT(title)}</div><div class="pane-body"></div>`;
    return { s, body: s.querySelector('.pane-body') };
}

function renderDiagram(lines, highlight) {
    // Escape the whole line FIRST (diagrams contain literals like "<head tag>"),
    // then substitute tokens — {{id:label}} survives escaping untouched.
    const html = lines.map(l => escT(l).replace(/\{\{([a-z0-9-]+):([^}]*)\}\}/g, (_, id, label) =>
        `<span class="diag${highlight.includes(id) ? ' lit' : ''}" data-d="${id}">${label}</span>`))
        .join('\n');
    return `<pre class="diagram">${html}</pre>`;
}

export function renderTours(el, ctx) {
    const tours = ctx.content.tours;
    const [tourId, stepStr] = ctx.route.parts;
    const tour = tours.find(t => t.id === tourId) || tours[0];
    const stepIdx = Math.min(Math.max(Number(stepStr) || 0, 0), tour.steps.length - 1);
    const step = tour.steps[stepIdx];

    const list = tourPane('tours', 'tours-list');
    list.body.innerHTML =
        '<ul class="tour-index">' + tours.map(t =>
            `<li class="${t.id === tour.id ? 'active' : ''}"><a href="#/tours/${t.id}/0">${escT(t.title)}</a></li>`
        ).join('') + '</ul>' +
        `<p class="dim">${escT(tour.blurb)}</p>` +
        '<ol class="tour-steps">' + tour.steps.map((s, i) =>
            `<li class="${i === stepIdx ? 'active' : ''}"><a href="#/tours/${tour.id}/${i}">` +
            `${escT(s.text.slice(0, 64))}…</a></li>`).join('') + '</ol>';

    const stage = tourPane(tour.title, 'tours-stage');
    stage.body.innerHTML =
        renderDiagram(tour.diagram, step.highlight) +
        `<p class="tour-text">${escT(step.text)}</p>` +
        '<div class="files-strip">files: ' + step.files.map(f =>
            `<a href="#/code/${f}"><code>${f}</code></a>`).join(' · ') + '</div>' +
        `<div class="tour-nav">` +
        (stepIdx > 0 ? `<a href="#/tours/${tour.id}/${stepIdx - 1}">◀ prev</a>` : '<span></span>') +
        `<span class="dim">${stepIdx + 1}/${tour.steps.length}</span>` +
        (stepIdx < tour.steps.length - 1 ? `<a href="#/tours/${tour.id}/${stepIdx + 1}">next ▶</a>` : '<span></span>') +
        '</div>';

    el.append(list.s, stage.s);
}
