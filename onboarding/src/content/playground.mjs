export const PLAYGROUND = {
    quizLevels: [
        { title: 'L1 · orientation', questions: [
            { q: 'What is PDF Architect, in one sentence?',
              options: ['A cloud CMS for PDF forms', 'A PDF viewer with annotations', 'A local-first editor for structured PDF products (planners, journals) targeting e-ink pages', 'A print shop backend'],
              answer: 2, why: 'Local-first is the founding constraint — everything (editing, export) works with no account; cloud/gallery is opt-in on top. See the INTRO window.' },
            { q: 'Where does an anonymous user’s project live?',
              options: ['localStorage', 'IndexedDB', 'A cloud draft keyed by cookie', 'The URL fragment'],
              answer: 0, why: 'Projects persist to browser localStorage; cloud storage only exists after an explicit “save to cloud”.' },
            { q: 'npm run dev starts…',
              options: ['Vite only', 'Vite and the Express API concurrently', 'A Docker compose stack', 'Express serving a prebuilt dist/'],
              answer: 1, why: 'package.json: concurrently "vite" "node server/index.js" — client :3000, API :3001.' },
            { q: 'Databases in dev and prod are…',
              options: ['Postgres everywhere', 'SQLite everywhere', 'MongoDB', 'SQLite dev, Postgres prod — one query() over both'],
              answer: 3, why: 'server/db.js exposes one query() over both engines and migrations carry pg and sqlite variants; the ~20 places the engines genuinely differ (FOR UPDATE, advisory locks) branch on dbType explicitly.' },
            { q: 'A “variant” is…',
              options: ['An alternate template set over the same node hierarchy', 'A git branch of the project', 'A color theme', 'A fork on the gallery'],
              answer: 0, why: 'One document, many looks: variants swap the templates; the hierarchy stays shared. types.ts is the reference.' },
            { q: 'The in-app /docs content comes from…',
              options: ['A CMS', 'Hand-written JSX pages', 'Bundled markdown in docs-content/, validated at load', 'The GitHub wiki'],
              answer: 2, why: 'docs-content/ markdown is parsed and validated in the unit suite — a broken link or duplicate slug fails the build.' },
            { q: 'How does a project become publicly visible?',
              options: ['Auto-sync once signed in', 'Sharing a link', 'Admin approval', 'An explicit publish that pins a specific commit'],
              answer: 3, why: 'Publishing pins published_commit_id; private saves never move public content. The “pinned snapshot” tour walks it.' },
            { q: 'What lives in shared/?',
              options: ['CSS shared by pages', 'Plain ESM imported by BOTH client and server — generator metadata and shared validation rules', 'React context providers', 'Test fixtures'],
              answer: 1, why: 'shared/generatorMetadata.js is imported by services/generatorSandbox.ts and the browser-safe shared/validateAppState.js implementation; server/validateAppState.js is its compatibility re-export. shared/passwordPolicy.js is imported by pages/LoginPage.tsx AND server/auth.js. shared/diff.js is server-side today — the client renders the ChangeSet the server computed.' },
        ] },
        { title: 'L2 · the client', questions: [
            { q: 'The editor canvas is technically…',
              options: ['A <canvas> 2D context', 'SVG', 'WebGL', 'Absolutely-positioned DOM elements'],
              answer: 3, why: 'DOM canvas — which is why thumbnails need the jsPDF→pdfjs pipeline and why editor chrome needed isolation:isolate.' },
            { q: 'Current document schema version, defined where?',
              options: ['v7 in types.ts', 'v11 in services/migration.ts', 'v11 in server/validateAppState.js', 'v9 in shared/diff.js'],
              answer: 1, why: 'CURRENT_SCHEMA_VERSION = 11 in services/migration.ts; the server validator deliberately doesn’t own versioning.' },
            { q: 'How are layers stored (“Shape B”)?',
              options: ['A flat element array + layerId tags + layers metadata on the template', 'Elements nested inside layer objects', 'A separate layers table in the cloud', 'CSS z-index only'],
              answer: 0, why: 'Flat elements stay individually addressable, render/export only re-sort, and the diff engine needed zero changes.' },
            { q: 'Why do elements render inside an isolation:isolate wrapper?',
              options: ['Performance', 'Accessibility', 'So user-set z-index can never paint over selection chrome at z-100', 'Print fidelity'],
              answer: 2, why: 'A template with an element at z>100 covered the selection border — isolation gives elements their own stacking context.' },
            { q: 'The gallery-project-as-modal trick uses…',
              options: ['A portal + display:none page', 'React Router background locations — URL changes, page underneath keeps rendering', 'An iframe', 'Query params only'],
              answer: 1, why: 'Direct loads/refreshes render the standalone page; in-app clicks pass the current location as state. Spiked before planning.' },
            { q: 'Components call the server through…',
              options: ['fetch() inline', 'A GraphQL client', 'React Query hooks per component', 'services/cloudApi.ts, one typed wrapper per cloud endpoint'],
              answer: 3, why: 'One file to grep when an endpoint changes — ~40 typed wrappers. Two raw-fetch holdouts remain: services/analytics.ts and the public profile load in pages/ProfilePage.tsx.' },
            { q: 'Opening someone’s project that carries generator scripts…',
              options: ['Runs them to rebuild the document', 'Strips them', 'Never executes them — only an explicit Preview runs, sandboxed', 'Asks for permission then runs in-page'],
              answer: 2, why: 'Opening must never execute foreign code. Preview runs in a sandboxed iframe + disposable worker with a 10 s timeout (SANDBOX_TIMEOUT_MS, services/generatorSandbox.ts).' },
            { q: 'Which client code is code-split off the main chunk?',
              options: ['The /docs section and the Edit Listing modal', 'Every route', 'The gallery', 'Nothing'],
              answer: 0, why: 'App.tsx imports every page statically by design — there are no per-route chunks. DocsSection and the ~6 kB EditListingModal are the client’s only two lazy boundaries. Splitting the docs section out moved roughly 160 KB gzipped off the critical path, measured on a production build.' },
        ] },
        { title: 'L3 · server & data', questions: [
            { q: 'Migration policy is…',
              options: ['Edit the schema file and restart', 'Versioned, run-once, append-only — never edit an applied migration', 'ORM auto-migration', 'Manual SQL in prod'],
              answer: 1, why: 'server/migrations/index.js is a ledger; the runner is transactional and takes a Postgres advisory lock so two boots cannot race. It replaced a bootstrap that DROP TABLEd the auth tables on every start.' },
            { q: 'A cloud commit stores…',
              options: ['A gzip’d full snapshot of AppState', 'A diff against the parent', 'Only changed templates', 'A patch file'],
              answer: 0, why: 'Full snapshots (decided pre-code) make history, restore, fork and merge simple reads. stateCodec.js does the gzip.' },
            { q: 'What does publishing pin, exactly?',
              options: ['The head commit forever', 'A tag name', 'published_commit_id + listing metadata (name/description/tags) at publish time', 'A rendered PDF'],
              answer: 2, why: 'Migrations 009/010: public readers resolve only the pinned commit and pinned metadata; saves move the private head only.' },
            { q: 'A merge request’s diff is…',
              options: ['Snapshotted when opened', 'Cached for an hour', 'Recomputed live on every view', 'Computed client-side only'],
              answer: 2, why: 'A request that becomes conflicted after upstream changes is caught on view — and the merge endpoint re-verifies under lock anyway.' },
            { q: 'requireUsername guards…',
              options: ['Every /api route', 'The six content-creating routes (create/commits/publish/fork/MR/reviews) — not unpublish/delete/close', 'Only publish', 'Only the gallery'],
              answer: 1, why: 'Every write that attaches a public handle is gated; cleanup routes aren’t, so legacy no-username accounts can still reduce their own exposure.' },
            { q: 'Star-rating averages are…',
              options: ['Denormalized onto projects and updated on write', 'Computed client-side', 'Cached in Redis', 'Computed at read time with SQL AVG()'],
              answer: 3, why: 'A live AVG can’t drift the way a hand-maintained counter can — ratings change on every edit and delete.' },
            { q: 'Forking a public project gives you…',
              options: ['A private project copied from the PUBLISHED commit, with lineage recorded', 'A public linked copy', 'A branch on the original', 'Read access'],
              answer: 0, why: 'A fork starts private and copies the source’s PUBLISHED commit — not the owner’s private head, even when you fork your own project. Lineage lands in forked_from_project_id/_commit_id, which the gallery renders as attribution.' },
            { q: 'A save with a stale If-Match tag gets…',
              options: ['A silent overwrite', 'A merge attempt', 'A retry loop server-side', 'A stable 409 and no orphan commit'],
              answer: 3, why: 'Heads advance by transactional compare-and-swap; the losing writer is told cleanly and nothing half-lands.' },
        ] },
        { title: 'L4 · security & integrity', questions: [
            { q: 'The stored-XSS fix for SVG artwork was…',
              options: ['A CSP header', 'Escaping on upload', 'DOMPurify at the single place SVG is ever rendered', 'Blocking SVG in the gallery'],
              answer: 2, why: 'components/canvas/CanvasElement.tsx sanitizes with the svg/svgFilters profile — verified with a live exploit before and after.' },
            { q: 'The signup cap is enforced in…',
              options: ['Express middleware on /sign-up', 'better-auth databaseHooks.user.create.before', 'The client form', 'nginx'],
              answer: 1, why: 'The one choke point email signup AND first-time OAuth share; returning OAuth users never create a row so never hit it.' },
            { q: 'Why did the Express-level /api/auth/admin block get bypassed?',
              options: ['A missing await', 'CORS misconfig', 'A regex typo', 'Percent-encoded dot-segments normalized back to /admin/* inside better-auth'],
              answer: 3, why: 'The real deny now lives in better-auth’s hooks.before, which sees the normalized path; the Express 404 stays as defense in depth. Red tests proved the bypass first.' },
            { q: 'A suspended user trying to establish a NEW session is stopped by…',
              options: ['Session-delete sweeps', 'A BEFORE INSERT trigger on the session table', 'The client', 'Rate limiting'],
              answer: 1, why: 'Migration 012 makes it a database property — closing the race that session deletion alone can’t.' },
            { q: 'The moderation audit log is immutable because…',
              options: ['UPDATE/DELETE-rejecting triggers on the table itself', 'Code convention', 'It’s append-only S3', 'Row-level security'],
              answer: 0, why: 'Triggers on both engines; actor/target stored as values (not FKs) so deleting an account can’t erase history.' },
            { q: 'The owner role is granted by…',
              options: ['An admin promoting you', 'A signup flag', 'The first account ever created', 'OWNER_EMAILS config reconciliation at startup/signup — no HTTP path exists'],
              answer: 3, why: 'Stale stored owners drop to plain user; requireOwner checks live config membership on every request.' },
            { q: 'Uploaded preview thumbnails are validated by…',
              options: ['File extension', 'Claimed MIME type', 'Actual magic bytes + a 300 KB cap', 'Virus scan'],
              answer: 2, why: 'parseThumbnail reads the bytes; a renamed .html can’t masquerade as a .webp.' },
            { q: 'When do someone else’s generator scripts execute in your browser?',
              options: ['Only when YOU click Preview — inside the sandbox', 'On project open', 'On gallery hover', 'On fork'],
              answer: 0, why: 'Open never executes; Apply applies the previewed result; the sandbox denies network, same-origin, and worker fan-out.' },
        ] },
        { title: 'L5 · war stories', questions: [
            { q: 'Why didn’t `delete process.env.RESEND_API_KEY` protect tests from sending real email?',
              options: ['Tests ran in a subprocess', 'dotenv re-populates any MISSING variable from .env on import', 'The key was cached', 'Resend ignores env'],
              answer: 1, why: 'Deleting a variable is an invitation. Every guard is present-but-empty, asserted AFTER dotenv loads. Sealed four times.' },
            { q: 'Pre-fix, DISABLE_AUTH_RATE_LIMIT=false did what?',
              options: ['Nothing', 'Enabled stricter limits', 'Disabled brute-force protection — any value was truthy', 'Crashed boot'],
              answer: 2, why: 'enabled: !process.env.X treats "false" as disable. The fix is a strict !== "true" check.' },
            { q: 'The tag filter’s “exact match” leaked because…',
              options: ['Unescaped % and _ in the LIKE pattern matched across JSON boundaries', 'Case sensitivity', 'Unicode', 'A join bug'],
              answer: 0, why: 'Fixed with an ESCAPE clause behaving identically on Postgres and SQLite, plus a regression test.' },
            { q: 'The Change Password section had never rendered for anyone because…',
              options: ['A CSS bug', 'A feature flag', 'It required owner role', 'The code checked a.provider but better-auth returns providerId — and the unit-test mock encoded the same wrong guess'],
              answer: 3, why: 'The mandatory real-browser task caught what mocked units structurally couldn’t. pages/AccountSettingsPage.tsx.' },
            { q: 'Why does insertCommit stamp created_at itself instead of taking the database default?',
              options: ['UUIDv4 sort', 'A race in Express', 'SQLite CURRENT_TIMESTAMP has whole-second resolution and ORDER BY then falls through to a random UUID id', 'Clock skew'],
              answer: 2, why: 'Two commits in the same second would tie on created_at and order randomly. Caught inside the task that added the API, so it never shipped broken — server/routes/projects.js.' },
            { q: 'SIGNUP_CAP=" " (a stray space) originally meant…',
              options: ['Unset', 'Signups CLOSED — Number(" ") === 0', 'Default 500', 'Crash'],
              answer: 1, why: 'Trimmed first now; whitespace means unset. Same review also caught deploy --set-env-vars replacing the whole env set.' },
            { q: 'The page-dimension unit dropdown (pt/px/in/mm) spent six months, up to the layers follow-up, being…',
              options: ['Rounding wrong', 'Metric-only', 'Breaking undo', 'Purely decorative — the conversion table was imported but never called'],
              answer: 3, why: 'A multi-select refactor dropped the conversion calls, so inputs showed raw points whatever the dropdown claimed. Switching units now re-expresses size, with round-trip drift tests.' },
            { q: 'Profile pages shipped a release with zero thumbnails because…',
              options: ['Endpoint omitted the new field + card dropped its fallback + a defensive default hid the crash — and no task owned the visual outcome', 'A CDN outage', 'An auth bug', 'Image caps'],
              answer: 0, why: 'Task 1 flagged it, Task 4 guarded it, nobody owned it. The fix added the field at the source plus a profile-page test.' },
        ] },
    ],
    // Every `code` block is an authored reconstruction of how the code stood at the
    // time — trimmed for the panel, but never invented. Every `story` was checked
    // against git history before shipping; where the plan's draft overstated what
    // happened (see task-9-report.md), the story here is the corrected one.
    bugHunt: [
        { id: 'dotenv-resurrection', title: 'The test suite that emailed forty strangers',
          setup: 'Unit-test helper, written to guarantee tests can never send real email:',
          code: "export const initTestApp = async () => {\n    process.env.SQLITE_PATH = scratchDbPath();\n\n    // Ensure the suite can never deliver real email.\n    delete process.env.RESEND_API_KEY;\n\n    // server/auth.js loads dotenv during this dynamic import.\n    const { createApp } = await import('../../../server/app.js');\n    return createApp();\n};",
          guiltyLine: 4,
          story: 'The server loads dotenv during import — and dotenv re-populates any MISSING variable from .env. Deleting a variable is an invitation: the next import put the real key straight back, and a routine full-suite run sent forty real verification emails to @test.dev addresses. The seal is now present-but-empty (assigned the empty string), which dotenv never overrides, with a regression test asserting the seal holds AFTER dotenv has loaded — tests/unit/server/emailSealing.test.js. The same trap was sealed in four places: Playwright config, tutorial recording servers, deploy script, unit-test helpers.',
          fixedRef: 'tests/unit/server/helpers.js' },
        { id: 'rate-limit-toggle', title: 'The off switch that only had one position',
          setup: 'better-auth rate limiting, with a way to opt out under test:',
          code: "rateLimit: {\n    // Tests create four users in a beforeAll and trip the built-in 3-per-10s sign-up rule.\n    enabled: !process.env.DISABLE_AUTH_RATE_LIMIT,\n    window: 60,\n    max: 20\n},",
          guiltyLine: 2,
          story: 'Any value — including the DISABLE_AUTH_RATE_LIMIT=false someone writes to mean “do NOT disable this” — is a truthy string, so the negation turned brute-force protection OFF on any misconfigured deploy. The flag was added mid-round to unblock a flaky test, and the ratings round’s whole-branch review caught what no per-task review structurally could. The fix compares against the exact string “true”, so every other value — including “false” and the empty string — leaves the limiter on. It fails safe now.',
          fixedRef: 'server/auth.js' },
        { id: 'like-wildcards', title: 'The exact match that wasn’t',
          setup: 'The gallery’s exact-tag filter, matching a JSON-quoted tag inside a stored tags string:',
          code: "if (tag) {\n    // JSON-quoting the tag makes this an exact element match: plan cannot match planner.\n    params.push(`%${JSON.stringify(tag)}%`);\n    where += ` AND p.tags LIKE $${params.length}`;\n}",
          guiltyLine: 2,
          story: 'JSON.stringify makes it look airtight — the closing quote is exactly why plan cannot match planner. But it escapes JSON metacharacters, not LIKE ones: a tag containing % or _ carried live wildcards into the pattern and matched unrelated projects across JSON element boundaries, leaking the exact-match guarantee the comment above it promised. Caught by the same whole-branch review as the rate-limit toggle, and fixed by escaping backslash first, then % and _, plus an ESCAPE clause that behaves identically on Postgres and SQLite — with regression tests in galleryFilters.test.js. The column reads published_tags today; publishing pinned its own metadata later.',
          fixedRef: 'server/routes/gallery.js' },
        { id: 'provider-id', title: 'The section nobody ever saw',
          setup: 'Account settings — show Change Password only for accounts that have a password credential:',
          code: "const res = await authClient.listAccounts();\n// Only credential accounts can change a password.\nsetHasCredential(!!res?.data?.some(a => a.provider === 'credential'));",
          guiltyLine: 2,
          story: 'better-auth’s list-accounts returns providerId, not provider — so the predicate was false for everyone and the section had never rendered for a single user. The unit-test mock had encoded the same wrong field name, so the unit suite was green the whole time. The mandatory real-browser verification task is what caught it; the fix corrected the check and the mock together, and the mock now carries a comment pointing at the better-auth source that defines the real wire shape.',
          fixedRef: 'pages/AccountSettingsPage.tsx' },
        { id: 'commit-timestamps', title: 'Newest first, by coin flip',
          setup: 'The commits table and its history query:',
          code: "CREATE TABLE commits (\n    id TEXT PRIMARY KEY,\n    project_id TEXT NOT NULL,\n    state BLOB NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n-- newest first\nSELECT * FROM commits WHERE project_id = ? ORDER BY created_at DESC, id DESC;",
          guiltyLine: 4,
          story: 'SQLite’s CURRENT_TIMESTAMP has whole-second resolution. Two commits saved within the same second tie — and the tiebreak column is a random UUID, so “newest commit first” would have become a coin flip exactly when someone saved twice quickly. This is the one that never shipped broken: the commit that first built the cloud history API already stamped created_at from the app at millisecond precision, with the reasoning spelled out in a comment, in the same commit that wrote the ORDER BY it protects. The table still declares DEFAULT CURRENT_TIMESTAMP — insertCommit simply never lets it fire.',
          fixedRef: 'server/routes/projects.js' },
        { id: 'signup-cap-space', title: 'The stray space that closed signups',
          setup: 'Reading the signup cap from the environment — blank must mean “unset”, because 0 means signups are CLOSED:',
          code: "const raw = process.env.SIGNUP_CAP;\nif (raw === undefined || raw === '') return DEFAULT_CAP;\nconst parsed = Number(raw);\nif (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_CAP;\nreturn parsed;",
          guiltyLine: 1,
          story: 'SIGNUP_CAP=\' \' — one stray space in a deploy config — sails past the empty-string check, and Number(\' \') === 0 is an integer that is not negative. Zero means CLOSED, so a whitespace typo would have silently shut the front door. The value is now trimmed first, and whitespace means unset. The same review caught deploy.sh’s --set-env-vars replacing the entire env set, so one update line omitting SIGNUP_CAP would have wiped it; a test now asserts every update line carries it.',
          fixedRef: 'server/signupCap.js' },
        { id: 'spa-fallback', title: 'Every deep link 404s in the production build',
          setup: 'The SPA fallback route, serving the client for any non-API path:',
          code: "const distPath = path.join(__dirname, '../dist');\napp.use(express.static(distPath));\napp.get(/.*/, (req, res) => {\n    res.sendFile(path.join(distPath, 'index.html'));\n});",
          guiltyLine: 3,
          story: 'express@5.2.1’s res.sendFile() 404s on a bare absolute path here even when the file exists — so every hard load of any non-root route (/login, /app, every gallery URL, a refresh, a bookmark) died the moment the app was served from the built dist/ instead of the dev server. In-app navigation was unaffected and Vite’s dev server has its own correct fallback, which is why the identical call sat unnoticed for six months, byte-for-byte, since the repo’s first Express commit. What found it was the gallery plan’s final task building and booting the production path for the first time — not a code review. The fix is the one-line recommended form: res.sendFile(\'index.html\', { root: distPath }).',
          anchorId: 'spa-fallback',
          fixedRef: 'server/app.js' },
    ],
    // Mirrors tests/unit/onboarding/fixtures/diffScenarios.js exactly (a test in
    // content.test.js pins it): the same five states the bundle-vs-module parity
    // test runs, so the shipped presets can never drift from what is proven equal.
    mergeScenarios: [
        {
            name: 'clean-merge',
            blurb: 'Fork edits the day template; upstream renames the variant. No overlap — applyChangeSet keeps both.',
            base: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            fork: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: {
                                id: 'day',
                                elements: [{ type: 'text', text: 'Day (fork)', x: 10, y: 10 }]
                            },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            upstream: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly v2',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            }
        },
        {
            name: 'same-template-conflict',
            blurb: 'Both sides edit the same template differently. The engine refuses; a human decides.',
            base: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            fork: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Fork edit', x: 1, y: 1 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            upstream: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: {
                                id: 'day',
                                elements: [{ type: 'text', text: 'Upstream edit', x: 2, y: 2 }]
                            },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            }
        },
        {
            name: 'remove-vs-modify',
            blurb: 'Fork deletes the notes template; upstream improves it. Deleting what someone improved is a conflict.',
            base: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            fork: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] }
                        }
                    }
                }
            },
            upstream: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 5, y: 5, w: 90, h: 30 }] }
                        }
                    }
                }
            }
        },
        {
            name: 'variant-added-both-sides',
            blurb: 'Both sides add a variant with the same id but different content — an add/add conflict.',
            base: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                }
            },
            fork: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    },
                    daily: { name: 'Daily', templates: { morning: { id: 'morning', elements: [] } } }
                }
            },
            upstream: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    },
                    daily: { name: 'Daily', templates: { evening: { id: 'evening', elements: [] } } }
                }
            }
        },
        {
            name: 'generator-conflict',
            blurb: 'Both sides changed the generator source. It is one atomic value — never line-merged.',
            base: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                },
                generator: {
                    formatVersion: 1,
                    templateScript: '// base',
                    hierarchyScript: '// h',
                    generatedAt: '2026-08-07T00:00:00.000Z'
                }
            },
            fork: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                },
                generator: {
                    formatVersion: 1,
                    templateScript: '// fork',
                    hierarchyScript: '// h',
                    generatedAt: '2026-08-07T00:00:00.000Z'
                }
            },
            upstream: {
                nodes: {
                    root: { id: 'root', name: 'Planner', children: ['week'] },
                    week: { id: 'week', name: 'Week 1', children: [] }
                },
                rootId: 'root',
                variants: {
                    weekly: {
                        name: 'Weekly',
                        templates: {
                            day: { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
                            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] }
                        }
                    }
                },
                generator: {
                    formatVersion: 1,
                    templateScript: '// upstream',
                    hierarchyScript: '// h',
                    generatedAt: '2026-08-07T00:00:00.000Z'
                }
            }
        },
    ],
    // Every `answers` path is a real file, and every claim below was re-checked
    // against the tree before shipping. Where a behavior genuinely spans files
    // (decide vs. enforce) the array lists both.
    wdil: [
        { id: 'svg-sanitize', prompt: 'Someone published a malicious SVG. Which file makes sure it can’t run in your browser?',
          answers: ['components/canvas/CanvasElement.tsx'], hint: 'Sanitize at the render site, not at upload.' },
        { id: 'signup-cap', prompt: 'Where is the signup cap counted, decided, and enforced?',
          answers: ['server/signupCap.js', 'server/auth.js'], hint: 'The decision is a module; the enforcement is a hook.' },
        { id: 'conflict-rules', prompt: 'Which file decides that remove-vs-modify is a merge conflict?',
          answers: ['shared/diff.js'], hint: 'It sits in shared/, but only the server imports it — the client just renders the ChangeSet it gets back.' },
        { id: 'save-cas', prompt: 'A stale save gets a 409 instead of overwriting. Where is that compare-and-swap?',
          answers: ['server/routes/projects.js'], hint: 'The biggest route file.' },
        { id: 'text-wrap', prompt: 'Where is the decision made about where a long line of text wraps?',
          answers: ['services/textLayout.ts'], hint: 'One engine, two renderers.' },
        { id: 'session-trigger', prompt: 'A suspended user’s new session is refused by the database itself. Where does that guard live?',
          answers: ['server/migrations/index.js'], hint: 'It’s DDL, not route code.' },
        { id: 'typed-api', prompt: 'A component needs to call a server endpoint. Which file should it import from?',
          answers: ['services/cloudApi.ts'], hint: 'One typed wrapper around fetch — it throws ApiError so callers never read res.status.' },
        { id: 'email-fallback', prompt: 'With no email key configured, verification links print to the console. Where?',
          answers: ['server/email.js'], hint: 'Fail-safe by design.' },
        { id: 'card-rollover', prompt: 'Gallery and profile cards cycle their preview pages on hover. Which component runs that cycle?',
          answers: ['components/gallery/RollingPreview.tsx'], hint: 'Not the card — the card only hands it the thumbnail ids. This one owns the timer, and checks prefers-reduced-motion first.' },
        { id: 'sandbox', prompt: 'Generator Preview runs untrusted code. Which file is the cage?',
          answers: ['services/generatorSandbox.ts'], hint: 'iframe + worker + captured intrinsics.' },
    ],
};
