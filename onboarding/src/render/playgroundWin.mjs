// onboarding/src/render/playgroundWin.mjs
// The import is stripped in the shipped bundle (shared IIFE scope) but is
// REQUIRED for vitest, which imports this module as real ESM.
import { scoreProfile, rankFor, levelUnlocked, escapeHtml } from '../app-logic.mjs';

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
        `<p>rank: <span class="amber">${rank}</span> · ${points}/${max} points</p>` +
        `<div class="pg-cards">` +
        `<a class="pg-card" href="#/playground/quiz/0"><b>quiz ladder</b><span class="dim">5 levels, unlock at 6/8 · ${quizDone}/${quizMax}</span></a>` +
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

export function renderPlayground(el, ctx) {
    el.innerHTML = '';
    const [section, arg] = ctx.route.parts;
    if (section === 'quiz') return renderQuiz(el, ctx, Number(arg) || 0);
    // Tasks 9-11 add their `bugs` / `merge` / `wdil` branches here.
    return renderHub(el, ctx);
}
