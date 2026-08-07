// onboarding/src/render/introWin.mjs
import { escapeHtml } from '../app-logic.mjs';

const esc = escapeHtml;

function pane(title, extraClass = '') {
    const section = document.createElement('section');
    section.className = `pane ${extraClass}`;
    section.innerHTML = `<div class="pane-title">${esc(title)}</div><div class="pane-body"></div>`;
    return { section, body: section.querySelector('.pane-body') };
}

export function renderIntro(el, ctx) {
    const { vitals } = ctx.data;
    const intro = ctx.content.intro;

    const about = pane('doctect · what this is', 'intro-about');
    about.body.innerHTML =
        intro.about.map(p => `<p>${esc(p)}</p>`).join('') +
        '<h3 class="accent">run it</h3><table class="cmds">' +
        intro.run.map(r => `<tr><td><code>${esc(r.cmd)}</code></td><td class="dim">${esc(r.note)}</td></tr>`).join('') +
        '</table>';

    const col = document.createElement('div');
    col.className = 'intro-col';

    const vit = pane('vitals · generated from this checkout');
    vit.body.innerHTML =
        `<table class="vitals">` +
        `<tr><td>unit-test files</td><td class="accent">${vitals.testFileCount}</td></tr>` +
        `<tr><td>migrations</td><td class="accent">${vitals.migrations.count}</td>` +
        `<td class="dim">latest ${vitals.migrations.last}</td></tr>` +
        `<tr><td>client schema</td><td class="accent">v${vitals.schemaVersion}</td></tr>` +
        `<tr><td>API endpoints</td><td class="accent">${vitals.routes.reduce((s, r) => s + r.endpoints.length, 0)}</td>` +
        `<td class="dim">${vitals.routes.length} route files</td></tr>` +
        `<tr><td>dependencies</td><td class="accent">${vitals.deps.runtime}</td>` +
        `<td class="dim">+${vitals.deps.dev} dev</td></tr></table>` +
        `<h3 class="accent">lines by area</h3><table class="vitals">` +
        vitals.areas.slice(0, 9).map(a =>
            `<tr><td>${a.dir}/</td><td class="dim">${a.files} files</td><td class="accent">${a.lines.toLocaleString()}</td></tr>`
        ).join('') + '</table>';

    const method = pane('the house method');
    method.body.innerHTML =
        intro.houseMethod.text.map(p => `<p>${esc(p)}</p>`).join('') +
        `<p class="accent">${esc(intro.houseMethod.stages.join(' → '))}</p>` +
        '<h3 class="amber">catches only a whole-branch review makes</h3><ul>' +
        intro.houseMethod.catches.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' +
        '<h3 class="accent">rounds shipped</h3><ul class="timeline">' +
        [...vitals.specs].reverse().map(spec => {
            const label = intro.roundLabels[spec] ||
                spec.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-design\.md$/, '').replace(/-/g, ' ');
            return `<li><span class="dim">${spec.slice(0, 10)}</span> ${esc(label)}</li>`;
        }).join('') + '</ul>';

    col.append(vit.section, method.section);
    el.append(about.section, col);
}
