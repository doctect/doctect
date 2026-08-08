// onboarding/src/render/playgroundWin.mjs
// The import is stripped in the shipped bundle (shared IIFE scope) but is
// REQUIRED for vitest, which imports this module as real ESM.
import { scoreProfile, rankFor, levelUnlocked, escapeHtml } from '../app-logic.mjs';
import { highlightCode } from './codeWin.mjs';

const escP = escapeHtml;

function pgPane(title) {
    const s = document.createElement('section');
    s.className = 'pane pg-pane';
    s.innerHTML = `<div class="pane-title">${escP(title)}</div><div class="pane-body"></div>`;
    return { s, body: s.querySelector('.pane-body') };
}

function renderHub(el, ctx) {
    const pg = ctx.content.playground;
    const { points, max } = scoreProfile(ctx.profile, pg);
    const rank = rankFor(points, max);
    const hub = pgPane('playground');
    const quizMax = pg.quizLevels.reduce((s, l) => s + l.questions.length, 0);
    const quizDone = pg.quizLevels.reduce((s, _, i) => s + (ctx.profile.quiz[i]?.best || 0), 0);
    hub.body.innerHTML =
        `<p>rank: <span class="amber">${escP(rank)}</span> · ${points}/${max} points</p>` +
        `<div class="pg-cards">` +
        `<a class="pg-card" href="#/playground/quiz/0"><b>quiz ladder</b><span class="dim">${pg.quizLevels.length} levels, unlock at 6/8 · ${quizDone}/${quizMax}</span></a>` +
        `<a class="pg-card" href="#/playground/bugs"><b>bug hunt</b><span class="dim">${pg.bugHunt.length} real historical bugs</span></a>` +
        `<a class="pg-card" href="#/playground/merge"><b>merge lab</b><span class="dim">drive the real diff engine</span></a>` +
        `<a class="pg-card" href="#/playground/wdil"><b>where does it live?</b><span class="dim">${pg.wdil.length} behaviors to locate</span></a>` +
        `</div>`;
    el.append(hub.s);
}

function renderQuiz(el, ctx, levelIdx) {
    const pg = ctx.content.playground;
    const li = Math.min(Math.max(levelIdx, 0), pg.quizLevels.length - 1);
    const level = pg.quizLevels[li];
    const state = ctx.profile.quiz[li] || (ctx.profile.quiz[li] = { answers: {}, best: 0 });

    const tabs = pg.quizLevels.map((l, i) => {
        const locked = !levelUnlocked(ctx.profile, i);
        return locked ? `<span class="dim">🔒 ${escP(l.title)}</span>`
            : `<a class="${i === li ? 'amber' : ''}" href="#/playground/quiz/${i}">${escP(l.title)}</a>`;
    }).join(' · ');

    const pane = pgPane(`quiz · ${level.title}`);
    if (!levelUnlocked(ctx.profile, li)) {
        pane.body.innerHTML = `<p>${tabs}</p><p class="red">locked — score 6/8 on the previous level first.</p>`;
        el.append(pane.s); return;
    }
    const answered = Object.keys(state.answers).length;
    const correct = level.questions.filter((q, i) => state.answers[i] === q.answer).length;
    pane.body.innerHTML = `<p>${tabs} · <a href="#/playground">hub</a></p>` +
        `<p class="dim">${answered}/${level.questions.length} answered · ${correct} correct · best ${state.best}</p>` +
        `<div class="quiz-list"></div>` +
        `<p><button data-reset>retry level</button></p>`;
    const list = pane.body.querySelector('.quiz-list');
    level.questions.forEach((q, qi) => {
        const chosen = state.answers[qi];
        const div = document.createElement('div');
        div.className = 'quiz-q';
        div.innerHTML = `<p><b>Q${qi + 1}.</b> ${escP(q.q)}</p>` + q.options.map((opt, oi) => {
            const cls = chosen === undefined ? '' :
                oi === q.answer ? 'right' : oi === chosen ? 'wrong' : 'dim';
            return `<button class="quiz-opt ${cls}" data-q="${qi}" data-o="${oi}" ${chosen !== undefined ? 'disabled' : ''}>${escP(opt)}</button>`;
        }).join('') + (chosen !== undefined ? `<p class="quiz-why dim">${escP(q.why)}</p>` : '');
        list.append(div);
    });
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.quiz-opt');
        if (!btn || btn.disabled) return;
        state.answers[btn.dataset.q] = Number(btn.dataset.o);
        const nowCorrect = level.questions.filter((q, i) => state.answers[i] === q.answer).length;
        if (Object.keys(state.answers).length === level.questions.length) {
            state.best = Math.max(state.best, nowCorrect);
        }
        ctx.save();
        renderPlayground(el, ctx);
    });
    pane.body.querySelector('[data-reset]').addEventListener('click', () => {
        ctx.profile.quiz[li] = { answers: {}, best: state.best };
        ctx.save();
        renderPlayground(el, ctx);
    });
    el.append(pane.s);
}

function renderBugs(el, ctx, bugId) {
    const bugs = ctx.content.playground.bugHunt;
    const bug = bugs.find(b => b.id === bugId) || bugs[0];
    const status = ctx.profile.bugs[bug.id];

    const list = pgPane('bug hunt · 7 true stories');
    list.body.innerHTML = '<p><a href="#/playground">hub</a></p><ul class="bug-list">' +
        bugs.map(b => {
            const st = ctx.profile.bugs[b.id];
            const mark = st === 'found' ? '<span class="accent">✓</span>'
                : st === 'revealed' ? '<span class="amber">◦</span>' : '<span class="dim">·</span>';
            return `<li>${mark} <a class="${b.id === bug.id ? 'amber' : ''}" href="#/playground/bugs/${b.id}">${escP(b.title)}</a></li>`;
        }).join('') + '</ul>' +
        '<p class="dim">Each panel reconstructs the code as it stood. Click the guilty line. One shot.</p>';

    const panel = pgPane(bug.title);
    const lines = bug.code.split('\n');
    // join('') deliberately: the lines are display:block, and a literal newline
    // between them inside a <pre> would render as an extra blank line.
    panel.body.innerHTML = `<p>${escP(bug.setup)}</p><pre class="code bug-code${status ? ' resolved' : ''}">` +
        lines.map((ln, i) => {
            const cls = status && i === bug.guiltyLine ? 'bug-line guilty' : 'bug-line';
            return `<span class="${cls}" data-line="${i}">${highlightCode(ln) || ' '}</span>`;
        }).join('') + '</pre>' +
        (status ? `<p class="${status === 'found' ? 'accent' : 'amber'}">` +
            `${status === 'found' ? 'found it.' : 'revealed — the guilty line is highlighted.'}</p>` +
            `<p class="bug-story">${escP(bug.story)}</p>` +
            `<p class="dim">lives on, fixed: <a href="#/code/${bug.fixedRef}"><code>${bug.fixedRef}</code></a></p>`
          : '');
    if (!status) {
        panel.body.querySelector('.bug-code').addEventListener('click', (e) => {
            const line = e.target.closest('.bug-line');
            if (!line) return;
            ctx.profile.bugs[bug.id] = Number(line.dataset.line) === bug.guiltyLine ? 'found' : 'revealed';
            ctx.save();
            renderPlayground(el, ctx);
        });
    }
    el.append(list.s, panel.s);
}

export function renderPlayground(el, ctx) {
    el.innerHTML = '';
    const [section, arg] = ctx.route.parts;
    if (section === 'quiz') return renderQuiz(el, ctx, Number(arg) || 0);
    if (section === 'bugs') return renderBugs(el, ctx, arg);
    // Tasks 10-11 add their `merge` / `wdil` branches here.
    return renderHub(el, ctx);
}
