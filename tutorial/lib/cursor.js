// Playwright's recordVideo captures the page only — no OS cursor. This module
// injects a visible cursor dot + click ripple and provides eased, human-paced
// mouse helpers so viewers can follow the pointer.
// Passed to Playwright as a real function reference — string scripts get
// paren-wrapped by evaluate() and an IIFE with a trailing semicolon becomes a
// SyntaxError, which addInitScript/evaluate swallow silently.
export function installOverlayInPage() {
    // Guard on ACTUAL presence, not a flag: as an init script this can run
    // before document.documentElement exists — it must be able to retry later
    // (ensureCursor) without a stale "already installed" flag blocking it.
    if (document.getElementById('__tut_cursor')) return;
    if (!document.documentElement) return;
    const style = document.createElement('style');
    style.textContent = [
        '#__tut_cursor { position: fixed; width: 22px; height: 22px; border-radius: 50%;',
        '  background: rgba(37, 99, 235, 0.85); border: 2.5px solid white;',
        '  box-shadow: 0 1px 6px rgba(0,0,0,0.4); pointer-events: none;',
        '  z-index: 2147483647; transform: translate(-50%, -50%); left: -50px; top: -50px; }',
        '#__tut_ripple { position: fixed; width: 22px; height: 22px; border-radius: 50%;',
        '  border: 3px solid rgba(37, 99, 235, 0.9); pointer-events: none;',
        '  z-index: 2147483646; transform: translate(-50%, -50%) scale(1); opacity: 0; }',
        '#__tut_ripple.fire { animation: __tut_rip 0.45s ease-out; }',
        '@keyframes __tut_rip { 0% { opacity: 0.9; transform: translate(-50%,-50%) scale(0.8); }',
        '  100% { opacity: 0; transform: translate(-50%,-50%) scale(2.6); } }',
    ].join('\n');
    document.documentElement.appendChild(style);
    const cursor = document.createElement('div'); cursor.id = '__tut_cursor';
    const ripple = document.createElement('div'); ripple.id = '__tut_ripple';
    document.documentElement.appendChild(cursor);
    document.documentElement.appendChild(ripple);
    window.__tutCursor = {
        move(x, y) { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; },
        click(x, y) {
            ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
            ripple.classList.remove('fire'); void ripple.offsetWidth; ripple.classList.add('fire');
        },
    };
}

export async function installCursor(context) {
    // Belt: init script for early paint; ensureCursor() is the suspenders for
    // any document where init scripts don't fire.
    await context.addInitScript(installOverlayInPage);
}

/** Idempotent: installs the overlay if the current document lacks it. */
export async function ensureCursor(page) {
    await page.evaluate(installOverlayInPage).catch(() => {});
}

let lastX = 200, lastY = 200;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

const syncOverlay = (page, x, y) =>
    page.evaluate(([px, py]) => window.__tutCursor?.move(px, py), [x, y]).catch(() => {});

/** Eased multi-step mouse move the viewer can follow. */
export async function humanMove(page, x, y, ms = 550) {
    await ensureCursor(page);
    const steps = Math.max(12, Math.round(ms / 16));
    const [sx, sy] = [lastX, lastY];
    for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        const px = sx + (x - sx) * t, py = sy + (y - sy) * t;
        await page.mouse.move(px, py);
        await syncOverlay(page, px, py);
        await page.waitForTimeout(ms / steps);
    }
    lastX = x; lastY = y;
}

export async function humanClick(page, x, y, ms = 550) {
    await humanMove(page, x, y, ms);
    await page.evaluate(([px, py]) => window.__tutCursor?.click(px, py), [x, y]).catch(() => {});
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
}

/** Move to + click the center of a locator. */
export async function clickEl(page, selector, ms = 550) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`clickEl: no box for ${selector}`);
    await humanClick(page, box.x + box.width / 2, box.y + box.height / 2, ms);
}

/** Re-sync the overlay after a navigation; installs it if missing. */
export async function resyncCursor(page) {
    await ensureCursor(page);
    await syncOverlay(page, lastX, lastY);
}

/** Human-paced typing into a focused input. */
export async function humanType(page, text, delay = 45) {
    await page.keyboard.type(text, { delay });
}
