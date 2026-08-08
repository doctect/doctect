// onboarding/src/render/playgroundWin.mjs
// The import is stripped in the shipped bundle (shared IIFE scope) but is
// REQUIRED for vitest, which imports this module as real ESM.
import { scoreProfile, rankFor, levelUnlocked, escapeHtml } from '../app-logic.mjs';
import { highlightCode, treeHtml } from './codeWin.mjs';

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

// A resolved bug can show the real code as it stands today, straight out of the
// tree, when it carries an anchorId. ctx.data.excerpts is absent in unit contexts
// that never build them, so this stays optional at both ends.
function fixedExcerptHtml(ctx, bug) {
    const excerpt = bug.anchorId && (ctx.data.excerpts || []).find(e => e.id === bug.anchorId);
    if (!excerpt) return '';
    return `<p class="dim">${escP(excerpt.file)}:${excerpt.startLine} — today:</p>` +
        `<pre class="code">${highlightCode(excerpt.code)}</pre>`;
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
            `<p class="dim">lives on, fixed: <a href="#/code/${bug.fixedRef}"><code>${bug.fixedRef}</code></a></p>` +
            fixedExcerptHtml(ctx, bug)
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

function renderMerge(el, ctx) {
    const scenarios = ctx.content.playground.mergeScenarios;
    const lab = pgPane('merge lab · the engine the server enforces');
    lab.body.innerHTML =
        '<p><a href="#/playground">hub</a> · <span class="dim">this runs the REAL shared/diff.js, bundled at build time</span></p>' +
        `<p><select data-scenario>${scenarios.map(s => `<option value="${escP(s.name)}">${escP(s.name)}</option>`).join('')}</select>` +
        ' <button data-run>threeWayDiff</button> <button data-merge>merge (applyChangeSet)</button></p>' +
        '<p class="dim">The lab models the conflict gate only — the server also refuses on failed ' +
        'validation, a schema mismatch, a moved target head, or an oversized result.</p>' +
        '<p class="dim" data-blurb></p>' +
        '<div class="merge-grid">' +
        ['base', 'fork', 'upstream'].map(k =>
            `<div><div class="pane-subtitle">${k}</div><textarea data-${k} rows="14" spellcheck="false"></textarea></div>`
        ).join('') + '</div>' +
        '<div class="pane-subtitle">output</div><pre class="code merge-out">pick a scenario, edit the JSON, run.</pre>';

    const ta = { base: lab.body.querySelector('[data-base]'), fork: lab.body.querySelector('[data-fork]'),
                 upstream: lab.body.querySelector('[data-upstream]') };
    const out = lab.body.querySelector('.merge-out');
    const blurb = lab.body.querySelector('[data-blurb]');
    const load = (name) => {
        const s = scenarios.find(x => x.name === name) || scenarios[0];
        for (const k of ['base', 'fork', 'upstream']) ta[k].value = JSON.stringify(s[k], null, 2);
        blurb.textContent = s.blurb;
        out.textContent = 'pick a scenario, edit the JSON, run.';
    };
    // The panes are free-text: every failure has to land IN the output pane,
    // naming the pane at fault, never as an exception that kills the button.
    const parseAll = () => {
        const states = {};
        for (const k of ['base', 'fork', 'upstream']) {
            let parsed;
            try { parsed = JSON.parse(ta[k].value); }
            catch (err) { out.textContent = `${k}: JSON parse error — ${err.message}`; return null; }
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                out.textContent = `${k}: expected a JSON object (a project state), got ${Array.isArray(parsed) ? 'an array' : String(parsed)}`;
                return null;
            }
            states[k] = parsed;
        }
        return states;
    };
    const show = (fn) => {
        const states = parseAll();
        if (!states) return;
        try { out.textContent = fn(states); }
        catch (err) { out.textContent = `engine error — ${err.message}`; }
    };
    const conflictLines = (conflicts) => conflicts.map(c => `  · [${c.kind}] ${c.description}`).join('\n');
    // A verdict must never outlive the panes it describes: typing invalidates it.
    // (load() assigns .value, which fires no input event, so presets are unaffected.)
    for (const k of ['base', 'fork', 'upstream']) {
        ta[k].addEventListener('input', () => { out.textContent = 'edited — run it again.'; });
    }
    lab.body.querySelector('[data-scenario]').addEventListener('change', (e) => load(e.target.value));
    lab.body.querySelector('[data-run]').addEventListener('click', () => show((s) => {
        const result = ctx.diff.threeWayDiff(s.base, s.fork, s.upstream);
        return (result.conflicts.length
            ? `⚠ ${result.conflicts.length} conflict(s):\n` + conflictLines(result.conflicts)
            : '✓ no conflicts — mergeable') +
            '\n\nfork changed:\n' + JSON.stringify(result.source, null, 2) +
            '\n\nupstream changed:\n' + JSON.stringify(result.target, null, 2);
    }));
    lab.body.querySelector('[data-merge]').addEventListener('click', () => show((s) => {
        const check = ctx.diff.threeWayDiff(s.base, s.fork, s.upstream);
        return check.conflicts.length
            ? `refused — ${check.conflicts.length} conflict(s), exactly like the merge endpoint would:\n` +
              conflictLines(check.conflicts)
            : 'merged state (fork changes replayed onto upstream):\n' +
              JSON.stringify(ctx.diff.applyChangeSet(s.base, s.fork, s.upstream), null, 2);
    }));
    load(scenarios[0].name);
    el.append(lab.s);
}

function renderWdil(el, ctx, wdilId) {
    const items = ctx.content.playground.wdil;
    const item = items.find(w => w.id === wdilId) || items[0];
    const state = ctx.profile.wdil[item.id] || (ctx.profile.wdil[item.id] = { tries: 0, done: false, failed: false });

    const list = pgPane('where does it live?');
    list.body.innerHTML = '<p><a href="#/playground">hub</a></p><ol class="wdil-list">' +
        items.map(w => {
            const st = ctx.profile.wdil[w.id];
            const mark = st?.done ? (st.failed ? '<span class="amber">◦</span>' : '<span class="accent">✓</span>')
                                  : '<span class="dim">·</span>';
            return `<li>${mark} <a class="${w.id === item.id ? 'amber' : ''}" href="#/playground/wdil/${w.id}">${escP(w.prompt)}</a></li>`;
        }).join('') + '</ol>';

    const game = pgPane(`find it · ${3 - state.tries} tries left`);
    game.body.innerHTML = `<p>${escP(item.prompt)}</p>` +
        (state.tries >= 1 && !state.done ? `<p class="amber">hint: ${escP(item.hint)}</p>` : '') +
        (state.done ? `<p class="${state.failed ? 'amber' : 'accent'}">` +
            (state.failed ? 'it lives in: ' : 'correct: ') +
            item.answers.map(a => `<a href="#/code/${a}"><code>${a}</code></a>`).join(' or ') + '</p>'
          : '<p class="dim">click the file in the tree.</p>') +
        `<nav class="tree wdil-tree"></nav>`;
    game.body.querySelector('.wdil-tree').innerHTML =
        treeHtml(ctx.data.tree, '', new Set(item.answers.map(a => a.split('/')[0])));
    if (!state.done) {
        game.body.querySelector('.wdil-tree').addEventListener('click', (e) => {
            const link = e.target.closest('a.tree-file');
            if (!link) return;
            e.preventDefault();
            const picked = link.getAttribute('href').replace('#/code/', '');
            if (item.answers.includes(picked)) { state.done = true; }
            else {
                state.tries += 1;
                if (state.tries >= 3) { state.done = true; state.failed = true; }
            }
            ctx.save();
            renderPlayground(el, ctx);
        });
    }
    el.append(list.s, game.s);
}

export function renderPlayground(el, ctx) {
    el.innerHTML = '';
    const [section, arg] = ctx.route.parts;
    if (section === 'quiz') return renderQuiz(el, ctx, Number(arg) || 0);
    if (section === 'bugs') return renderBugs(el, ctx, arg);
    if (section === 'merge') return renderMerge(el, ctx);
    if (section === 'wdil') return renderWdil(el, ctx, arg);
    return renderHub(el, ctx);
}
