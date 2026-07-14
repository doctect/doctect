import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublishModal } from '../../components/cloud/PublishModal';

vi.mock('../../services/pdfService', () => ({ computePageOrder: () => ['root'] }));
vi.mock('../../services/thumbnailService', () => ({ generateThumbnails: vi.fn() }));

const generator = {
    formatVersion: 1 as const,
    templateScript: '  const café = "☕";\r\nreturn { café };\n',
    hierarchyScript: '\n\treturn { nodes: { "根": true } };\r\n',
    generatedAt: '2026-07-14T12:34:56.000Z',
};

const state = {
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    variants: { default: { id: 'default', name: 'Default', templates: { page: { id: 'page', name: 'Page', width: 500, height: 700, elements: [] } } } },
    activeVariantId: 'default',
    schemaVersion: 9,
};

const renderModal = (withGenerator: boolean) => render(
    <PublishModal
        project={{ id: 'local-1', name: 'Project', initialState: { ...state, ...(withGenerator ? { generator } : {}) } as any }}
        cloudProjectId="cloud-1"
        onClose={vi.fn()}
        onPublished={vi.fn()}
    />,
);

describe('PublishModal generator source warning', () => {
    it('warns that publishing saved generator scripts makes them public', () => {
        renderModal(true);
        expect(screen.getByRole('alert')).toHaveTextContent(
            'This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information. To exclude source, cancel, use “Detach Saved Generator” in Hierarchy Generator, and save to cloud before publishing.',
        );
    });

    it('does not show the generator warning for projects without saved source', () => {
        renderModal(false);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
