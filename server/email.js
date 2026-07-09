// Outbound email. Real delivery via Resend's HTTP API (plain fetch, no SDK).
// Fail-safe: no RESEND_API_KEY => log the message (incl. any links) to the
// console and resolve. This keeps dev working with zero setup while never
// weakening auth: callers treat email as sent either way, and sign-in
// verification blocking is enforced independently of delivery.

let injectedImpl = null;

/** Test hook: replace delivery. Pass null to restore real behavior. */
export const setSendEmailImpl = (fn) => { injectedImpl = fn; };

export async function sendEmail({ to, subject, html, text }) {
    if (injectedImpl) return injectedImpl({ to, subject, html, text });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn(`[email] RESEND_API_KEY not set — NOT delivering to ${to}. Subject: ${subject}`);
        console.warn(`[email] Body:\n${text || html}`);
        return { fallback: true };
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'PDF Architect <onboarding@resend.dev>',
            to,
            subject,
            html,
            text,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`[email] Resend request failed: ${res.status} ${body}`);
    }
    return res.json();
}
