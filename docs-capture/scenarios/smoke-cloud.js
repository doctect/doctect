// Pipeline smoke test for docs-capture/lib/cloud.js: two users, publish,
// fork, merge request. Run with --out=<scratch dir>; smoke output is never
// committed. See docs-capture/scenarios/smoke.js for the base-pipeline smoke.
import { gotoEditor, newBlankProject, drawElement } from '../lib/app.js';
import { signUpAndVerify, saveToCloud, publishProject, openGalleryProject, forkProject, proposeChanges, signOut } from '../lib/cloud.js';

export const shots = [
    {
        id: 'smoke-cloud/publish-fork-mr',
        kind: 'still',
        run: async (t) => {
            // Usernames use underscores, not hyphens: pages/LoginPage.tsx
            // validates against /^[a-zA-Z0-9_]{3,30}$/ (server-enforced too,
            // via better-auth's username plugin) -- a hyphenated username
            // like "docs-owner" fails that check client-side before the form
            // ever submits.
            await signUpAndVerify(t, { username: 'docs_owner', email: 'owner@docs.test', password: 'DocsCapture2026!' });
            await gotoEditor(t);
            await newBlankProject(t);
            await drawElement(t, 'r', { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 });
            await saveToCloud(t);
            await publishProject(t, { description: 'Smoke publish', tags: 'smoke' });
            await signOut(t);

            await signUpAndVerify(t, { username: 'docs_forker', email: 'forker@docs.test', password: 'DocsCapture2026!' });
            await openGalleryProject(t, 'Blank Project');
            await forkProject(t);
            await drawElement(t, 'e', { x: 0.5, y: 0.55 }, { x: 0.7, y: 0.7 });
            await saveToCloud(t);
            await proposeChanges(t);
            await t.snap(); // whatever page proposeChanges lands on (the MR page)
        },
    },
];
