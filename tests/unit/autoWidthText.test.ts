import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureAutoWidthText } from '../../services/autoWidthText';

afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

describe('measureAutoWidthText', () => {
    it('applies Canvas typography and returns buffered dimensions without mutation', () => {
        const appended: HTMLElement[] = [];
        vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
            appended.push(node as HTMLElement);
            return HTMLElement.prototype.appendChild.call(document.body, node) as HTMLElement;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(41.2);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(18.1);
        const element = {
            fontSize: 17, fontFamily: 'open-sans',
            fontWeight: 'bold' as const, fontStyle: 'italic' as const,
        };
        const before = { ...element };

        expect(measureAutoWidthText('Alpha', element)).toEqual({ w: 67, h: 20 });
        expect(element).toEqual(before);
        expect(appended).toHaveLength(1);
        expect(appended[0].textContent).toBe('Alpha');
        expect(appended[0].style).toMatchObject({
            position: 'absolute', visibility: 'hidden', display: 'inline-block',
            whiteSpace: 'pre', padding: '0px', fontSize: '17px',
            fontFamily: '"Open Sans", sans-serif', fontWeight: 'bold',
            fontStyle: 'italic', lineHeight: '1.2',
        });
        expect(document.body.contains(appended[0])).toBe(false);
    });

    it('uses Canvas typography defaults when element typography is omitted', () => {
        const appended: HTMLElement[] = [];
        vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
            appended.push(node as HTMLElement);
            return HTMLElement.prototype.appendChild.call(document.body, node) as HTMLElement;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10);

        expect(measureAutoWidthText('Alpha', {})).toEqual({ w: 35, h: 20 });
        expect(appended[0].style).toMatchObject({
            fontSize: '12px', fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 'normal', fontStyle: 'normal', lineHeight: '1.2',
        });
    });

    it('retains explicit newlines and measures a single space for empty text', () => {
        const measuredText: string[] = [];
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
            measuredText.push(this.textContent || '');
            return (this.textContent || '').split('\n').reduce((max, line) => Math.max(max, line.length), 0) * 8;
        });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
            return (this.textContent || '').split('\n').length * 14;
        });

        expect(measureAutoWidthText('a\nbb', { fontSize: 12 })).toEqual({ w: 41, h: 28 });
        expect(measureAutoWidthText('', { fontSize: 12 })).toEqual({ w: 33, h: 20 });
        expect(measuredText).toEqual(['a\nbb', ' ']);
    });

    it('removes the probe when metric access throws', () => {
        const before = document.body.childElementCount;
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => {
            throw new Error('layout unavailable');
        });
        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toBeNull();
        expect(document.body.childElementCount).toBe(before);
    });

    it('retries parent removal when probe removal silently leaves it attached', () => {
        const sibling = document.createElement('div');
        document.body.appendChild(sibling);
        const before = document.body.childElementCount;
        const probe = document.createElement('div');
        vi.spyOn(document, 'createElement').mockReturnValue(probe);
        vi.spyOn(probe, 'remove').mockImplementation(() => {});
        const removeChild = vi.spyOn(document.body, 'removeChild');
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10);

        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toEqual({ w: 35, h: 20 });
        expect(removeChild).toHaveBeenCalledWith(probe);
        expect(document.body.childElementCount).toBe(before);
        expect(Array.from(document.body.children)).toEqual([sibling]);
        expect(probe.parentNode).toBeNull();
    });

    it('uses native detachment when instance removal methods throw without removing siblings', () => {
        const sibling = document.createElement('div');
        document.body.appendChild(sibling);
        const before = document.body.childElementCount;
        const probe = document.createElement('div');
        vi.spyOn(document, 'createElement').mockReturnValue(probe);
        vi.spyOn(probe, 'remove').mockImplementation(() => { throw new Error('remove failed'); });
        const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {
            throw new Error('instance removeChild failed');
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10);

        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toEqual({ w: 35, h: 20 });
        expect(removeChild).toHaveBeenCalledWith(probe);
        expect(document.body.childElementCount).toBe(before);
        expect(Array.from(document.body.children)).toEqual([sibling]);
        expect(probe.parentNode).toBeNull();
    });

    it('uses the captured native detachment when the live Node prototype is replaced', () => {
        const sibling = document.createElement('div');
        document.body.appendChild(sibling);
        const before = document.body.childElementCount;
        const probe = document.createElement('div');
        vi.spyOn(document, 'createElement').mockReturnValue(probe);
        vi.spyOn(probe, 'remove').mockImplementation(() => { throw new Error('remove failed'); });
        const removeChild = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(() => {
            throw new Error('live prototype removeChild failed');
        });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(10);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(10);

        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toEqual({ w: 35, h: 20 });
        expect(removeChild).toHaveBeenCalledWith(probe);
        expect(document.body.childElementCount).toBe(before);
        expect(Array.from(document.body.children)).toEqual([sibling]);
        expect(probe.parentNode).toBeNull();
    });

    it.each([
        [Number.NaN, 10],
        [Number.POSITIVE_INFINITY, 10],
        [-30, 10],
        [-1, 10],
        [10, Number.NaN],
        [10, -1],
    ])('rejects unsafe metrics width=%s height=%s', (width, height) => {
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
        expect(measureAutoWidthText('Alpha', { fontSize: 12 })).toBeNull();
        expect(document.body.childElementCount).toBe(0);
    });

    it('returns null when DOM creation or attachment fails', () => {
        const createFailure = {
            body: document.body,
            createElement: () => { throw new Error('creation failed'); },
        } as unknown as Document;
        expect(measureAutoWidthText('Alpha', { fontSize: 12 }, createFailure)).toBeNull();

        const attachmentFailure = {
            createElement: document.createElement.bind(document),
            body: { appendChild: () => { throw new Error('attachment failed'); } },
        } as unknown as Document;
        expect(measureAutoWidthText('Alpha', { fontSize: 12 }, attachmentFailure)).toBeNull();
    });
});
