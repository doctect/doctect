# Login Redirect Fix + Gallery Zip PDF Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/login` to return users to the page they came from instead of always redirecting to `/analytics`, and add a "download all variant PDFs as a zip" button to the public gallery's project detail page.

**Architecture:** Standard React Router "return to origin" pattern via `location.state.from` for the redirect fix. For the zip download, a new `generateVariantsZip`/`downloadVariantsZip` pair in `services/pdfService.ts` reuses the existing `generatePDF(state, { variantId, output: 'arraybuffer' })` mode (already used by `services/thumbnailService.ts`) to build one PDF per variant, packages them with `jszip`, and triggers a single browser download — avoiding the multi-file download permission prompt that N separate sequential downloads would trigger.

**Tech Stack:** React 19 + TypeScript, React Router 6, `jszip` (new dependency), existing `generatePDF`/`AppState` types.

## Global Constraints

- Client files are TypeScript.
- Commit style: `fix(scope): message` for the redirect fix, `feat(scope): message` for the zip download.
- The `from` redirect value is always a plain string pathname, never a full `Location` object — every call site normalizes to this one shape.
- Follow existing code style exactly (Tailwind classes, `lucide-react` icons, existing component patterns) — don't introduce new UI conventions for a change this size.

---

### Task 1: Login redirect returns to the page you came from

**Files:**
- Modify: `App.tsx` (AuthGuard, ~line 49-56)
- Modify: `pages/LoginPage.tsx` (full file, 187 lines)
- Modify: `components/AccountMenu.tsx` (full file, 44 lines)
- Modify: `components/cloud/CloudMenu.tsx` (imports + one Link, ~line 1-10, 72)
- Modify: `pages/GalleryDetailPage.tsx` (imports + one Link, ~line 1-19, 108)
- Test: `tests/unit/loginRedirect.test.tsx`

**Interfaces:**
- Produces: `LoginPage` reads `useLocation().state?.from as string | undefined` and navigates there (default `/app`) after a successful sign-in/sign-up, instead of always `/analytics`.
- Consumes: nothing new — `useLocation`/`useNavigate`/`Navigate` from `react-router-dom` (already a dependency), `signIn`/`signUp` from `../lib/auth-client` (unchanged).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/loginRedirect.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

vi.mock('../../lib/auth-client', () => ({
    signIn: {
        email: vi.fn((_creds: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); }),
        social: vi.fn(),
    },
    signUp: {
        email: vi.fn((_creds: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); }),
    },
}));

const renderAt = (initialEntries: any[]) => render(
    <MemoryRouter initialEntries={initialEntries}>
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/gallery/xyz" element={<div>GALLERY_DETAIL_MARKER</div>} />
            <Route path="/app" element={<div>APP_MARKER</div>} />
        </Routes>
    </MemoryRouter>
);

const fillAndSubmitSignIn = (container: HTMLElement) => {
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    const password = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'a@b.com' } });
    fireEvent.change(password, { target: { value: 'password1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
};

describe('LoginPage redirect behavior', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns to the page the user came from after sign-in', async () => {
        const { container } = renderAt([{ pathname: '/login', state: { from: '/gallery/xyz' } }]);
        fillAndSubmitSignIn(container);
        expect(await screen.findByText('GALLERY_DETAIL_MARKER')).toBeInTheDocument();
    });

    it('defaults to /app when there is no "from" state', async () => {
        const { container } = renderAt(['/login']);
        fillAndSubmitSignIn(container);
        expect(await screen.findByText('APP_MARKER')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/loginRedirect.test.tsx`
Expected: FAIL — both tests time out waiting for their marker text (the real `LoginPage` still always calls `navigate('/analytics')`, which has no matching `<Route>` in the test harness, so neither marker ever renders).

- [ ] **Step 3: Fix `App.tsx`'s `AuthGuard`**

`useLocation` is already imported at the top of `App.tsx` (used by `PageTracker`). Change the `AuthGuard` function:

```tsx
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error } = useSession();
  const location = useLocation();

  if (isPending) return <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} />;
  }
```

(Only the `useLocation()` line and the `<Navigate>` line change; everything else in `AuthGuard` stays the same.)

- [ ] **Step 4: Fix `pages/LoginPage.tsx`**

Change the import line (currently `import { useNavigate } from 'react-router-dom';`) to:

```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```

Add, right after `const navigate = useNavigate();`:

```tsx
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from;
```

Replace both `onSuccess: () => { navigate('/analytics'); }` call sites (one in the `signIn.email` block, one in `signUp.email`) with:

```tsx
                    onSuccess: () => {
                        navigate(from ?? '/app', { replace: true });
                    },
```

Replace the Google button's `onClick` handler body:

```tsx
                        onClick={async () => {
                            await signIn.social({
                                provider: "google",
                                callbackURL: window.location.origin + (from ?? '/app')
                            });
                        }}
```

- [ ] **Step 5: Fix `components/AccountMenu.tsx`**

Change the import line (currently `import { Link } from 'react-router-dom';`) to:

```tsx
import { Link, useLocation } from 'react-router-dom';
```

Add, right after `export function AccountMenu() {`:

```tsx
    const location = useLocation();
```

Change the signed-out return:

```tsx
        return <Link to="/login" state={{ from: location.pathname }} className="text-xs font-medium text-slate-500 hover:text-blue-600">Sign in</Link>;
```

- [ ] **Step 6: Fix `components/cloud/CloudMenu.tsx`**

Change the import line (currently `import { Link } from 'react-router-dom';`) to:

```tsx
import { Link, useLocation } from 'react-router-dom';
```

Add, near the component's other hooks (alongside `useSession()`/`useState`/`useRef` at the top of the `CloudMenu` function body):

```tsx
    const location = useLocation();
```

Change the "Sign in to save to cloud" link:

```tsx
                        <Link to="/login" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
```

- [ ] **Step 7: Fix `pages/GalleryDetailPage.tsx`**

Change the import line (currently `import { Link, useNavigate, useParams } from 'react-router-dom';`) to:

```tsx
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
```

Add, right after `const navigate = useNavigate();`:

```tsx
    const location = useLocation();
```

Change the "Sign in to fork" link:

```tsx
                            <Link to="/login" state={{ from: location.pathname }} className="text-center text-xs text-slate-500 hover:text-blue-600">Sign in to fork</Link>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/unit/loginRedirect.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Run the full unit suite**

Run: `npx vitest run`
Expected: all pre-existing tests (77 as of the last full run) plus the 2 new ones pass, zero regressions.

- [ ] **Step 10: Commit**

```bash
git add App.tsx pages/LoginPage.tsx components/AccountMenu.tsx components/cloud/CloudMenu.tsx pages/GalleryDetailPage.tsx tests/unit/loginRedirect.test.tsx
git commit -m "fix(auth): return to the originating page after sign-in instead of always /analytics"
```

---

### Task 2: `generateVariantsZip` — package one PDF per variant into a zip

**Files:**
- Modify: `services/pdfService.ts` (add two new exports near the existing `generatePDF`, ~line 744+)
- Modify: `package.json` (add `jszip`)
- Test: `tests/unit/generateVariantsZip.test.ts`

**Interfaces:**
- Produces: `generateVariantsZip(state: AppState, projectName: string): Promise<Blob>` (the zip archive, one `<sanitized-variant-name>.pdf` entry per key in `state.variants`, collision-safe); `downloadVariantsZip(state: AppState, projectName: string): Promise<void>` (generates the zip and triggers one browser download of it, named `<projectName>_all_variants.zip`).
- Consumes: the existing `generatePDF(state, options)` export from the same file (`output: 'arraybuffer'` mode, already used by `services/thumbnailService.ts`).

- [ ] **Step 1: Install `jszip`**

Run: `npm install jszip --legacy-peer-deps` (this project's `better-auth`/`better-sqlite3` peer-dependency mismatch requires `--legacy-peer-deps` for every install — see `docs/superpowers/plans/2026-07-02-gallery-fork-merge-requests.md`'s Global Constraints for the same note). Confirm `"jszip"` appears under `dependencies` in `package.json`. `jszip` ships its own TypeScript types (no separate `@types/jszip` package needed) — confirm via `ls node_modules/jszip/index.d.ts`.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/generateVariantsZip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateVariantsZip } from '../../services/pdfService';

const baseTemplate = { id: 'page', name: 'Page', width: 400, height: 300, elements: [] };

const twoVariantState: any = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: {
        rm: { id: 'rm', name: 'reMarkable', templates: { page: baseTemplate } },
        ipad: { id: 'ipad', name: 'iPad', templates: { page: baseTemplate } },
    },
    activeVariantId: 'rm',
};

describe('generateVariantsZip', () => {
    it('produces a zip with one PDF entry per variant, named after the variant', async () => {
        const blob = await generateVariantsZip(twoVariantState, 'My Planner');
        const zip = await JSZip.loadAsync(blob);
        expect(Object.keys(zip.files).sort()).toEqual(['iPad.pdf', 'reMarkable.pdf']);
        const bytes = await zip.file('reMarkable.pdf')!.async('uint8array');
        expect(bytes.length).toBeGreaterThan(0);
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    });

    it('sanitizes filesystem-unsafe characters and dedupes names that would collide', async () => {
        const collidingState: any = {
            ...twoVariantState,
            variants: {
                a: { id: 'a', name: 'A/B Test', templates: { page: baseTemplate } },
                b: { id: 'b', name: 'A:B Test', templates: { page: baseTemplate } },
            },
        };
        const blob = await generateVariantsZip(collidingState, 'Proj');
        const zip = await JSZip.loadAsync(blob);
        expect(Object.keys(zip.files).sort()).toEqual(['A_B Test.pdf', 'A_B Test_2.pdf']);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/generateVariantsZip.test.ts`
Expected: FAIL — `generateVariantsZip` is not exported yet.

- [ ] **Step 4: Implement in `services/pdfService.ts`**

Add `import JSZip from 'jszip';` near the top of the file, alongside the other imports. Add the two new exports after the existing `generatePDF` function (end of file):

```ts
/**
 * Renders one PDF per variant in `state.variants` (reusing the existing `generatePDF`
 * arraybuffer mode) and packages them into a single zip archive. Does not trigger a
 * download itself — see `downloadVariantsZip` for that.
 */
export const generateVariantsZip = async (state: AppState, projectName: string): Promise<Blob> => {
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const variantId of Object.keys(state.variants)) {
        const variant = state.variants[variantId];
        const buffer = (await generatePDF(state, { variantId, projectName, output: 'arraybuffer' })) as ArrayBuffer;
        let fileName = (variant.name || variantId).replace(/[\\/:*?"<>|]+/g, '_').trim() || variantId;
        if (usedNames.has(fileName)) {
            let n = 2;
            while (usedNames.has(`${fileName}_${n}`)) n++;
            fileName = `${fileName}_${n}`;
        }
        usedNames.add(fileName);
        zip.file(`${fileName}.pdf`, buffer);
    }
    return zip.generateAsync({ type: 'blob' });
};

/** Generates the zip (see `generateVariantsZip`) and triggers a single browser download of it. */
export const downloadVariantsZip = async (state: AppState, projectName: string): Promise<void> => {
    const blob = await generateVariantsZip(state, projectName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_all_variants.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/generateVariantsZip.test.ts`
Expected: PASS (2 tests). If jsdom's environment raises an error from `generatePDF`'s internals when called directly in a unit test (unlikely for a zero-element template, since no font-loading or Canvas/SVG code path is reached — but this file's own existing tests all run under jsdom, so this is untested territory for a full `generatePDF` call), investigate the specific error and adapt the test fixture (not the source function) to avoid it — e.g. an even more minimal template — rather than skipping the test.

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: all pre-existing tests plus the 2 new ones pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json services/pdfService.ts tests/unit/generateVariantsZip.test.ts
git commit -m "feat(pdf): generateVariantsZip/downloadVariantsZip — package all variant PDFs into one zip"
```

---

### Task 3: "Download all variants" button on the gallery detail page

**Files:**
- Modify: `pages/GalleryDetailPage.tsx` (add button + handler; this file was already touched in Task 1 for the login redirect — these are additive changes on top of that)

**Interfaces:**
- Consumes: `downloadVariantsZip` from `services/pdfService.ts` (Task 2), `cloudApi.galleryState(id)` (already used by the existing `openInEditor` handler in this same file).

- [ ] **Step 1: Add the import and handler**

Add to the import list at the top of `pages/GalleryDetailPage.tsx`:

```tsx
import { downloadVariantsZip } from '../services/pdfService';
```

Add a new handler function alongside the existing `openInEditor`/`fork`/`report` functions:

```tsx
    const downloadAllVariants = async () => {
        if (!id || !project) return;
        setBusy('download');
        try {
            const res = await cloudApi.galleryState(id);
            await downloadVariantsZip(res.state, res.name);
        } catch {
            setError('Could not generate the PDF download');
        } finally {
            setBusy(null);
        }
    };
```

- [ ] **Step 2: Add the button**

In the button column (the `<div className="flex flex-col gap-2 mt-6 max-w-xs">` block), add a new button right after the existing "Open in editor" button and before the fork/sign-in-to-fork block:

```tsx
                        <button onClick={downloadAllVariants} disabled={busy !== null}
                            className="flex items-center justify-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                            <Download size={14} /> {busy === 'download' ? 'Generating…' : 'Download all variants (.zip)'}
                        </button>
```

(`Download` is already imported from `lucide-react` at the top of this file — it's already used for the download-count stat display.)

- [ ] **Step 3: Manual verification in a real browser**

Start the dev server (`npm run dev`), publish a project with at least two variants (or use an existing published multi-variant project), open its gallery detail page as an anonymous (logged-out) browser session, click "Download all variants (.zip)", and confirm: (a) exactly one `.zip` file downloads (no per-variant browser download prompts), (b) opening the zip shows one `.pdf` per variant named after the variant, (c) each PDF opens correctly and matches that variant's actual page dimensions/content.

- [ ] **Step 4: Full repo verification**

Run: `npx vitest run` — expect all tests (81 as of Tasks 1+2, assuming no other changes) passing.
Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run build` — expect a clean production build.

- [ ] **Step 5: Commit**

```bash
git add pages/GalleryDetailPage.tsx
git commit -m "feat(gallery): add 'download all variants' zip button to the project detail page"
```
