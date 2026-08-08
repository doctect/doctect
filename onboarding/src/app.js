// DOM glue. Pure logic lives in app-logic.mjs; render fns in render/*.mjs.
// After stripModuleSyntax + concatenation everything shares one IIFE scope.
(function initOnboarding() {
    const { data, content } = window.DOCTECT;
    let profile = loadProfile();

    const ctx = () => ({
        data, content, profile,
        save: () => saveProfile(profile),
        navigate: (hash) => { location.hash = hash; },
        route: parseHash(location.hash),
        diff: window.DoctectDiff,
    });

    const root = document.getElementById('root');
    const statusbar = document.getElementById('statusbar');
    const renderers = { intro: renderIntro, tours: renderTours, code: renderCode, playground: renderPlayground };

    const renderStatusbar = (active) => {
        statusbar.innerHTML = '';
        const session = document.createElement('span');
        session.className = 'session'; session.textContent = '[doctect]';
        statusbar.appendChild(session);
        WINDOWS.forEach((w, i) => {
            const tab = document.createElement('span');
            tab.className = 'wtab' + (w.id === active ? ' active' : '');
            tab.textContent = `${i + 1}:${w.label}${w.id === active ? '*' : ''}`;
            tab.onclick = () => { location.hash = buildHash(w.id); };
            statusbar.appendChild(tab);
        });
        const spacer = document.createElement('span'); spacer.className = 'spacer';
        const meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = `${data.vitals.gitSha} · ? for keys`;
        const clock = document.createElement('span'); clock.className = 'clock';
        clock.id = 'clock';
        statusbar.append(spacer, meta, clock);
    };

    const tickClock = () => {
        const el = document.getElementById('clock');
        if (el) el.textContent = new Date().toTimeString().slice(0, 5);
    };
    setInterval(tickClock, 10_000);

    const renderRoute = () => {
        const route = parseHash(location.hash);
        renderStatusbar(route.win);
        tickClock();
        root.innerHTML = '';
        renderers[route.win](root, ctx());
    };

    const help = document.getElementById('help');
    const toggleHelp = (force) => {
        const show = force !== undefined ? force : help.hidden;
        help.hidden = !show;
        if (show) help.innerHTML = '<h2>doctect onboarding — keys</h2><table>' +
            '<tr><td class="key">1–4</td><td>switch window</td></tr>' +
            '<tr><td class="key">?</td><td>toggle this help</td></tr>' +
            '<tr><td class="key">/</td><td>focus search (code window)</td></tr>' +
            '<tr><td class="key">Esc</td><td>close overlays</td></tr></table>';
    };

    document.addEventListener('keydown', (e) => {
        const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
        if (e.key === 'Escape') { toggleHelp(false); return; }
        if (inField) return;
        if (e.key >= '1' && e.key <= '4') location.hash = buildHash(WINDOWS[Number(e.key) - 1].id);
        else if (e.key === '?') toggleHelp();
        else if (e.key === '/') {
            const search = document.querySelector('[data-search]');
            if (search) { e.preventDefault(); search.focus(); }
        }
    });

    const boot = document.getElementById('boot');
    // Guarded: a bare call aborts this whole IIFE — and with it the entire page —
    // anywhere matchMedia is missing (jsdom, older embedded webviews).
    const reducedMotion = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finishBoot = () => {
        boot.hidden = true;
        if (!profile.bootSeen) { profile.bootSeen = true; saveProfile(profile); }
    };
    if (!profile.bootSeen && !reducedMotion) {
        boot.hidden = false;
        const lines = [
            'connecting to doctect …',
            `· ${data.vitals.testFileCount} unit-test files · ${data.vitals.migrations.count} migrations · schema v${data.vitals.schemaVersion}`,
            '· gallery, forks, merge requests, layers, generator, docs',
            'attach: [doctect] session ready',
        ];
        const pre = document.getElementById('boot-lines');
        let li = 0, ci = 0;
        const timer = setInterval(() => {
            if (li >= lines.length) { clearInterval(timer); setTimeout(finishBoot, 500); return; }
            ci++;
            if (ci >= lines[li].length) { li++; ci = 0; }
            pre.textContent = lines.slice(0, li).join('\n') + (li < lines.length ? '\n' + lines[li].slice(0, ci) : '');
        }, 12);
        boot.addEventListener('click', () => { clearInterval(timer); finishBoot(); }, { once: true });
        document.addEventListener('keydown', function skip() {
            clearInterval(timer); finishBoot(); document.removeEventListener('keydown', skip);
        }, { once: true });
    } else if (!profile.bootSeen) {
        finishBoot();
    }

    window.addEventListener('hashchange', renderRoute);
    renderRoute();
})();
