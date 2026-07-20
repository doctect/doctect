// Pipeline smoke test: one still, one clip. Run with --out=<scratch dir>;
// smoke output is never committed.
import { gotoEditor, newBlankProject, drawElement } from '../lib/app.js';

export const shots = [
    {
        id: 'smoke/editor-blank',
        kind: 'still',
        run: async (t) => {
            await gotoEditor(t);
            await newBlankProject(t);
            await t.snap();
        },
    },
    {
        id: 'smoke/clip-draw-rect',
        kind: 'clip',
        run: async (t) => {
            await gotoEditor(t);
            await newBlankProject(t);
            t.beginClip();
            await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.62, y: 0.55 });
        },
    },
];
