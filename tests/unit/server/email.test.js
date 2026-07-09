// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail, setSendEmailImpl } from '../../../server/email.js';

describe('sendEmail', () => {
    beforeEach(() => { delete process.env.RESEND_API_KEY; });
    afterEach(() => { setSendEmailImpl(null); vi.restoreAllMocks(); });

    it('uses the injected implementation when set', async () => {
        const impl = vi.fn(async () => ({ id: 'injected' }));
        setSendEmailImpl(impl);
        const res = await sendEmail({ to: 'a@b.dev', subject: 's', html: '<p>x</p>', text: 'x' });
        expect(res).toEqual({ id: 'injected' });
        expect(impl).toHaveBeenCalledWith({ to: 'a@b.dev', subject: 's', html: '<p>x</p>', text: 'x' });
    });

    it('falls back to console logging when RESEND_API_KEY is unset', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await sendEmail({ to: 'a@b.dev', subject: 'Verify', html: '<a href="http://x/verify">v</a>', text: 'http://x/verify' });
        expect(res).toEqual({ fallback: true });
        const logged = warn.mock.calls.flat().join('\n');
        expect(logged).toContain('a@b.dev');
        expect(logged).toContain('http://x/verify'); // the link must be recoverable from logs
    });

    it('POSTs to Resend when RESEND_API_KEY is set', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        process.env.EMAIL_FROM = 'App <auth@app.dev>';
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 })
        );
        const res = await sendEmail({ to: 'a@b.dev', subject: 's', html: '<p>x</p>' });
        expect(res).toEqual({ id: 'resend-1' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.headers.Authorization).toBe('Bearer test-key');
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ from: 'App <auth@app.dev>', to: 'a@b.dev', subject: 's' });
    });

    it('throws loudly on a Resend error response', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
        await expect(sendEmail({ to: 'a@b.dev', subject: 's', html: 'x' })).rejects.toThrow(/403/);
    });
});
