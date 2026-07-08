import { describe, it, expect } from 'vitest';
import { generatePDF } from '../../services/pdfService';
import { AppState } from '../../types';

// NOTE on fontFamily: pdfService registers 'helvetica' (and every other named
// family) in FONT_URLS, so it embeds a TTF subset and writes text as hex glyph
// codes — the literal string never appears in the output bytes. Using a family
// that is NOT in FONT_URLS makes doc.setFont() throw and fall back to jsPDF's
// built-in helvetica, which writes plain-text `(TEXT) Tj`. That keeps this a
// real end-to-end export test whose bytes we can assert on, offline.
const textEl = (id: string, text: string, layerId: string, zIndex: number) => ({
    id, type: 'text' as const, x: 20, y: 20 + zIndex * 30, w: 400, h: 24, rotation: 0,
    fill: '', stroke: '', strokeWidth: 0, opacity: 1,
    text, fontSize: 14, fontFamily: '__builtin_fallback__', textColor: '#000000',
    layerId, zIndex,
});

const state: AppState = {
    schemaVersion: 8,
    nodes: { root: { id: 'root', parentId: null, type: 'page', title: 'Root', data: {}, children: [] } },
    rootId: 'root',
    activeVariantId: 'default',
    variants: {
        default: {
            id: 'default', name: 'Default',
            templates: {
                page: {
                    id: 'page', name: 'Page', width: 500, height: 700,
                    layers: [
                        { id: 'back', name: 'Back', order: 0, visible: true, locked: false },
                        { id: 'front', name: 'Front', order: 1, visible: true, locked: false },
                        { id: 'ghost', name: 'Ghost', order: 2, visible: false, locked: false },
                    ],
                    elements: [
                        textEl('t-front', 'FRONTLAYERTEXT', 'front', 1),
                        textEl('t-hidden', 'HIDDENLAYERTEXT', 'ghost', 1),
                        textEl('t-back', 'BACKLAYERTEXT', 'back', 9),
                    ],
                },
            },
        },
    },
    viewMode: 'hierarchy', selectedNodeId: 'root', selectedNodeIds: ['root'],
    selectedTemplateId: 'page', selectedTemplateIds: ['page'], selectedElementIds: [],
    scale: 1, tool: 'select', showJsonModal: false,
    sidebarWidth: 288, propertiesPanelWidth: 320, snapToGrid: false, showGrid: false,
    showNodeSelector: false, nodeSelectorMode: 'grid_source', editingElementId: null,
    clipboard: [],
} as unknown as AppState;

describe('PDF export layer handling', () => {
    it('excludes hidden-layer elements and draws back layers before front layers', async () => {
        const buf = (await generatePDF(state, { output: 'arraybuffer' })) as ArrayBuffer;
        const pdf = new TextDecoder('latin1').decode(new Uint8Array(buf));

        expect(pdf).toContain('FRONTLAYERTEXT');
        expect(pdf).toContain('BACKLAYERTEXT');
        expect(pdf).not.toContain('HIDDENLAYERTEXT');
        // back layer (order 0, even with zIndex 9) is drawn BEFORE front layer (order 1, zIndex 1)
        expect(pdf.indexOf('BACKLAYERTEXT')).toBeLessThan(pdf.indexOf('FRONTLAYERTEXT'));
    });
});
