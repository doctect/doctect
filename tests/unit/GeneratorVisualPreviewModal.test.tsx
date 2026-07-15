import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratorVisualPreviewModal } from '../../components/GeneratorVisualPreviewModal';
import type { GeneratorPreviewPayload } from '../../services/generatorVisualPreview';
import type { PageTemplate } from '../../types';

vi.mock('../../components/canvas/ReadOnlyPagePreview', () => ({
  ReadOnlyPagePreview: ({ template, currentNodeId }: any) => {
    if (template.id === 'broken') throw new Error('Preview exploded.');
    return (
      <div data-testid={`live-preview-${template.id}`} data-node-id={currentNodeId}>
        {template.name}
      </div>
    );
  },
}));

const template = (id: string): PageTemplate => ({
  id,
  name: `Template ${id.replace('template-', '')}`,
  width: 500,
  height: 700,
  layers: [],
  elements: [],
});

const makePayload = (activeTemplateCount = 25, broken = false): GeneratorPreviewPayload => {
  const activeTemplates = Object.fromEntries(
    Array.from({ length: activeTemplateCount }, (_, index) => {
      const id = broken && index === 1 ? 'broken' : `template-${index}`;
      return [id, template(id)];
    }),
  );
  return {
    project: {
      schemaVersion: 9,
      rootId: 'root',
      activeVariantId: 'primary',
      nodes: {
        root: { id: 'root', parentId: null, type: 'template-0', title: 'Cover page', data: {}, children: ['chapter', 'chapter-2'] },
        chapter: { id: 'chapter', parentId: 'root', type: broken ? 'broken' : 'template-1', title: 'First chapter', data: {}, children: [] },
        'chapter-2': { id: 'chapter-2', parentId: 'root', type: broken ? 'broken' : 'template-1', title: 'Second chapter', data: {}, children: [] },
      },
      variants: {
        primary: { id: 'primary', name: 'Primary', templates: activeTemplates },
        compact: {
          id: 'compact',
          name: 'Compact',
          templates: {
            'compact-0': { ...template('compact-0'), name: 'Compact cover' },
            'compact-1': { ...template('compact-1'), name: 'Compact body' },
          },
        },
      },
    },
    summary: {
      variantCount: 2,
      variantNames: ['Primary', 'Compact'],
      templateCount: activeTemplateCount + 2,
      nodeCount: 3,
      estimatedPageCount: 3,
      warnings: [],
    },
    source: {
      formatVersion: 1,
      templateScript: 'return templates;',
      hierarchyScript: 'return hierarchy;',
    },
  };
};

const renderModal = (overrides: Record<string, unknown> = {}, payload = makePayload()) => {
  const props = {
    payload,
    currentProjectName: 'Current',
    onBack: vi.fn(),
    onReplace: vi.fn(() => true),
    onCreateProject: vi.fn(() => true),
    ...overrides,
  };
  const view = render(<GeneratorVisualPreviewModal {...props} />);
  return { ...view, props };
};

describe('GeneratorVisualPreviewModal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows generated counts and selects variants with ArrowRight', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Generated Project Preview' })).toBeVisible();
    expect(screen.getByText('Primary variant')).toBeVisible();
    expect(screen.getByText('2 variants')).toBeVisible();
    expect(screen.getByText('27 templates')).toBeVisible();
    expect(screen.getByText('3 nodes')).toBeVisible();
    expect(screen.getByText('3 estimated pages')).toBeVisible();

    const primary = screen.getByRole('tab', { name: 'Primary' });
    const compact = screen.getByRole('tab', { name: 'Compact' });
    expect(primary).toHaveAttribute('aria-selected', 'true');
    primary.focus();
    fireEvent.keyDown(primary, { key: 'ArrowRight' });

    expect(compact).toHaveAttribute('aria-selected', 'true');
    expect(compact).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Compact' })).toHaveAttribute('id', compact.getAttribute('aria-controls'));
  });

  it('links tabs to panels with safe DOM IDs when variant IDs contain whitespace', () => {
    const payload = makePayload(2);
    const primary = payload.project.variants.primary;
    const compact = payload.project.variants.compact;
    payload.project.activeVariantId = 'primary wide';
    payload.project.variants = {
      'primary wide': { ...primary, id: 'primary wide' },
      'compact wide': { ...compact, id: 'compact wide' },
    };
    renderModal({}, payload);

    const tab = screen.getByRole('tab', { name: 'Primary' });
    const panel = screen.getByRole('tabpanel', { name: 'Primary' });
    const panelId = tab.getAttribute('aria-controls');

    expect(panelId).not.toMatch(/\s/);
    expect(panel).toHaveAttribute('id', panelId);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('mounts previews in exact batches of 24', () => {
    renderModal();

    expect(screen.getAllByTestId(/^live-preview-template-/)).toHaveLength(24);
    expect(screen.queryByTestId('live-preview-template-24')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(screen.getAllByTestId(/^live-preview-template-/)).toHaveLength(25);
    expect(screen.getByTestId('live-preview-template-24')).toBeVisible();
  });

  it('labels used and unused cards and supplies synthetic nodes only to unused previews', () => {
    renderModal();

    const usedCard = screen.getByRole('button', { name: 'Template 1, Primary, 2 uses' });
    expect(within(usedCard).getByText('First chapter')).toBeVisible();
    expect(within(usedCard).getByText('2 uses')).toBeVisible();
    expect(screen.getByTestId('live-preview-template-1')).toHaveAttribute('data-node-id', 'chapter');

    const unusedCard = screen.getByRole('button', { name: 'Template 2, Primary, unused' });
    expect(within(unusedCard).getByText('Unused')).toBeVisible();
    expect(screen.getByTestId('live-preview-template-2').getAttribute('data-node-id')).toMatch(/^generator-preview-/);
  });

  it('navigates the lightbox and restores thumbnail focus when Escape closes it', () => {
    const { props } = renderModal();
    const mainDialog = screen.getByRole('dialog', { name: 'Generated Project Preview' });
    expect(mainDialog).not.toHaveAttribute('inert');
    expect(mainDialog).not.toHaveAttribute('aria-hidden');
    const card = screen.getByRole('button', { name: 'Template 0, Primary, 1 use' });
    fireEvent.click(card);

    const lightbox = screen.getByRole('dialog', { name: 'Template 0 preview' });
    expect(mainDialog).toHaveAttribute('inert');
    expect(mainDialog).toHaveAttribute('aria-hidden', 'true');
    expect(lightbox).not.toHaveAttribute('inert');
    expect(lightbox).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
    expect(within(lightbox).getByText('Cover page')).toBeVisible();
    fireEvent.keyDown(lightbox, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Template 1 preview' })).toBeVisible();

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Template 1 preview' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /Template \d+ preview/ })).not.toBeInTheDocument();
    expect(mainDialog).not.toHaveAttribute('inert');
    expect(mainDialog).not.toHaveAttribute('aria-hidden');
    expect(card).toHaveFocus();
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it('wraps focus forward and backward within the lightbox', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Template 0, Primary, 1 use' }));
    const lightbox = screen.getByRole('dialog', { name: 'Template 0 preview' });
    const close = within(lightbox).getByRole('button', { name: 'Close' });
    const next = within(lightbox).getByRole('button', { name: 'Next' });

    next.focus();
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(next).toHaveFocus();
  });

  it('routes main Escape only to Back and invokes replacement directly', () => {
    const { props } = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Generated Project Preview' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(props.onBack).toHaveBeenCalledOnce();
    expect(props.onReplace).not.toHaveBeenCalled();
    expect(props.onCreateProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Replace Current Project' }));
    expect(props.onReplace).toHaveBeenCalledOnce();
  });

  it('validates, trims, and submits the generated project name', () => {
    const { props } = renderModal();
    const mainDialog = screen.getByRole('dialog', { name: 'Generated Project Preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Create New Project' }));

    const namingDialog = screen.getByRole('dialog', { name: 'Create Generated Project' });
    expect(mainDialog).toHaveAttribute('inert');
    expect(mainDialog).toHaveAttribute('aria-hidden', 'true');
    expect(namingDialog).not.toHaveAttribute('inert');
    expect(namingDialog).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('dialog', { name: 'Generated Project Preview' })).not.toBeInTheDocument();
    const input = within(namingDialog).getByRole('textbox', { name: 'Project name' });
    expect(input).toHaveValue('Current – Generated');
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(within(namingDialog).getByRole('button', { name: 'Create Project' }));
    expect(within(namingDialog).getByRole('alert')).toHaveTextContent('Project name is required.');

    fireEvent.change(input, { target: { value: 'x'.repeat(101) } });
    fireEvent.click(within(namingDialog).getByRole('button', { name: 'Create Project' }));
    expect(within(namingDialog).getByRole('alert')).toHaveTextContent('Project name must be 100 characters or fewer.');

    fireEvent.change(input, { target: { value: '  Generated copy  ' } });
    fireEvent.click(within(namingDialog).getByRole('button', { name: 'Create Project' }));
    expect(props.onCreateProject).toHaveBeenCalledWith('Generated copy');
  });

  it('keeps naming open and reports callback failure', () => {
    const { props } = renderModal({ onCreateProject: vi.fn(() => false) });
    fireEvent.click(screen.getByRole('button', { name: 'Create New Project' }));
    const namingDialog = screen.getByRole('dialog', { name: 'Create Generated Project' });

    fireEvent.click(within(namingDialog).getByRole('button', { name: 'Create Project' }));

    expect(props.onCreateProject).toHaveBeenCalledWith('Current – Generated');
    expect(within(namingDialog).getByRole('alert')).toHaveTextContent('Could not create project. Try again.');
  });

  it('isolates preview render failures without disabling project actions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderModal({}, makePayload(3, true));

    expect(screen.getByRole('status')).toHaveTextContent('Could not render Template broken');
    expect(screen.getByRole('button', { name: 'Create New Project' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace Current Project' })).toBeEnabled();
    expect(screen.getByTestId('live-preview-template-0')).toBeVisible();
  });

  it('traps and restores focus in the main and naming dialogs', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open preview';
    document.body.appendChild(opener);
    opener.focus();
    const view = renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Generated Project Preview' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
    focusable.at(-1)!.focus();
    fireEvent.keyDown(focusable.at(-1)!, { key: 'Tab' });
    expect(focusable[0]).toHaveFocus();

    const createButton = screen.getByRole('button', { name: 'Create New Project' });
    fireEvent.click(createButton);
    const namingDialog = screen.getByRole('dialog', { name: 'Create Generated Project' });
    const namingButtons = within(namingDialog).getAllByRole('button');
    namingButtons.at(-1)!.focus();
    fireEvent.keyDown(namingButtons.at(-1)!, { key: 'Tab' });
    expect(within(namingDialog).getByRole('textbox', { name: 'Project name' })).toHaveFocus();
    fireEvent.keyDown(namingDialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Create Generated Project' })).not.toBeInTheDocument();
    expect(createButton).toHaveFocus();

    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('does not mutate validated payload while browsing previews', () => {
    const payload = makePayload();
    const before = structuredClone(payload);
    renderModal({}, payload);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Compact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compact cover, Compact, unused' }));

    expect(payload).toEqual(before);
  });
});
