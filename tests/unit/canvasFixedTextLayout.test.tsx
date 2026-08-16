import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasElement } from '../../components/canvas/CanvasElement';
import { useCanvasTextLayoutSession } from '../../components/canvas/useCanvasTextLayoutSession';
import {
    createCanvasTextLayoutSession,
    resolveCanvasFontFamily,
    type CanvasTextLayoutSession,
} from '../../services/canvasTextLayout';
import type { TextLayoutRequest, TextLayoutResult } from '../../services/textLayout';
import type { AppNode, TemplateElement } from '../../types';
import { makeEl, makeLayer, renderCanvas } from './canvasTestUtils';

const nodes: Record<string, AppNode> = {
    root: {
        id: 'root',
        parentId: null,
        type: 'page',
        title: 'Root',
        data: { label: 'RESOLVED TEXT' },
        children: [],
    },
};

const baseRequest: TextLayoutRequest = {
    text: 'measure me',
    contentWidth: 200,
    contentHeight: 80,
    fontSize: 17,
    fontFamily: 'open-sans',
    fontWeight: 'bold',
    fontStyle: 'italic',
    textOverflow: 'visible',
    textWrap: false,
    align: 'left',
    verticalAlign: 'top',
};

function createFakeCanvas(measureWidth: (text: string) => number) {
    const context = {
        font: '',
        measureText: vi.fn((text: string) => ({ width: measureWidth(text) })),
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.fn((kind: string) => kind === '2d' ? context : null);
    const canvas = { getContext } as unknown as HTMLCanvasElement;
    const createCanvas = vi.fn(() => canvas);

    return { context, createCanvas, getContext };
}

const fixedLayout = (requiresClip: boolean): TextLayoutResult => ({
    lines: [
        { text: 'FIRST LINE', width: 54, x: 7, top: 8, baseline: 16 },
        { text: 'SECOND LINE', width: 60, x: 9, top: 18.8, baseline: 26.8 },
    ],
    effectiveFontSize: 9,
    lineHeight: 10.8,
    blockHeight: 21.6,
    truncated: false,
    requiresClip,
});

function createFakeLayoutSession(
    result: TextLayoutResult | ((request: TextLayoutRequest) => TextLayoutResult | null) = fixedLayout(true),
) {
    const layout = vi.fn((request: TextLayoutRequest, _context: string) =>
        typeof result === 'function' ? result(request) : result,
    );
    const clear = vi.fn();
    const session: CanvasTextLayoutSession = { layout, clear };
    return { session, layout, clear };
}

const fixedElement = (overrides: Partial<TemplateElement> = {}): TemplateElement => ({
    id: 'fixed-text',
    type: 'text',
    x: 12,
    y: 14,
    w: 123,
    h: 45,
    rotation: 27,
    fill: '#f8fafc',
    stroke: '#334155',
    strokeWidth: 1,
    opacity: 0.8,
    zIndex: 4,
    text: 'SOURCE TEXT',
    dataBinding: 'label',
    fontSize: 17,
    fontFamily: 'open-sans',
    fontWeight: 'bold',
    fontStyle: 'italic',
    textDecoration: 'underline',
    textColor: '#123456',
    ...overrides,
});

const canvasElementProps = {
    selected: false,
    nodes,
    currentNodeId: 'root',
    tool: 'select',
    showHandles: false,
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Canvas text measurement session', () => {
    it('defers and reuses one context with matching CSS font resolution and cached widths', () => {
        const fake = createFakeCanvas(text => text.length * 2);
        const session = createCanvasTextLayoutSession({
            sessionIdentity: 'canvas-test',
            createCanvas: fake.createCanvas,
        });

        expect(fake.createCanvas).not.toHaveBeenCalled();

        expect(session.layout(baseRequest, 'first element')).not.toBeNull();
        expect(session.layout({ ...baseRequest, align: 'right' }, 'second element')).not.toBeNull();
        expect(session.layout({ ...baseRequest, text: 'different' }, 'third element')).not.toBeNull();

        expect(fake.createCanvas).toHaveBeenCalledTimes(1);
        expect(fake.getContext).toHaveBeenCalledTimes(1);
        expect(fake.getContext).toHaveBeenCalledWith('2d');
        expect(fake.context.font).toBe('italic bold 17px "Open Sans", sans-serif');
        expect(fake.context.measureText).toHaveBeenCalledTimes(2);
        expect(resolveCanvasFontFamily('open-sans')).toBe('"Open Sans", sans-serif');
        expect(resolveCanvasFontFamily('Custom Font')).toBe('Custom Font');
    });

    it('evicts the least-recently-used width after 20,000 entries', () => {
        const fake = createFakeCanvas(() => 1);
        const session = createCanvasTextLayoutSession({
            sessionIdentity: 'bounded-test',
            createCanvas: fake.createCanvas,
        });

        for (let index = 0; index <= 20_000; index += 1) {
            session.layout({ ...baseRequest, text: `text-${index}` }, `element ${index}`);
        }
        session.layout(baseRequest, 'first element again');

        expect(fake.context.measureText).toHaveBeenCalledTimes(20_002);
    });

    it('warns once with context and skips malformed measurements', () => {
        const fake = createFakeCanvas(() => Number.NaN);
        const warn = vi.fn();
        const session = createCanvasTextLayoutSession({
            sessionIdentity: 'malformed-test',
            createCanvas: fake.createCanvas,
            warn,
        });

        expect(session.layout(baseRequest, 'text element alpha')).toBeNull();
        expect(session.layout({ ...baseRequest, text: 'again' }, 'text element beta')).toBeNull();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            '[CanvasTextLayout] Skipped text element alpha',
            expect.objectContaining({ name: 'TextMeasurementError' }),
        );
    });

    it('warns once and continues when the Canvas context throws', () => {
        const error = new Error('context failed');
        const getContext = vi.fn(() => {
            throw error;
        });
        const createCanvas = vi.fn(() => ({ getContext } as unknown as HTMLCanvasElement));
        const warn = vi.fn();
        const session = createCanvasTextLayoutSession({
            sessionIdentity: 'context-error-test',
            createCanvas,
            warn,
        });

        expect(session.layout(baseRequest, 'text element broken')).toBeNull();
        expect(session.layout({ ...baseRequest, text: 'again' }, 'text element later')).toBeNull();
        expect(createCanvas).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('[CanvasTextLayout] Skipped text element broken', error);
    });

    it('clears width and complete-layout caches', () => {
        const fake = createFakeCanvas(text => text.length);
        const session = createCanvasTextLayoutSession({
            sessionIdentity: 'clear-test',
            createCanvas: fake.createCanvas,
        });

        session.layout(baseRequest, 'before clear');
        session.clear();
        session.layout(baseRequest, 'after clear');

        expect(fake.context.measureText).toHaveBeenCalledTimes(2);
        expect(fake.createCanvas).toHaveBeenCalledTimes(1);
    });
});

describe('Canvas fixed text rendering', () => {
    it.each([
        ['clip', false],
        ['clip', true],
        ['ellipsis', false],
        ['ellipsis', true],
        ['shrink', false],
        ['shrink', true],
        ['visible', false],
        ['visible', true],
    ] as const)('renders explicit %s lines with wrap=%s', (textOverflow, textWrap) => {
        const fake = createFakeLayoutSession(request => fixedLayout(request.textOverflow !== 'visible'));
        const element = fixedElement({
            textOverflow,
            textWrap,
            textPadding: { top: 2, right: 5, bottom: 4, left: 3 },
        });
        const { container } = render(
            <CanvasElement element={element} textLayoutSession={fake.session} {...canvasElementProps} />,
        );

        expect(fake.layout).toHaveBeenCalledWith({
            text: 'RESOLVED TEXT',
            contentWidth: 115,
            contentHeight: 39,
            fontSize: 17,
            fontFamily: 'open-sans',
            fontWeight: 'bold',
            fontStyle: 'italic',
            textOverflow,
            textWrap,
            align: 'center',
            verticalAlign: 'middle',
        }, 'text element fixed-text');

        const lines = Array.from(container.querySelectorAll<HTMLElement>('[data-text-layout-line]'));
        expect(lines.map(line => line.textContent)).toEqual(['FIRST LINE', 'SECOND LINE']);
        expect(lines[0]).toHaveStyle({
            position: 'absolute',
            left: '7px',
            top: '8px',
            fontSize: '9px',
            lineHeight: '10.8px',
            whiteSpace: 'pre',
        });
        expect(lines[1]).toHaveStyle({ left: '9px', top: '18.8px' });

        const textContainer = lines[0].parentElement as HTMLElement;
        expect(textContainer).toHaveStyle({
            position: 'absolute',
            left: '3px',
            top: '2px',
            width: '115px',
            height: '39px',
            overflow: textOverflow === 'visible' ? 'visible' : 'hidden',
            padding: '0px',
            color: '#123456',
            fontFamily: '"Open Sans", sans-serif',
            fontWeight: 'bold',
            fontStyle: 'italic',
            textDecoration: 'underline',
        });
        expect(textContainer.style.whiteSpace).toBe('');
        expect(textContainer.style.transform).toBe('');

        const outer = container.querySelector<HTMLElement>('[data-element-id="fixed-text"]')!;
        expect(outer.style.transform).toBe('translate(12px, 14px) rotate(27deg)');
        expect(container.querySelectorAll('[style*="rotate(27deg)"]')).toHaveLength(1);
    });

    it('skips view-mode lines when padding exhausts either content axis', () => {
        const fake = createFakeLayoutSession(request => (
            request.contentWidth <= 0 || request.contentHeight <= 0 ? null : fixedLayout(true)
        ));
        const { container } = render(
            <CanvasElement
                element={fixedElement({ textPadding: { top: 50, right: 0, bottom: 0, left: 0 } })}
                textLayoutSession={fake.session}
                {...canvasElementProps}
            />,
        );
        expect(fake.layout).toHaveBeenCalledWith(
            expect.objectContaining({ contentWidth: 123, contentHeight: 0 }),
            expect.any(String),
        );
        expect(container.querySelectorAll('[data-text-layout-line]')).toHaveLength(0);
    });

    it('keeps line layout and local geometry invariant across render scales', () => {
        const fake = createFakeLayoutSession(fixedLayout(true));
        const rendered = [0.5, 1, 2].map(renderScale => render(
            <CanvasElement
                element={fixedElement()}
                textLayoutSession={fake.session}
                renderScale={renderScale}
                {...canvasElementProps}
            />,
        ));

        expect(fake.layout).toHaveBeenCalledTimes(3);
        expect(fake.layout.mock.calls.map(call => call[0])).toEqual([
            fake.layout.mock.calls[0][0],
            fake.layout.mock.calls[0][0],
            fake.layout.mock.calls[0][0],
        ]);
        const snapshots = rendered.map(({ container }) => Array.from(
            container.querySelectorAll<HTMLElement>('[data-text-layout-line]'),
            line => ({ text: line.textContent, cssText: line.style.cssText }),
        ));
        expect(snapshots[1]).toEqual(snapshots[0]);
        expect(snapshots[2]).toEqual(snapshots[0]);
    });

    it('leaves auto-width text and shape captions on the native rendering path', () => {
        const fake = createFakeLayoutSession();
        const { getByText } = render(
            <>
                <CanvasElement
                    element={fixedElement({ id: 'auto', autoWidth: true, dataBinding: undefined, text: 'AUTO WIDTH' })}
                    textLayoutSession={fake.session}
                    {...canvasElementProps}
                />
                <CanvasElement
                    element={fixedElement({ id: 'rect', type: 'rect', dataBinding: undefined, text: 'UNCHANGED CAPTION' })}
                    textLayoutSession={fake.session}
                    {...canvasElementProps}
                />
                <CanvasElement
                    element={fixedElement({ id: 'triangle', type: 'triangle', dataBinding: undefined, text: 'TRIANGLE CAPTION' })}
                    textLayoutSession={fake.session}
                    {...canvasElementProps}
                />
            </>,
        );

        const autoWidthNode = getByText('AUTO WIDTH');
        const shapeCaption = getByText('UNCHANGED CAPTION');
        expect(fake.layout).not.toHaveBeenCalled();
        expect(autoWidthNode).toHaveStyle({ whiteSpace: 'pre', overflow: 'visible' });
        expect(shapeCaption).toHaveTextContent('UNCHANGED CAPTION');
        expect(getByText('TRIANGLE CAPTION')).toHaveStyle({ whiteSpace: 'pre-wrap' });
    });

    it('hides committed lines while preserving the full OverlayTextEditor source', () => {
        const fake = createFakeLayoutSession({
            ...fixedLayout(true),
            lines: [{ text: 'COMMITTED LINE', width: 60, x: 0, top: 0, baseline: 8 }],
        });
        const element = makeEl('editing-text', {
            type: 'text',
            w: 120,
            h: 40,
            text: 'FULL SOURCE TEXT',
            fontSize: 12,
            layerId: 'base',
            textPadding: { top: 3, right: 4, bottom: 5, left: 6 },
        });
        const { container } = renderCanvas([element], [makeLayer('base', 0)], {
            textLayoutSession: fake.session,
        });

        fireEvent.doubleClick(screen.getByText('COMMITTED LINE'));

        const committedLine = container.querySelector<HTMLElement>('[data-text-layout-line]')!;
        expect(committedLine.parentElement).toHaveStyle({ opacity: '0' });
        expect(screen.getByTestId('overlay-text-editor-box')).toHaveStyle({
            left: '6px', top: '3px', width: '110px', height: '32px',
        });
        expect(screen.getByTestId('overlay-text-editor')).toHaveTextContent('FULL SOURCE TEXT');
    });
});

describe('Canvas text layout session hook', () => {
    it('clears fallback measurements when fonts became ready before the listener attached', async () => {
        const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
        const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
        Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
        const fakeCanvas = createFakeCanvas(() => 42);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            () => fakeCanvas.context,
        );
        let renderCount = 0;

        try {
            const { result, unmount } = renderHook(() => {
                renderCount += 1;
                return useCanvasTextLayoutSession();
            });
            const session = result.current;

            session.layout(baseRequest, 'fallback measurement');
            expect(fakeCanvas.context.measureText).toHaveBeenCalledTimes(1);

            await act(async () => {
                await fonts.ready;
            });

            expect(renderCount).toBe(2);
            expect(result.current).toBe(session);
            session.layout(baseRequest, 'loaded font measurement');
            expect(fakeCanvas.context.measureText).toHaveBeenCalledTimes(2);
            unmount();
        } finally {
            if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
            else Reflect.deleteProperty(document, 'fonts');
        }
    });

    it('clears and rerenders after fonts load, then removes its listener on unmount', () => {
        const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
        const fonts = new EventTarget();
        const addEventListener = vi.spyOn(fonts, 'addEventListener');
        const removeEventListener = vi.spyOn(fonts, 'removeEventListener');
        Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
        const fakeCanvas = createFakeCanvas(() => 42);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            () => fakeCanvas.context,
        );
        let renderCount = 0;

        try {
            const { result, unmount } = renderHook(() => {
                renderCount += 1;
                return useCanvasTextLayoutSession();
            });
            const session = result.current;

            session.layout(baseRequest, 'before font load');
            session.layout(baseRequest, 'cached before font load');
            expect(fakeCanvas.context.measureText).toHaveBeenCalledTimes(1);

            act(() => fonts.dispatchEvent(new Event('loadingdone')));
            expect(renderCount).toBe(2);
            expect(result.current).toBe(session);
            session.layout(baseRequest, 'after font load');
            expect(fakeCanvas.context.measureText).toHaveBeenCalledTimes(2);

            unmount();
            expect(addEventListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
            expect(removeEventListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
            fonts.dispatchEvent(new Event('loadingdone'));
            session.layout(baseRequest, 'after unmount');
            expect(fakeCanvas.context.measureText).toHaveBeenCalledTimes(3);
        } finally {
            if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
            else Reflect.deleteProperty(document, 'fonts');
        }
    });

    it('keeps one lazily-created session when the Font Loading API is unavailable', () => {
        const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
        Reflect.deleteProperty(document, 'fonts');

        try {
            const { result, rerender } = renderHook(() => useCanvasTextLayoutSession());
            const firstSession = result.current;
            rerender();
            expect(result.current).toBe(firstSession);
        } finally {
            if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
        }
    });
});
