import { gotoEditor, newBlankProject, drawElement, ACTIVE_PANE } from '../lib/app.js';

// EditorToolbar.tsx's own root div carries Tailwind's arbitrary-value class
// "min-h-[40px]" (py-1 bg-slate-50 border-b ... shadow-sm z-10) -- but so
// does a second, unrelated bar one level up in ProjectEditor.tsx (~line
// 1046: the Undo/Redo/JSON/Export row, "min-h-[40px] ... bg-white ...
// z-20"), and that one is FIRST in DOM order (it wraps the whole editor,
// EditorToolbar sits inside the flex row below it). The brief's guessed
// selector, unscoped, would silently crop that wrong bar instead --
// confirmed by reading both components' root className strings directly.
// "bg-slate-50" is the disambiguator: of the two "min-h-[40px]" elements in
// the whole codebase (grep-verified), only EditorToolbar's carries it.
// Bracket-escaped per CSS's own rule for a literal "[" / "]" in a class
// selector (same escaping Tailwind's own stylesheet uses; Playwright's
// locator resolves it via the browser's native querySelector).
//
// Also scoped to ACTIVE_PANE: gotoEditor's default "Blank Project" tab plus
// newBlankProject's second one means two panes -- and thus two full
// EditorToolbars -- are mounted at once by the time this snaps (see
// lib/app.js's ACTIVE_PANE comment for why an unscoped query can silently
// resolve into the backgrounded tab).
const TOOLBAR_SELECTOR = `${ACTIVE_PANE} div.min-h-\\[40px\\].bg-slate-50`;

export const shots = [
    { id: 'editor/toolbar', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await t.snap(TOOLBAR_SELECTOR);
    } },
    { id: 'editor/clip-drag-create', kind: 'clip', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        t.beginClip();
        await drawElement(t, 'r', { x: 0.25, y: 0.25 }, { x: 0.6, y: 0.5 });
        await drawElement(t, 't', { x: 0.25, y: 0.55 }, { x: 0.6, y: 0.62 });
        await t.page.keyboard.type('Hello', { delay: 60 });
        await t.page.keyboard.press('Escape');
    } },
    { id: 'editor/selection-handles', kind: 'still', run: async (t) => {
        await gotoEditor(t); await newBlankProject(t);
        await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
        await t.snap();
    } },
];
