import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState, Variant } from '../../types';

// Same child-mock set as ProjectEditor.generatorHistory.test.tsx: the export
// split button under test lives in ProjectEditor's OWN header JSX, so every
// heavy child can be stubbed out.
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => <div /> }));
vi.mock('../../components/Canvas', () => ({ Canvas: () => <div /> }));
vi.mock('../../components/PropertiesPanel', () => ({ PropertiesPanel: () => <div /> }));
vi.mock('../../components/LayersPanel', () => ({ LayersPanel: () => <div /> }));
vi.mock('../../components/CollapsibleSection', () => ({ CollapsibleSection: () => <div /> }));
vi.mock('../../components/JsonModal', () => ({ JsonModal: () => null }));
vi.mock('../../components/NodeSelectorModal', () => ({ NodeSelectorModal: () => null }));
vi.mock('../../components/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }));
vi.mock('../../components/SavePresetModal', () => ({ SavePresetModal: () => null }));
vi.mock('../../components/NewVariantModal', () => ({ NewVariantModal: () => null }));
vi.mock('../../components/EditorToolbar', () => ({ EditorToolbar: () => <div /> }));
vi.mock('../../components/HierarchyGeneratorModal', () => ({ HierarchyGeneratorModal: () => null }));

import { ProjectEditor } from '../../components/ProjectEditor';

const makeVariant = (id: string, name: string): Variant => ({
    id,
    name,
    templates: {
        page: {
            id: 'page',
            name: 'Page',
            width: 509,
            height: 679,
            layers: [{ id: `${id}-layer`, name: 'Default', order: 0, visible: true, locked: false }],
            elements: [],
        },
    },
});

const initialState = (variants: Record<string, Variant>): AppState => ({
    nodes: {
        root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] },
    },
    rootId: 'root',
    variants,
    activeVariantId: Object.keys(variants)[0],
    viewMode: 'hierarchy',
    selectedNodeId: 'root',
    selectedNodeIds: ['root'],
    selectedTemplateId: '',
    selectedTemplateIds: [],
    selectedElementIds: [],
    activeLayerId: `${Object.keys(variants)[0]}-layer`,
    scale: 1,
    tool: 'select',
    showJsonModal: false,
    sidebarWidth: 280,
    propertiesPanelWidth: 320,
    snapToGrid: true,
    showGrid: false,
    showNodeSelector: false,
    nodeSelectorMode: 'grid_source',
    editingElementId: null,
    clipboard: [],
    schemaVersion: 11,
});

const renderEditor = (variants: Record<string, Variant>) => render(
    <ProjectEditor
        projectId="export-tooltip-test"
        projectName="Export Tooltip Test"
        initialState={initialState(variants)}
        isActive
        onNameChange={vi.fn()}
        onStateChange={vi.fn()}
        onCreateGeneratedProject={vi.fn(() => true)}
    />,
);

describe('ProjectEditor Export All Variants button', () => {
    // handleExportPDF({ exportAllVariants: true }) loops generatePDF once per
    // variant id -- each call ends in its own doc.save(`${project}_${variantName}.pdf`)
    // download. Nothing on this button's path merges or zips (the zip helper,
    // downloadVariantsZip, exists in pdfService but is not wired to it), so the
    // tooltip must promise separate per-variant PDFs, not a merged one.
    it('tooltip says one PDF per variant, matching the real export behavior', () => {
        renderEditor({
            a: makeVariant('a', 'reMarkable'),
            b: makeVariant('b', 'A4'),
        });

        const button = screen.getByTitle('Export All Variants (one PDF per variant)');
        expect(button).toBeInTheDocument();
        expect(button).toBeEnabled();
    });

    it('is disabled when the project has a single variant', () => {
        renderEditor({ a: makeVariant('a', 'Only') });

        expect(screen.getByTitle('Export All Variants (one PDF per variant)')).toBeDisabled();
    });
});
