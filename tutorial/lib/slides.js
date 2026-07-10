// Title-card slides rendered in-browser between chapters. Kept as data: URLs
// so the recorder needs no extra server.
const slideHtml = (title, subtitle, accent = '#2563eb') => `<!doctype html>
<html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
    body { display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 30% 20%, #1e293b, #0f172a 70%); color: white; }
    .card { text-align: center; max-width: 1100px; padding: 0 60px; }
    .brand { display: inline-flex; align-items: center; gap: 14px; font-weight: 700;
        font-size: 28px; color: #cbd5e1; margin-bottom: 48px; }
    .logo { width: 44px; height: 44px; background: ${accent}; border-radius: 12px;
        display: inline-flex; align-items: center; justify-content: center; font-size: 24px; }
    h1 { font-size: 74px; margin: 0 0 24px; letter-spacing: -0.02em; line-height: 1.05; }
    p { font-size: 30px; color: #94a3b8; margin: 0; line-height: 1.4; }
</style></head><body><div class="card">
    <div class="brand"><span class="logo">▦</span> PDF Architect Tutorials</div>
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
</div></body></html>`;

export async function showSlide(page, title, subtitle) {
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(slideHtml(title, subtitle)));
    await page.waitForTimeout(400);
}
