// onboarding/src/content/intro.mjs
// Authored content for the INTRO window. Data only — no functions.
export const INTRO = {
    about: [
        'PDF Architect is a local-first editor for structured PDF products — planners, journals, trackers, gamebooks — aimed at e-ink tablets (the flagship page size is the reMarkable Paper Pro’s 509×679 pt). A document is a hierarchy of nodes; each node renders through a template; templates carry elements (text, rectangles, lines, SVG artwork, dynamic grids, smart links); variants are alternate template sets over the same hierarchy — one document, many looks.',
        'Everything works without an account: projects live in browser localStorage and PDF export runs client-side through jsPDF. An account adds cloud saves (immutable, gzip’d full-snapshot commits), publishing to a public gallery, GitHub-style forking, and merge requests judged by a structured three-way diff — the same engine the server enforces at merge time.',
        'It is one repo with no monorepo tooling: the React 19 + Vite client sits at the root (components/, pages/, services/, hooks/), the Express 5 server in server/ (SQLite in dev, Postgres in prod, versioned run-once migrations), and shared/ holds plain-ESM code imported by both sides — most importantly the diff engine.',
        'Two production ideas dominate the codebase: nothing public ever tracks your private working head (publishing pins an explicit published commit), and nothing that came from someone else ever executes or renders unsanitized (the generator sandbox, DOMPurify at the single SVG render site).',
    ],
    run: [
        { cmd: 'npm run dev', note: 'Vite client :3000 + Express API :3001, concurrently' },
        { cmd: 'npm test', note: 'vitest unit suite (jsdom) — the ~1,850-test wall every round leans on' },
        { cmd: 'npm run test:e2e', note: 'Playwright end-to-end, Chromium + Firefox, boots its own server' },
        { cmd: 'node docs-capture/run.js <track>', note: 'regenerate the in-app docs screenshots from a live scripted app' },
        { cmd: 'node onboarding/build.mjs', note: 'regenerate this page from the current repo' },
        { cmd: 'npm run build', note: 'production client build into dist/, served by the Express fallback route' },
    ],
    houseMethod: {
        text: [
            'Every feature round runs the same pipeline: a brainstorm settles the design decisions, a spec records them (docs/superpowers/specs/), a plan breaks the work into bite-sized tasks (docs/superpowers/plans/), and each task is implemented test-first by a fresh worker who sees only that task’s brief — then independently reviewed before the next task starts. After all tasks land, one more review reads the whole branch as a single system.',
            'The whole-branch review exists because some bugs are structurally invisible to a per-task view. The proof is in the catches on the right — each was found only when someone looked at everything at once.',
        ],
        stages: ['brainstorm', 'spec', 'plan', 'implement (TDD, fresh worker per task)', 'independent per-task review', 'whole-branch review'],
        catches: [
            'A pre-existing unsanitized SVG path became stored cross-user XSS the moment publishing and forking existed — found by the first whole-branch review, fixed with DOMPurify at the one render site, verified with a live exploit before and after.',
            'The entire 108-file docs corpus was being statically imported into the main bundle and parsed on every route — a landing-page regression no docs task could see; fixed by lazy-loading the docs chunk.',
            'Profile pages silently lost every thumbnail: one task omitted the field, another added the defensive default that hid the crash, and no task owned the visual outcome. Caught whole-branch, fixed at the endpoint.',
        ],
    },
    roundLabels: {
        '2026-07-04-username-identity-design.md': 'Public username identity',
        '2026-07-04-login-redirect-and-gallery-pdf-download-design.md': 'Sign-in redirect + gallery zip download',
        '2026-07-05-gallery-detail-modal-design.md': 'Gallery projects as overlay modals',
        '2026-07-05-gallery-version-history-design.md': 'Public version history',
        '2026-07-06-gallery-v2-ratings-reviews-filters-design.md': 'Ratings, reviews, tag browsing',
        '2026-07-08-layers-panel-design.md': 'Named layers + stacked selection',
        '2026-07-09-password-policy-design.md': 'Password policy',
        '2026-07-09-email-verification-design.md': 'Email verification (and the dotenv seals)',
        '2026-07-13-generator-source-persistence-design.md': 'Generator source persistence + sandbox',
        '2026-07-16-account-moderation-design.md': 'Account moderation (audit triggers)',
        '2026-07-16-owner-moderator-authority-design.md': 'Owner above the moderators',
        '2026-07-18-text-overflow-rendering-design.md': 'Text overflow: one layout engine',
        '2026-07-19-signup-cap-waitlist-design.md': 'Signup cap + waitlist',
        '2026-07-19-docs-overhaul-design.md': 'The /docs documentation product',
        '2026-07-25-gallery-listing-editing-design.md': 'Editing a published listing',
        '2026-08-04-gallery-discoverability-design.md': 'Gallery discoverability redesign',
        '2026-08-06-gallery-all-projects-directory-design.md': 'All-projects directory',
        '2026-08-07-dev-onboarding-playground-design.md': 'This playground',
    },
};
