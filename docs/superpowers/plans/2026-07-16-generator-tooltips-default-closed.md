# Generator Tooltips Default-Closed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Template Structure and Node Structure help panels start closed whenever Hierarchy Generator opens while preserving hover, pin, close, and remount behavior.

**Architecture:** Keep shared `InfoTooltip` state and interactions unchanged. Remove `defaultPinned={true}` only from two generator call sites, with RTL coverage driving and verifying behavior.

**Tech Stack:** React 19, TypeScript, React Testing Library `fireEvent`, Vitest 4, Vite 6

## Global Constraints

- **Template Structure** and **Node Structure** start closed whenever the generator opens.
- Hovering over either help control temporarily shows its tooltip.
- Clicking a help control pins its tooltip; its close control unpins it.
- Closing and reopening the generator starts with both tooltips closed again.
- No preference, storage field, or settings control is added.
- Tooltip content, placement, accessibility behavior, and other generator help remain unchanged.
- Remove the two default-pinned inputs in `components/HierarchyGeneratorModal.tsx`. Do not change the shared `InfoTooltip` interaction model or generator state persistence.
- Existing generator preview, source persistence, focus, and accessibility tests must continue to pass.

---

### Task 1: Default Generator Tooltips Closed

**Files:**
- Modify: `components/HierarchyGeneratorModal.tsx:2378-2415`
- Test: `tests/unit/HierarchyGeneratorModal.test.tsx:75`
- Reference only: `docs/superpowers/specs/2026-07-16-generator-tooltips-default-closed-design.md`

**Interfaces:**
- Consumes: existing internal `InfoTooltipProps` with `title: string`, `pinnedPosition: { bottom?: number; right?: number; left?: number; top?: number }`, and optional `defaultPinned?: boolean`; existing accessible help names `Template Structure help` and `Node Structure help`.
- Produces: no new exported interface; both call sites rely on existing `defaultPinned = false`, while existing hover, click-to-pin, and `Close ${title}` controls remain intact.

- [ ] **Step 1: Write focused failing component coverage**

Insert this test immediately after `beforeEach` in `tests/unit/HierarchyGeneratorModal.test.tsx`:

```tsx
    it('starts structure help closed and resets it after remount', () => {
        const props = {
            isOpen: true,
            projectName: 'Current Project',
            savedGenerator: saved,
            onClose: vi.fn(),
            onApplyGenerated: vi.fn(() => true),
            onCreateGeneratedProject: vi.fn(() => true),
        };
        const view = render(<HierarchyGeneratorModal {...props} />);
        const templateHelp = screen.getByRole('button', { name: 'Template Structure help' });
        const nodeHelp = screen.getByRole('button', { name: 'Node Structure help' });

        expect(screen.queryByText('Templates define page layouts')).not.toBeInTheDocument();
        expect(screen.queryByText('Nodes are your pages/content')).not.toBeInTheDocument();

        fireEvent.mouseEnter(templateHelp);
        expect(screen.getByText('Templates define page layouts')).toBeVisible();
        fireEvent.mouseLeave(templateHelp);
        expect(screen.queryByText('Templates define page layouts')).not.toBeInTheDocument();

        fireEvent.mouseEnter(nodeHelp);
        expect(screen.getByText('Nodes are your pages/content')).toBeVisible();
        fireEvent.mouseLeave(nodeHelp);
        expect(screen.queryByText('Nodes are your pages/content')).not.toBeInTheDocument();

        fireEvent.click(templateHelp);
        fireEvent.mouseLeave(templateHelp);
        expect(screen.getByText('Templates define page layouts')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Close Template Structure' }));
        expect(screen.queryByText('Templates define page layouts')).not.toBeInTheDocument();

        fireEvent.click(nodeHelp);
        fireEvent.mouseLeave(nodeHelp);
        expect(screen.getByText('Nodes are your pages/content')).toBeVisible();

        view.unmount();
        render(<HierarchyGeneratorModal {...props} />);
        expect(screen.queryByText('Templates define page layouts')).not.toBeInTheDocument();
        expect(screen.queryByText('Nodes are your pages/content')).not.toBeInTheDocument();
    });
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx`

Expected: FAIL in `starts structure help closed and resets it after remount`; initial `Templates define page layouts` absence assertion fails because current call site passes `defaultPinned={true}`.

- [ ] **Step 3: Remove only two default-pinned inputs**

In `components/HierarchyGeneratorModal.tsx`, replace two opening tags and leave their content and all `InfoTooltip` internals unchanged:

```tsx
              <InfoTooltip position="below" title="Template Structure" pinnedPosition={{ bottom: 200, left: 40 }} content={
```

```tsx
              <InfoTooltip position="below" title="Node Structure" pinnedPosition={{ bottom: 200, right: 40 }} content={
```

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx`

Expected: exit 0; all `HierarchyGeneratorModal` tests pass, including initial closed state, hover visibility, pin/close behavior, and closed state after remount.

- [ ] **Step 5: Run full regression suite**

Run: `npx vitest run`

Expected: exit 0; all Vitest suites pass with no generator preview, source persistence, focus, or accessibility regressions.

- [ ] **Step 6: Build production bundle**

Run: `npm run build`

Expected: exit 0; Vite reports a successful production build with no TypeScript or bundling errors.

- [ ] **Step 7: Commit tested behavior**

```bash
git add components/HierarchyGeneratorModal.tsx tests/unit/HierarchyGeneratorModal.test.tsx \
  docs/superpowers/specs/2026-07-16-generator-tooltips-default-closed-design.md \
  docs/superpowers/plans/2026-07-16-generator-tooltips-default-closed.md
git commit -m "fix: close generator tooltips by default"
```

Expected: one commit containing only approved tooltip documentation, two tooltip call-site changes, and focused component coverage.
